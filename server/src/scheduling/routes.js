import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  User,
  Patient,
  Doctor,
  Department,
  Session,
  Appointment,
  AppointmentSlot,
  DoctorSchedule,
  audit,
  publicUser,
} from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { parse, objectId, pageSchema } from '../validation.js';
import {
  availabilityQuery,
  directoryQuery,
  scheduleCreateSchema,
  schedulesQuery,
  reasonSchema,
  bookingSchema,
  appointmentsQuery,
  rescheduleSchema,
  patientSearchQuery,
  walkInSchema,
  intakeUpdateSchema,
  staffUpdateSchema,
} from './validation.js';
import { dayBounds, hospitalDate, hospitalTimezone } from './time.js';
import {
  createSchedule,
  closeSchedule,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  checkInAppointment,
  appointmentScope,
  lockDoctors,
  openStatuses,
} from './service.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const staffAccess = allowRoles('admin', 'receptionist');

async function activeDoctors() {
  const [users, departments] = await Promise.all([
    User.find({ role: 'doctor', isActive: true }).select('_id'),
    Department.find({ isActive: true }).select('_id'),
  ]);
  return {
    user: { $in: users.map((u) => u._id) },
    department: { $in: departments.map((d) => d._id) },
  };
}
function doctorResponse(doctor) {
  return {
    id: doctor._id,
    name: doctor.user.name,
    department: doctor.department,
    specialization: doctor.specialization,
    qualification: doctor.qualification,
    consultationFeeMinor: doctor.consultationFeeMinor,
  };
}
async function appointmentResponse(item, actor, detail = false) {
  // Never populate complete User documents into API results.
  const patient = await Patient.findById(item.patient).populate('user', 'name email phone').lean();
  const patientSummary = patient
    ? {
        id: patient._id,
        name: patient.user?.name ?? 'Patient',
        ...(actor.role !== 'patient'
          ? {
              email: patient.user?.email,
              phone: patient.user?.phone,
              dateOfBirth: patient.dateOfBirth,
            }
          : {}),
      }
    : null;
  if (detail && actor.role === 'doctor' && item.status !== 'Cancelled' && patientSummary) {
    patientSummary.allergies = patient.allergies;
    patientSummary.bloodType = patient.bloodType;
  }
  return {
    id: item._id,
    reference: item.reference,
    patient: patientSummary,
    doctor: item.doctor,
    doctorName: item.doctorName,
    departmentName: item.departmentName,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    consultationFeeMinor: item.consultationFeeMinor,
    reason: item.reason,
    status: item.status,
    checkedInAt: item.checkedInAt,
    cancelledAt: item.cancelledAt,
    cancellationReason: item.cancellationReason,
    ...(detail
      ? {
          history: item.history.map((h) => ({
            action: h.action,
            at: h.at,
            fromStartsAt: h.fromStartsAt,
            toStartsAt: h.toStartsAt,
            fromDoctorName: h.fromDoctorName,
            toDoctorName: h.toDoctorName,
            reason: h.reason,
          })),
        }
      : {}),
  };
}

export function schedulingRouter() {
  const router = Router();
  router.get('/directory/departments', async (req, res) => {
    const { page, limit } = parse(pageSchema, req.query);
    const filter = { isActive: true };
    const [items, total] = await Promise.all([
      Department.find(filter)
        .select('name description')
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Department.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  });
  router.get('/directory/doctors', async (req, res) => {
    const { page, limit, department, search } = parse(directoryQuery, req.query);
    const filter = await activeDoctors();
    if (department)
      filter.department = { $in: filter.department.$in.filter((id) => String(id) === department) };
    if (search) {
      const names = await User.find({
        _id: filter.user,
        name: { $regex: escapeRegex(search), $options: 'i' },
      }).select('_id');
      filter.$or = [
        { user: { $in: names.map((n) => n._id) } },
        { specialization: { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }
    const [doctors, total] = await Promise.all([
      Doctor.find(filter)
        .populate('user', 'name')
        .populate('department', 'name')
        .sort({ _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Doctor.countDocuments(filter),
    ]);
    res.json({ items: doctors.map(doctorResponse), total, page, limit });
  });
  router.get('/directory/doctors/:id/availability', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const { date } = parse(availabilityQuery, req.query);
    const doctor = await Doctor.findOne({ _id: id, ...(await activeDoctors()) })
      .populate('user', 'name')
      .populate('department', 'name')
      .lean();
    if (!doctor) throw httpError(404, 'Available doctor not found.');
    const { start, end } = dayBounds(date);
    const slots = await AppointmentSlot.find({
      doctor: id,
      isActive: true,
      startsAt: { $gte: start, $lt: end, $gt: new Date() },
    })
      .sort({ startsAt: 1 })
      .select('_id startsAt endsAt')
      .lean();
    const reservations = await Appointment.find({
      slot: { $in: slots.map((s) => s._id) },
      holdsSlot: true,
    })
      .select('slot')
      .lean();
    const held = new Set(reservations.map((a) => String(a.slot)));
    res.json({
      doctor: doctorResponse(doctor),
      date,
      timezone: hospitalTimezone,
      slots: slots
        .filter((s) => !held.has(String(s._id)))
        .map((s) => ({ id: s._id, startsAt: s.startsAt, endsAt: s.endsAt })),
    });
  });

  router.get('/schedules', allowRoles('admin', 'doctor'), async (req, res) => {
    const { page, limit, doctor, date } = parse(schedulesQuery, req.query);
    const filter = {};
    if (req.user.role === 'doctor') {
      const own = await Doctor.findOne({ user: req.user._id });
      if (doctor && doctor !== String(own?._id))
        throw httpError(403, 'You can view only your own sessions.');
      filter.doctor = own?._id ?? null;
    } else if (doctor) filter.doctor = doctor;
    if (date) filter.date = date;
    else filter.endsAt = { $gt: new Date() };
    const [items, total] = await Promise.all([
      DoctorSchedule.find(filter)
        .populate({ path: 'doctor', select: 'user', populate: { path: 'user', select: 'name' } })
        .sort({ startsAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DoctorSchedule.countDocuments(filter),
    ]);
    const ids = items.map((i) => i._id);
    const counts = await Appointment.aggregate([
      { $match: { schedule: { $in: ids }, status: { $in: openStatuses } } },
      { $group: { _id: '$schedule', count: { $sum: 1 } } },
    ]);
    res.json({
      items: items.map((i) => ({
        id: i._id,
        doctor: i.doctor?._id,
        doctorName: i.doctor?.user?.name ?? 'Doctor',
        date: i.date,
        startsAt: i.startsAt,
        endsAt: i.endsAt,
        slotMinutes: i.slotMinutes,
        capacity: (i.endsAt - i.startsAt) / (60000 * i.slotMinutes),
        isActive: i.isActive,
        closedReason: i.closedReason,
        booked: counts.find((c) => String(c._id) === String(i._id))?.count ?? 0,
      })),
      total,
      page,
      limit,
      timezone: hospitalTimezone,
    });
  });
  router.post('/schedules', allowRoles('admin'), async (req, res) =>
    res
      .status(201)
      .json({ schedule: await createSchedule(parse(scheduleCreateSchema, req.body), req.user) }),
  );
  router.post('/schedules/:id/close', allowRoles('admin'), async (req, res) => {
    await closeSchedule(
      parse(objectId, req.params.id),
      parse(reasonSchema, req.body).reason,
      req.user,
    );
    res.json({ message: 'Session closed. Its remaining slots are unavailable.' });
  });

  router.post('/appointments', allowRoles('patient', 'receptionist', 'admin'), async (req, res) => {
    const appointment = await bookAppointment(parse(bookingSchema, req.body), req.user);
    res.status(201).json({ appointment: await appointmentResponse(appointment, req.user, true) });
  });
  router.get('/appointments', async (req, res) => {
    const { page, limit, doctor, patient, date, status, view } = parse(
      appointmentsQuery,
      req.query,
    );
    const filter = await appointmentScope(req.user);
    if (doctor) {
      if (req.user.role === 'doctor' && String(filter.doctor) !== doctor)
        throw httpError(403, 'You can view only your own appointments.');
      filter.doctor = doctor;
    }
    if (patient) {
      if (req.user.role === 'patient' && String(filter.patient) !== patient)
        throw httpError(403, 'You can view only your own appointments.');
      filter.patient = patient;
    }
    const now = new Date();
    if (view === 'upcoming') {
      filter.startsAt = { $gte: now };
      filter.status = { $in: openStatuses };
    }
    if (view === 'history')
      filter.$or = [{ startsAt: { $lt: now } }, { status: { $in: ['Cancelled', 'Completed'] } }];
    if (date) {
      const { start, end } = dayBounds(date);
      filter.startsAt = { $gte: view === 'upcoming' && now > start ? now : start, $lt: end };
    }
    if (status) {
      if (view === 'upcoming' && !openStatuses.includes(status)) filter._id = null;
      filter.status = status;
    }
    const [items, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ startsAt: view === 'history' ? -1 : 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(filter),
    ]);
    res.json({
      items: await Promise.all(items.map((item) => appointmentResponse(item, req.user))),
      total,
      page,
      limit,
      timezone: hospitalTimezone,
    });
  });
  router.get('/appointments/:id', async (req, res) => {
    const item = await Appointment.findOne({
      _id: parse(objectId, req.params.id),
      ...(await appointmentScope(req.user)),
    }).lean();
    if (!item) throw httpError(404, 'Appointment not found.');
    res.json({ appointment: await appointmentResponse(item, req.user, true) });
  });
  router.post(
    '/appointments/:id/cancel',
    allowRoles('patient', 'receptionist', 'admin'),
    async (req, res) => {
      const item = await cancelAppointment(
        parse(objectId, req.params.id),
        parse(reasonSchema, req.body).reason,
        req.user,
      );
      res.json({ appointment: await appointmentResponse(item, req.user, true) });
    },
  );
  router.post('/appointments/:id/reschedule', staffAccess, async (req, res) => {
    const item = await rescheduleAppointment(
      parse(objectId, req.params.id),
      parse(rescheduleSchema, req.body),
      req.user,
    );
    res.json({ appointment: await appointmentResponse(item, req.user, true) });
  });
  router.post('/appointments/:id/check-in', staffAccess, async (req, res) => {
    if (req.body && Object.keys(req.body).length)
      throw httpError(400, 'Check-in does not accept additional fields.');
    const item = await checkInAppointment(parse(objectId, req.params.id), req.user);
    res.json({ appointment: await appointmentResponse(item, req.user, true) });
  });

  router.get('/reception/patients', staffAccess, async (req, res) => {
    const { page, limit, search } = parse(patientSearchQuery, req.query);
    const match = { $regex: escapeRegex(search), $options: 'i' };
    const filter = {
      role: 'patient',
      isActive: true,
      $or: [{ name: match }, { email: match }, { phone: match }],
    };
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    const profiles = await Patient.find({ user: { $in: users.map((u) => u._id) } }).lean();
    res.json({
      items: profiles.map((p) => ({
        id: p._id,
        dateOfBirth: p.dateOfBirth,
        user: publicUser(users.find((u) => String(u._id) === String(p.user))),
      })),
      total,
      page,
      limit,
    });
  });
  router.get('/reception/patients/:id', staffAccess, async (req, res) => {
    const profile = await Patient.findById(parse(objectId, req.params.id)).lean();
    if (!profile) throw httpError(404, 'Patient not found.');
    const user = await User.findById(profile.user);
    res.json({ profile, user: publicUser(user) });
  });
  router.post('/reception/patients', staffAccess, async (req, res) => {
    const data = parse(walkInSchema, req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    let user, profile;
    await mongoose.connection.transaction(async (session) => {
      [user] = await User.create(
        [{ name: data.name, email: data.email, phone: data.phone, passwordHash, role: 'patient' }],
        { session },
      );
      const { dateOfBirth, gender, bloodType, allergies, address, emergencyContact } = data;
      [profile] = await Patient.create(
        [{ user: user._id, dateOfBirth, gender, bloodType, allergies, address, emergencyContact }],
        { session },
      );
      await audit(req.user._id, 'walk_in_registered', 'patients', profile._id, session);
    });
    res.status(201).json({ profile, user: publicUser(user) });
  });
  router.patch('/reception/patients/:id', staffAccess, async (req, res) => {
    const id = parse(objectId, req.params.id),
      data = parse(intakeUpdateSchema, req.body);
    let profile, user;
    await mongoose.connection.transaction(async (session) => {
      profile = await Patient.findById(id).session(session);
      if (!profile) throw httpError(404, 'Patient not found.');
      user = await User.findByIdAndUpdate(
        profile.user,
        { $set: { name: data.name, phone: data.phone } },
        { returnDocument: 'after', runValidators: true, session },
      );
      const { dateOfBirth, gender, bloodType, allergies, address, emergencyContact } = data;
      Object.assign(profile, {
        dateOfBirth,
        gender,
        bloodType,
        allergies,
        address,
        emergencyContact,
      });
      await profile.save({ session });
      await audit(req.user._id, 'patient_intake_updated', 'patients', id, session);
    });
    res.json({ profile, user: publicUser(user) });
  });

  router.patch('/admin/staff/:id', allowRoles('admin'), async (req, res) => {
    const id = parse(objectId, req.params.id),
      data = parse(staffUpdateSchema, req.body);
    let user;
    await mongoose.connection.transaction(async (session) => {
      user = await User.findOne({ _id: id, role: { $in: ['doctor', 'receptionist'] } }).session(
        session,
      );
      if (!user) throw httpError(404, 'Staff account not found.');
      if (user.role === 'doctor') {
        const doctor = await Doctor.findOne({ user: id }).session(session);
        await lockDoctors([doctor._id], session);
        if (
          !data.isActive &&
          (await Appointment.exists({ doctor: doctor._id, status: { $in: openStatuses } }).session(
            session,
          ))
        )
          throw httpError(
            409,
            'Move or cancel the doctor’s open appointments before deactivating the account.',
          );
        if (
          data.department &&
          !(await Department.exists({ _id: data.department, isActive: true }).session(session))
        )
          throw httpError(400, 'Choose an active department.');
        const updates = Object.fromEntries(
          ['department', 'specialization', 'qualification', 'consultationFeeMinor']
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]]),
        );
        await Doctor.updateOne(
          { _id: doctor._id },
          { $set: updates },
          { session, runValidators: true },
        );
      } else if (
        ['department', 'specialization', 'qualification', 'consultationFeeMinor'].some(
          (key) => data[key] !== undefined,
        )
      )
        throw httpError(400, 'Receptionists do not have doctor profile fields.');
      Object.assign(user, { name: data.name, phone: data.phone, isActive: data.isActive });
      await user.save({ session });
      if (!data.isActive) await Session.deleteMany({ user: id }, { session });
      await audit(req.user._id, 'staff_updated', 'staff', id, session);
    });
    res.json({ user: publicUser(user) });
  });

  router.get('/appointments-summary', async (req, res) => {
    const scope = await appointmentScope(req.user);
    const { start, end } = dayBounds(hospitalDate());
    const [today, waiting, upcoming, next] = await Promise.all([
      Appointment.countDocuments({
        ...scope,
        startsAt: { $gte: start, $lt: end },
        status: { $ne: 'Cancelled' },
      }),
      Appointment.countDocuments({
        ...scope,
        startsAt: { $gte: start, $lt: end },
        status: 'Waiting',
      }),
      Appointment.countDocuments({
        ...scope,
        startsAt: { $gte: new Date() },
        status: { $in: openStatuses },
      }),
      Appointment.find({ ...scope, startsAt: { $gte: new Date() }, status: { $in: openStatuses } })
        .sort({ startsAt: 1 })
        .limit(3)
        .lean(),
    ]);
    res.json({
      today,
      waiting,
      upcoming,
      next: await Promise.all(next.map((item) => appointmentResponse(item, req.user))),
      timezone: hospitalTimezone,
    });
  });
  return router;
}
