import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Appointment, Feedback, Patient, audit } from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { objectId, pageSchema, parse } from '../validation.js';

const submitSchema = z
  .object({
    appointment: objectId,
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).default(''),
  })
  .strict();
const visitsSchema = pageSchema.extend({ appointment: objectId.optional() }).strict();
const adminSchema = pageSchema
  .extend({
    q: z.string().trim().max(100).default(''),
    rating: z.coerce.number().int().min(1).max(5).optional(),
  })
  .strict();
const ownFeedback = (record) => ({
  id: record._id,
  rating: record.rating,
  comment: record.comment,
  createdAt: record.createdAt,
});
async function patientFor(user) {
  const patient = await Patient.findOne({ user }).select('_id');
  if (!patient) throw httpError(404, 'Patient profile not found.');
  return patient;
}
export function feedbackRouter() {
  const router = Router();
  router.get('/feedback/visits', allowRoles('patient'), async (req, res) => {
    const { page, limit, appointment } = parse(visitsSchema, req.query);
    const patient = await patientFor(req.user._id);
    const query = {
      patient: patient._id,
      status: 'Completed',
      ...(appointment ? { _id: appointment } : {}),
    };
    const visits = await Appointment.find(query)
      .sort({ startsAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('_id reference doctorName departmentName startsAt')
      .lean();
    const feedback = await Feedback.find({
      patient: patient._id,
      appointment: { $in: visits.map((v) => v._id) },
    }).lean();
    const byVisit = new Map(feedback.map((f) => [String(f.appointment), ownFeedback(f)]));
    res.json({
      records: visits.map((v) => ({
        id: v._id,
        reference: v.reference,
        doctorName: v.doctorName,
        departmentName: v.departmentName,
        startsAt: v.startsAt,
        feedback: byVisit.get(String(v._id)) || null,
      })),
      total: await Appointment.countDocuments(query),
      page,
      limit,
    });
  });
  router.post('/feedback', allowRoles('patient'), async (req, res) => {
    const data = parse(submitSchema, req.body);
    const patient = await patientFor(req.user._id);
    let feedback;
    try {
      await mongoose.connection.transaction(async (session) => {
        const visit = await Appointment.findOne({
          _id: data.appointment,
          patient: patient._id,
        }).session(session);
        if (!visit) throw httpError(404, 'Appointment not found.');
        // Completed is terminal in the appointment workflow and is set by consultation completion.
        if (visit.status !== 'Completed')
          throw httpError(409, 'Feedback is available after the consultation is completed.');
        if (await Feedback.exists({ appointment: visit._id }).session(session))
          throw httpError(409, 'Feedback has already been submitted for this appointment.');
        [feedback] = await Feedback.create(
          [
            {
              appointment: visit._id,
              patient: patient._id,
              doctor: visit.doctor,
              appointmentReference: visit.reference,
              patientName: req.user.name,
              doctorName: visit.doctorName,
              departmentName: visit.departmentName,
              visitAt: visit.startsAt,
              rating: data.rating,
              comment: data.comment,
            },
          ],
          { session },
        );
        await audit(req.user._id, 'feedback_submitted', 'feedback', feedback._id, session);
      });
    } catch (err) {
      if (err.code === 11000)
        throw httpError(409, 'Feedback has already been submitted for this appointment.');
      throw err;
    }
    res.status(201).json({ feedback: ownFeedback(feedback) });
  });
  router.get('/admin/feedback', allowRoles('admin'), async (req, res) => {
    const { page, limit, q, rating } = parse(adminSchema, req.query);
    const query = { ...(rating ? { rating } : {}) };
    if (q) {
      // Treat search as literal text, including regex metacharacters.
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        'patientName',
        'doctorName',
        'departmentName',
        'appointmentReference',
        'comment',
      ].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const records = await Feedback.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v')
      .lean();
    res.json({ records, total: await Feedback.countDocuments(query), page, limit });
  });
  return router;
}
