import { Notification, Patient, User, Delivery, HospitalSettings } from '../models.js';
import { deliveryConfig, sriLankanMobile } from './delivery-config.js';
import { appointmentEmailDetails, billingEmailDetails, snapshotEmail } from './email-content.js';
import { snapshotSms } from './sms-content.js';
export async function notifyPatient(patientId, event, session) {
  const patient = await Patient.findById(patientId).select('user').session(session);
  if (!patient) throw new Error('Notification recipient profile missing.');
  const result = await Notification.updateOne(
    { recipient: patient.user, eventKey: event.eventKey },
    {
      $setOnInsert: {
        eventKey: event.eventKey,
        type: event.type,
        title: event.title,
        message: event.message,
        path: event.path,
        recipient: patient.user,
        readAt: null,
      },
    },
    { upsert: true, session, runValidators: true },
  );
  // The persistent outbox commits with the notification and the originating action.
  if (!result.upsertedCount) return;
  const user = await User.findById(patient.user).session(session);
  const modes = deliveryConfig();
  const brand =
    user.isActive &&
    ['email', 'sms'].some(
      (channel) => user.notificationPreferences?.[channel] && modes[channel] !== 'off',
    )
      ? await HospitalSettings.findById('000000000000000000000001')
          .select('published')
          .session(session)
          .lean()
      : null;
  for (const channel of ['email', 'sms']) {
    if (!user.isActive || !user.notificationPreferences?.[channel] || modes[channel] === 'off')
      continue;
    const destination = channel === 'email' ? user.email : sriLankanMobile(user.phone);
    if (!destination) continue;
    await Delivery.updateOne(
      { recipient: user._id, eventKey: event.eventKey, channel },
      {
        $setOnInsert: {
          recipient: user._id,
          eventKey: event.eventKey,
          channel,
          destination,
          transport: modes[channel],
          status: 'queued',
          ...(channel === 'email'
            ? { emailContent: snapshotEmail(event, user.name, brand?.published) }
            : { smsContent: snapshotSms(event, brand?.published) }),
        },
      },
      { upsert: true, session, runValidators: true },
    );
  }
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
      email: appointmentEmailDetails(
        appointment,
        ['started', 'completed'].includes(action)
          ? `consultation_${action}`
          : `appointment_${action}`,
      ),
    },
    session,
  );
}
export async function billingNotice(bill, eventKey, title, message, session, payment) {
  const kind = eventKey.startsWith('payment:')
    ? eventKey.endsWith(':reversed')
      ? 'payment_reversed'
      : 'payment_recorded'
    : eventKey.endsWith(':created')
      ? 'bill_created'
      : 'bill_updated';
  await notifyPatient(
    bill.patient,
    {
      eventKey,
      type: 'billing',
      title,
      message: `${message} Invoice ${bill.reference}. Open your bill for the current balance and details.`,
      path: `/billing/${bill._id}`,
      email: billingEmailDetails(bill, kind, payment),
    },
    session,
  );
}
