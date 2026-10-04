import { Notification, Patient } from '../models.js';
export async function notifyPatient(patientId, event, session) {
  const patient = await Patient.findById(patientId).select('user').session(session);
  if (!patient) throw new Error('Notification recipient profile missing.');
  await Notification.updateOne(
    { recipient: patient.user, eventKey: event.eventKey },
    { $setOnInsert: { ...event, recipient: patient.user, readAt: null } },
    { upsert: true, session, runValidators: true },
  );
}
export function appointmentTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
export async function appointmentNotice(appointment, action, session) {
  const messages = {
    booked: ['Appointment confirmed', 'Your appointment is confirmed'],
    rescheduled: ['Appointment rescheduled', 'Your appointment has been moved'],
    cancelled: ['Appointment cancelled', 'Your appointment has been cancelled'],
    checked_in: ['Checked in', 'You are checked in and waiting for your consultation'],
    started: ['Consultation started', 'Your consultation is now in progress'],
    completed: [
      'Consultation record available',
      'Your completed consultation and prescription record are ready in Medical records',
    ],
  };
  const [title, message] = messages[action];
  await notifyPatient(
    appointment.patient,
    {
      eventKey: `appointment:${appointment._id}:${action}:${appointment.scheduleRevision || 0}`,
      type: ['started', 'completed'].includes(action) ? 'clinical' : 'appointment',
      title,
      message: `${message}. ${appointment.reference} · ${appointmentTime(appointment.startsAt)} (Sri Lanka time).`,
      path: action === 'completed' ? '/records' : `/appointments?selected=${appointment._id}`,
    },
    session,
  );
}
export async function billingNotice(bill, eventKey, title, message, session) {
  await notifyPatient(
    bill.patient,
    {
      eventKey,
      type: 'billing',
      title,
      message: `${message} Invoice ${bill.reference}. Open your bill for the current balance and details.`,
      path: `/billing/${bill._id}`,
    },
    session,
  );
}
