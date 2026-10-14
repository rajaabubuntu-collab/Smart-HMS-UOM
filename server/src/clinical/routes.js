import { dateSchema } from '../scheduling/validation.js';
import { appointmentNotice, notifyPatient } from '../notifications/service.js';
import { appointmentEmailDetails } from '../notifications/email-content.js';
import { Router } from 'express';
import { generateBill } from '../billing/service.js';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Appointment, Consultation, Doctor, Patient, audit } from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { parse, objectId, pageSchema } from '../validation.js';
import { lockDoctors } from '../scheduling/service.js';
import { dayBounds, hospitalDate } from '../scheduling/time.js';

const text = (n) => z.string().trim().max(n);
const medication = z
  .object({
    name: text(120).min(1),
    dosage: text(100).min(1),
    frequency: text(100).min(1),
    duration: text(100).min(1),
  })
  .strict();
const prescription = {
  medications: z.array(medication).max(20),
  noMedicationReason: text(500),
  reviewedAllergies: z.array(text(200)).max(50),
  allergiesReviewed: z.literal(true),
};
const draftSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    notes: text(5000),
    diagnosis: text(1000),
    treatment: text(2000),
    currentMedications: text(2000),
    ...prescription,
  })
  .strict();
const reviseSchema = z
  .object({ revision: z.number().int().nonnegative(), reason: text(500).min(1), ...prescription })
  .strict();
const empty = z.object({}).strict();
async function assigned(id, actor, session) {
  const doctor = await Doctor.findOne({ user: actor._id }).session(session || null);
  const appointment = await Appointment.findOne({
    _id: id,
    doctor: doctor?._id,
    status: { $ne: 'Cancelled' },
  }).session(session || null);
  if (!appointment) throw httpError(404, 'Consultation not found.');
  return appointment;
}
function allergyCheck(patient, data) {
  if (
    JSON.stringify([...patient.allergies].sort()) !==
    JSON.stringify([...data.reviewedAllergies].sort())
  )
    throw httpError(409, 'Allergy information changed. Reload the record and review it again.');
}
function prescriptionCheck(data) {
  if (!data.medications.length && !data.noMedicationReason)
    throw httpError(400, 'Add medication or explain why no medication is prescribed.');
  if (data.medications.length && data.noMedicationReason)
    throw httpError(400, 'Clear the no-medication reason when prescribing medication.');
}
export function clinicalRouter() {
  const router = Router();
  router.get('/clinical/queue', allowRoles('doctor'), async (req, res) => {
    const doctor = await Doctor.findOne({ user: req.user._id });
    const { start, end } = dayBounds(hospitalDate());
    const { page, limit } = parse(pageSchema, req.query);
    const filter = { doctor: doctor._id, status: { $in: ['Waiting', 'In Consultation'] } };
    const [statuses, queue, total] = await Promise.all([
      Appointment.aggregate([
        { $match: { doctor: doctor._id, startsAt: { $gte: start, $lt: end } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Appointment.find(filter)
        .sort({ checkedInAt: 1, startsAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('reference patient startsAt checkedInAt status')
        .populate({ path: 'patient', select: 'user', populate: { path: 'user', select: 'name' } })
        .lean(),
      Appointment.countDocuments(filter),
    ]);
    const byStatus = Object.fromEntries(statuses.map((item) => [item._id, item.count]));
    const counts = {
      total: statuses.reduce((sum, item) => sum + item.count, 0),
      completed: byStatus.Completed || 0,
      pending: ['Scheduled', 'Waiting', 'In Consultation'].reduce(
        (sum, status) => sum + (byStatus[status] || 0),
        0,
      ),
      cancelled: byStatus.Cancelled || 0,
    };
    res.json({
      queue: queue.map((a) => ({
        id: a._id,
        reference: a.reference,
        name: a.patient.user.name,
        startsAt: a.startsAt,
        checkedInAt: a.checkedInAt,
        status: a.status,
      })),
      counts,
      total,
      page,
      limit,
    });
  });
  router.get('/clinical/timeline', allowRoles('doctor'), async (req, res) => {
    const { date, page, limit } = parse(
      pageSchema.extend({ date: dateSchema.default(hospitalDate) }).strict(),
      req.query,
    );
    const doctor = await Doctor.findOne({ user: req.user._id });
    const { start, end } = dayBounds(date);
    const filter = { doctor: doctor._id, startsAt: { $gte: start, $lt: end } };
    const [items, total] = await Promise.all([
      Appointment.find(filter)
        .select('reference patient startsAt endsAt status')
        .sort({ startsAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate({ path: 'patient', select: 'user', populate: { path: 'user', select: 'name' } })
        .lean(),
      Appointment.countDocuments(filter),
    ]);
    res.json({
      items: items.map((a) => ({
        id: a._id,
        name: a.patient?.user?.name || 'Patient',
        reference: a.reference,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
      })),
      total,
      page,
      limit,
      date,
    });
  });
  router.get('/clinical/appointments/:id', allowRoles('doctor'), async (req, res) => {
    const appointment = await assigned(parse(objectId, req.params.id), req.user);
    const patient = await Patient.findById(appointment.patient)
      .populate('user', 'name phone email')
      .lean();
    const consultation = await Consultation.findOne({ appointment: appointment._id }).lean();
    await audit(req.user._id, 'clinical_record_viewed', 'clinical', appointment._id);
    res.json({ appointment, patient, consultation });
  });
  router.get('/clinical/history', allowRoles('patient', 'doctor'), async (req, res) => {
    const { appointment: id, ...pagination } = req.query;
    const { page, limit } = parse(pageSchema, pagination);
    let patient;
    if (req.user.role === 'doctor')
      patient = (await assigned(parse(objectId, id), req.user)).patient;
    else {
      if (id) throw httpError(400, 'Patients cannot select another appointment for history.');
      patient = (await Patient.findOne({ user: req.user._id }))._id;
    }
    const query = { patient, status: 'Completed' };
    const records = await Consultation.find(query)
      .sort({ completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('appointment', 'reference doctorName startsAt')
      .lean();
    await audit(req.user._id, 'medical_history_viewed', 'clinical', patient);
    res.json({ records, total: await Consultation.countDocuments(query), page, limit });
  });
  router.post('/clinical/appointments/:id/start', allowRoles('doctor'), async (req, res) => {
    const id = parse(objectId, req.params.id);
    parse(empty, req.body);
    await mongoose.connection.transaction(async (session) => {
      const initial = await assigned(id, req.user, session);
      await lockDoctors([initial.doctor], session);
      await Patient.findByIdAndUpdate(
        initial.patient,
        { $inc: { bookingRevision: 1 } },
        { session },
      );
      const appointment = await assigned(id, req.user, session);
      if (appointment.status !== 'Waiting')
        throw httpError(409, 'Only a waiting patient can start a consultation.');
      if (
        await Consultation.exists({
          status: 'Draft',
          $or: [{ doctor: appointment.doctor }, { patient: appointment.patient }],
        }).session(session)
      )
        throw httpError(409, 'The doctor or patient already has an active consultation.');
      await Consultation.create(
        [{ appointment: id, patient: appointment.patient, doctor: appointment.doctor }],
        { session },
      );
      appointment.status = 'In Consultation';
      appointment.history.push({ action: 'Consultation started', actor: req.user._id });
      await appointment.save({ session });
      await appointmentNotice(appointment, 'started', session);
      await audit(req.user._id, 'consultation_started', 'clinical', id, session);
    });
    res.status(201).json({ message: 'Consultation started.' });
  });
  for (const action of ['save', 'complete', 'prescription']) {
    router.post(`/clinical/appointments/:id/${action}`, allowRoles('doctor'), async (req, res) => {
      const id = parse(objectId, req.params.id);
      const data = parse(action === 'prescription' ? reviseSchema : draftSchema, req.body);
      let revision;
      await mongoose.connection.transaction(async (session) => {
        const appointment = await assigned(id, req.user, session);
        await lockDoctors([appointment.doctor], session);
        const patient = await Patient.findByIdAndUpdate(
          appointment.patient,
          { $inc: { bookingRevision: 1 } },
          { returnDocument: 'after', session },
        );
        const record = await Consultation.findOne({ appointment: id }).session(session);
        const requiredStatus = action === 'prescription' ? 'Completed' : 'Draft';
        if (
          !record ||
          record.status !== requiredStatus ||
          appointment.status !== (requiredStatus === 'Draft' ? 'In Consultation' : 'Completed')
        )
          throw httpError(409, 'This consultation cannot be changed in its current state.');
        if (record.revision !== data.revision)
          throw httpError(409, 'This record changed in another window. Reload before saving.');
        allergyCheck(patient, data);
        if (action !== 'save') prescriptionCheck(data);
        if (action === 'complete' && (!data.notes || !data.diagnosis))
          throw httpError(
            400,
            'Consultation notes and diagnosis are required to complete the visit.',
          );
        const { revision: _revision, allergiesReviewed: _reviewed, reason, ...fields } = data;
        Object.assign(record, fields);
        if (action !== 'save')
          record.prescriptions.push({
            at: new Date(),
            actor: req.user._id,
            reason: reason || 'Initial prescription',
            medications: data.medications,
            noMedicationReason: data.noMedicationReason,
            reviewedAllergies: data.reviewedAllergies,
          });
        if (action === 'complete') {
          record.status = 'Completed';
          record.completedAt = new Date();
          appointment.status = 'Completed';
          appointment.history.push({ action: 'Consultation completed', actor: req.user._id });
          await appointment.save({ session });
          await generateBill(appointment, req.user._id, session);
          await appointmentNotice(appointment, 'completed', session);
        }
        record.revision += 1;
        revision = record.revision;
        await record.save({ session });
        if (action === 'prescription')
          await notifyPatient(
            appointment.patient,
            {
              eventKey: `prescription:${record._id}:${record.revision}`,
              type: 'clinical',
              title: 'Prescription updated',
              message: `Your prescription record for ${appointment.reference} has been updated. Review the latest version in Medical records.`,
              path: '/records',
              email: appointmentEmailDetails(appointment, 'prescription_updated'),
            },
            session,
          );
        await audit(req.user._id, `consultation_${action}`, 'clinical', id, session);
      });
      res.json({
        revision,
        message:
          action === 'save'
            ? 'Draft saved.'
            : action === 'complete'
              ? 'Consultation completed.'
              : 'Prescription updated; previous versions retained.',
      });
    });
  }
  return router;
}
