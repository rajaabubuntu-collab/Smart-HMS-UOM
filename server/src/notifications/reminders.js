import mongoose from 'mongoose';
import { Appointment } from '../models.js';
import { lockDoctors } from '../scheduling/service.js';
import { notifyPatient, appointmentTime } from './service.js';

// A bounded batch makes startup/recovery safe. Undelivered candidates remain eligible.
export async function runReminderBatch({ now = new Date(), limit = 100 } = {}) {
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const candidates = await Appointment.find({
    status: 'Scheduled',
    startsAt: { $gt: now, $lte: end },
    $expr: { $ne: [{ $ifNull: ['$remindedRevision', -1] }, { $ifNull: ['$scheduleRevision', 0] }] },
  })
    .sort({ startsAt: 1, _id: 1 })
    .limit(limit)
    .select('_id doctor')
    .lean();
  let delivered = 0;
  for (const candidate of candidates) {
    const created = await mongoose.connection.transaction(async (session) => {
      await lockDoctors([candidate.doctor], session);
      const appointment = await Appointment.findById(candidate._id).session(session);
      if (
        !appointment ||
        String(appointment.doctor) !== String(candidate.doctor) ||
        appointment.status !== 'Scheduled' ||
        appointment.startsAt <= now ||
        appointment.startsAt > end ||
        appointment.remindedRevision === appointment.scheduleRevision
      )
        return false;
      // Serialises with cancellation, rescheduling and check-in. Notification and marker commit together.
      await notifyPatient(
        appointment.patient,
        {
          eventKey: `reminder:${appointment._id}:${appointment.scheduleRevision || 0}`,
          type: 'reminder',
          title: 'Upcoming appointment',
          message: `Reminder: ${appointment.reference} is scheduled for ${appointmentTime(appointment.startsAt)} (Sri Lanka time), within the next 24 hours. Open the appointment for its current status.`,
          path: `/appointments?selected=${appointment._id}`,
        },
        session,
      );
      appointment.remindedRevision = appointment.scheduleRevision || 0;
      await appointment.save({ session });
      return true;
    });
    if (created) delivered += 1;
  }
  return { checked: candidates.length, delivered };
}
export function startReminderWorker({
  intervalMs = 60000,
  run = runReminderBatch,
  onError = () =>
    console.error('Appointment reminder check failed; it will retry on the next interval.'),
} = {}) {
  let active = null,
    stopped = false;
  function tick() {
    if (stopped || active) return;
    active = Promise.resolve()
      .then(() => run())
      .catch(onError)
      .finally(() => {
        active = null;
      });
  }
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
