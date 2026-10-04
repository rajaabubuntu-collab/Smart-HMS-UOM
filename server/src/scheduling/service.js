import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import {
  Doctor,
  User,
  Department,
  Patient,
  DoctorSchedule,
  AppointmentSlot,
  Appointment,
  audit,
} from '../models.js';
import { httpError } from '../auth.js';
import { hospitalDate, localInstant, inBookingHorizon } from './time.js';

export const openStatuses = ['Scheduled', 'Waiting', 'In Consultation'];

// A shared document write serialises schedule changes and bookings, avoiding
// write-skew across two different slots or overlapping sessions. All operations
// take doctor locks in ID order, then the patient lock, inside one transaction.
export async function lockDoctors(ids, session) {
  for (const id of [...new Set(ids.map(String))].sort()) {
    if (
      !(await Doctor.findOneAndUpdate({ _id: id }, { $inc: { bookingRevision: 1 } }, { session }))
    )
      throw httpError(404, 'Doctor not found.');
  }
}
async function activeDoctor(id, session) {
  const doctor = await Doctor.findById(id).session(session);
  if (!doctor) throw httpError(404, 'Doctor not found.');
  const user = await User.findOne({ _id: doctor.user, isActive: true }).session(session);
  const department = await Department.findOne({ _id: doctor.department, isActive: true }).session(
    session,
  );
  if (!user || !department) throw httpError(409, 'This doctor is currently unavailable.');
  return { doctor, user, department };
}

export async function createSchedule(data, actor) {
  const startsAt = localInstant(data.date, data.startTime),
    endsAt = localInstant(data.date, data.endTime);
  const minutes = (endsAt - startsAt) / 60000;
  if (!inBookingHorizon(data.date) || startsAt <= new Date())
    throw httpError(400, 'Choose a future session within the next 180 days.');
  if (minutes <= 0 || minutes > 12 * 60 || minutes % data.slotMinutes !== 0)
    throw httpError(
      400,
      'A session must last at most 12 hours and divide evenly into complete slots.',
    );
  let schedule;
  await mongoose.connection.transaction(async (session) => {
    await lockDoctors([data.doctor], session);
    if (startsAt <= new Date())
      throw httpError(400, 'The session start time has passed. Choose a future time.');
    await activeDoctor(data.doctor, session);
    if (
      await DoctorSchedule.exists({
        doctor: data.doctor,
        isActive: true,
        startsAt: { $lt: endsAt },
        endsAt: { $gt: startsAt },
      }).session(session)
    )
      throw httpError(409, 'This session overlaps an existing session for the doctor.');
    [schedule] = await DoctorSchedule.create(
      [
        {
          doctor: data.doctor,
          date: data.date,
          startsAt,
          endsAt,
          slotMinutes: data.slotMinutes,
          createdBy: actor._id,
        },
      ],
      { session },
    );
    const slots = [];
    for (let time = +startsAt; time < +endsAt; time += data.slotMinutes * 60000)
      slots.push({
        doctor: data.doctor,
        schedule: schedule._id,
        startsAt: new Date(time),
        endsAt: new Date(time + data.slotMinutes * 60000),
      });
    await AppointmentSlot.insertMany(slots, { session });
    await audit(actor._id, 'schedule_created', 'schedules', schedule._id, session);
  });
  return schedule;
}

export async function closeSchedule(id, reason, actor) {
  await mongoose.connection.transaction(async (session) => {
    const schedule = await DoctorSchedule.findById(id).session(session);
    if (!schedule) throw httpError(404, 'Session not found.');
    await lockDoctors([schedule.doctor], session);
    if (!schedule.isActive) throw httpError(409, 'This session is already closed.');
    if (await Appointment.exists({ schedule: id, status: { $in: openStatuses } }).session(session))
      throw httpError(
        409,
        'Move or cancel the remaining appointments before closing this session.',
      );
    schedule.isActive = false;
    schedule.closedReason = reason;
    await schedule.save({ session });
    await AppointmentSlot.updateMany({ schedule: id }, { $set: { isActive: false } }, { session });
    await audit(actor._id, 'schedule_closed', 'schedules', id, session);
  });
}

async function patientForBooking(actor, suppliedId, session) {
  if (actor.role === 'patient' && suppliedId)
    throw httpError(400, 'Your patient identity is taken from your session.');
  const filter = actor.role === 'patient' ? { user: actor._id } : { _id: suppliedId };
  if (actor.role !== 'patient' && !suppliedId)
    throw httpError(400, 'Choose a patient before booking.');
  const patient = await Patient.findOneAndUpdate(
    filter,
    { $inc: { bookingRevision: 1 } },
    { session },
  );
  if (!patient || !(await User.exists({ _id: patient.user, isActive: true }).session(session)))
    throw httpError(404, 'Active patient not found.');
  return patient;
}

async function validateSlot(slot, patient, exclude, session) {
  if (!slot?.isActive || slot.startsAt <= new Date())
    throw httpError(409, 'This slot is no longer available. Please choose another.');
  if (!(await DoctorSchedule.exists({ _id: slot.schedule, isActive: true }).session(session)))
    throw httpError(409, 'This session is no longer available.');
  if (
    await Appointment.exists({
      slot: slot._id,
      holdsSlot: true,
      ...(exclude ? { _id: { $ne: exclude } } : {}),
    }).session(session)
  )
    throw httpError(409, 'This slot has just been booked. Please choose another.');
  if (
    await Appointment.exists({
      patient: patient._id,
      holdsSlot: true,
      startsAt: { $lt: slot.endsAt },
      endsAt: { $gt: slot.startsAt },
      ...(exclude ? { _id: { $ne: exclude } } : {}),
    }).session(session)
  )
    throw httpError(409, 'This patient already has an appointment during that time.');
  return activeDoctor(slot.doctor, session);
}
function appointmentSnapshot(slot, details) {
  return {
    slot: slot._id,
    schedule: slot.schedule,
    doctor: slot.doctor,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    doctorName: details.user.name,
    departmentName: details.department.name,
    consultationFeeMinor: details.doctor.consultationFeeMinor,
  };
}

export async function bookAppointment(data, actor) {
  let appointment;
  await mongoose.connection.transaction(async (session) => {
    const slot = await AppointmentSlot.findById(data.slot).session(session);
    if (!slot) throw httpError(404, 'Appointment slot not found.');
    await lockDoctors([slot.doctor], session);
    const patient = await patientForBooking(actor, data.patient, session);
    const details = await validateSlot(slot, patient, null, session);
    [appointment] = await Appointment.create(
      [
        {
          ...appointmentSnapshot(slot, details),
          patient: patient._id,
          bookedBy: actor._id,
          reference: `HMS-${randomBytes(5).toString('hex').toUpperCase()}`,
          reason: data.reason,
          history: [{ action: 'Booked', actor: actor._id }],
        },
      ],
      { session },
    );
    await audit(actor._id, 'appointment_booked', 'appointments', appointment._id, session);
  });
  return appointment;
}

export async function appointmentScope(actor) {
  if (actor.role === 'patient') {
    const patient = await Patient.findOne({ user: actor._id });
    return { patient: patient?._id ?? null };
  }
  if (actor.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: actor._id });
    return { doctor: doctor?._id ?? null };
  }
  return {};
}
async function ownedAppointment(id, actor, session) {
  const appointment = await Appointment.findById(id).session(session);
  if (!appointment) throw httpError(404, 'Appointment not found.');
  if (actor.role === 'patient') {
    if (!(await Patient.exists({ _id: appointment.patient, user: actor._id }).session(session)))
      throw httpError(404, 'Appointment not found.');
  }
  return appointment;
}
export async function cancelAppointment(id, reason, actor) {
  let appointment;
  await mongoose.connection.transaction(async (session) => {
    appointment = await ownedAppointment(id, actor, session);
    await lockDoctors([appointment.doctor], session);
    if (!['Scheduled', 'Waiting'].includes(appointment.status))
      throw httpError(409, 'Only scheduled or waiting appointments can be cancelled.');
    if (
      actor.role === 'patient' &&
      (appointment.status !== 'Scheduled' || appointment.startsAt <= new Date())
    )
      throw httpError(
        409,
        'You can only cancel your future scheduled appointments. Please contact reception.',
      );
    appointment.status = 'Cancelled';
    appointment.holdsSlot = false;
    appointment.cancelledAt = new Date();
    appointment.cancellationReason = reason;
    appointment.history.push({ action: 'Cancelled', actor: actor._id, reason });
    await appointment.save({ session });
    await audit(actor._id, 'appointment_cancelled', 'appointments', id, session);
  });
  return appointment;
}

export async function rescheduleAppointment(id, data, actor) {
  let appointment;
  await mongoose.connection.transaction(async (session) => {
    appointment = await ownedAppointment(id, actor, session);
    const slot = await AppointmentSlot.findById(data.slot).session(session);
    if (!slot) throw httpError(404, 'Appointment slot not found.');
    await lockDoctors([appointment.doctor, slot.doctor], session);
    if (appointment.status !== 'Scheduled')
      throw httpError(409, 'Only scheduled appointments can be moved.');
    if (String(slot._id) === String(appointment.slot))
      throw httpError(400, 'Choose a different slot.');
    const patient = await patientForBooking(actor, appointment.patient, session);
    const details = await validateSlot(slot, patient, appointment._id, session);
    appointment.history.push({
      action: 'Rescheduled',
      actor: actor._id,
      fromStartsAt: appointment.startsAt,
      toStartsAt: slot.startsAt,
      fromDoctorName: appointment.doctorName,
      toDoctorName: details.user.name,
      reason: data.reason,
    });
    Object.assign(appointment, appointmentSnapshot(slot, details));
    await appointment.save({ session });
    await audit(actor._id, 'appointment_rescheduled', 'appointments', id, session);
  });
  return appointment;
}

export async function checkInAppointment(id, actor) {
  let appointment;
  await mongoose.connection.transaction(async (session) => {
    appointment = await ownedAppointment(id, actor, session);
    await lockDoctors([appointment.doctor], session);
    if (appointment.status !== 'Scheduled')
      throw httpError(409, 'Only scheduled appointments can be checked in.');
    if (hospitalDate(appointment.startsAt) !== hospitalDate())
      throw httpError(409, 'Check-in is only available on the appointment date in Sri Lanka.');
    appointment.status = 'Waiting';
    appointment.checkedInAt = new Date();
    appointment.history.push({ action: 'Checked in', actor: actor._id });
    await appointment.save({ session });
    await audit(actor._id, 'appointment_checked_in', 'appointments', id, session);
  });
  return appointment;
}
