// Only explicitly selected operational fields enter email. Never pass clinical
// notes, booking reasons, allergies, medication rows or payment bank references.
import { z } from 'zod';

// Strip control characters so names and references cannot inject mail headers.
const clean = (value, max = 500) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (minor) =>
  Number.isSafeInteger(minor) && minor >= 0
    ? `LKR ${(minor / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
const time = (value) =>
  value && !Number.isNaN(new Date(value).valueOf())
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Colombo',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(value)) + ' (Sri Lanka time)'
    : '';
const date = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  !Number.isNaN(new Date(`${value}T00:00:00+05:30`).valueOf())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'long' }).format(
        new Date(`${value}T00:00:00+05:30`),
      )
    : '';

export function hospitalEmailBrand(published) {
  if (!published || published.isDemo) return { name: 'Smart HMS' };
  return {
    name: clean(published.name, 120) || 'Smart HMS',
    address: clean(published.address, 400),
    phone: clean(published.phone, 30),
    email: z.email().safeParse(published.email).success ? published.email : '',
  };
}

const templates = {
  appointment_booked: [
    'Appointment confirmed',
    'Your appointment has been booked successfully.',
    'Bring your appointment reference when you arrive. If your plans change, reschedule or cancel through the patient portal.',
    'View appointment',
    'blue',
  ],
  appointment_rescheduled: [
    'Appointment rescheduled',
    'Your appointment has moved. Please use the updated date, time and doctor shown below.',
    'The previous slot is no longer reserved for you. Open your appointment to review its current details.',
    'View updated appointment',
    'amber',
  ],
  appointment_cancelled: [
    'Appointment cancelled',
    'Your appointment has been cancelled and its time slot has been released.',
    'If you still need an appointment, choose a new available slot in the portal or contact reception.',
    'View appointment',
    'amber',
  ],
  appointment_checked_in: [
    'Check-in confirmed',
    'Reception has checked you in for your appointment.',
    'Please wait for the care team to call you. The scheduled time is shown below; it is not a live waiting-time estimate.',
    'View appointment',
    'green',
  ],
  consultation_started: [
    'Consultation started',
    'Your consultation has been marked as in progress.',
    'The completed consultation record will become available in your patient portal after the doctor finishes the visit.',
    'View appointment',
    'blue',
  ],
  consultation_completed: [
    'Consultation record ready',
    'Your consultation is complete. Your consultation and prescription record are now available in the patient portal.',
    'Sign in to review your doctor’s notes and prescription instructions.',
    'View medical records',
    'green',
  ],
  prescription_updated: [
    'Prescription updated',
    'Your doctor has updated the prescription record for your visit.',
    'Sign in to review the latest version and its recorded instructions. Previous versions remain available in your record history.',
    'View medical records',
    'blue',
  ],
  appointment_reminder: [
    'Appointment reminder',
    'Your appointment is scheduled within the next 24 hours.',
    'Check the date and time below. If you cannot attend, reschedule or cancel through the portal or contact reception.',
    'View appointment',
    'blue',
  ],
  bill_created: [
    'Your bill is ready',
    'A bill has been created for your completed appointment.',
    'Review the itemised bill in the portal. Contact reception for payment arrangements.',
    'View bill',
    'blue',
  ],
  bill_updated: [
    'Your bill has been updated',
    'The charges or due date on your bill have changed.',
    'Review the updated itemised bill and balance in the portal. Contact reception if you have a question.',
    'View updated bill',
    'amber',
  ],
  payment_recorded: [
    'Payment recorded',
    'A payment received by the hospital has been recorded against your bill.',
    'Keep the receipt reference below. You can view the payment history and remaining balance in the portal.',
    'View payment history',
    'green',
  ],
  payment_reversed: [
    'Payment record corrected',
    'A previously recorded payment has been reversed and your bill balance has been updated.',
    'This corrects the hospital’s payment record; it does not transfer or refund money. Contact reception for clarification.',
    'View payment history',
    'amber',
  ],
  portal_update: [
    'Patient portal update',
    'A new update is available in your patient portal.',
    'Sign in to view the latest details.',
    'Open patient portal',
    'blue',
  ],
};

export function appointmentEmailDetails(appointment, kind) {
  const previous = kind === 'appointment_rescheduled' ? appointment.history?.at(-1) : null;
  return {
    kind,
    reference: appointment.reference,
    startsAt: appointment.startsAt,
    doctorName: appointment.doctorName,
    departmentName: appointment.departmentName,
    consultationFeeMinor: appointment.consultationFeeMinor,
    previousStartsAt: previous?.fromStartsAt,
    previousDoctorName: previous?.fromDoctorName,
  };
}
export function billingEmailDetails(bill, kind, payment) {
  return {
    kind,
    reference: bill.reference,
    appointmentReference: bill.appointmentReference,
    totalMinor: bill.totalMinor,
    paidMinor: bill.paidMinor,
    balanceMinor: bill.totalMinor - bill.paidMinor,
    dueDate: bill.dueDate,
    paymentReference: payment?.reference,
    paymentAmountMinor: payment?.amountMinor,
    paymentMethod: payment?.method,
  };
}
function notificationPath(path) {
  return /^\/(?:notifications|records|appointments(?:\?selected=[a-f\d]{24})?|billing\/[a-f\d]{24})$/i.test(
    path || '',
  )
    ? path
    : '/notifications';
}
export function snapshotEmail(event, recipientName, published, now = new Date()) {
  const input = event.email || {};
  const kind = Object.hasOwn(templates, input.kind) ? input.kind : 'portal_update';
  const [title, summary, nextStep, actionLabel, tone] = templates[kind];
  const details = [];
  function add(label, value) {
    if (value !== undefined && value !== null && value !== '')
      details.push({ label, value: clean(value) });
  }
  if (
    kind.startsWith('appointment_') ||
    kind.startsWith('consultation_') ||
    kind === 'prescription_updated'
  ) {
    add('Appointment reference', input.reference);
    if (kind === 'appointment_rescheduled') {
      add('Previous appointment', time(input.previousStartsAt));
      if (input.previousDoctorName && input.previousDoctorName !== input.doctorName)
        add('Previous doctor', input.previousDoctorName);
    }
    add(
      kind === 'appointment_rescheduled' ? 'New appointment' : 'Appointment date & time',
      time(input.startsAt),
    );
    add('Doctor', input.doctorName);
    add('Department', input.departmentName);
    if (['appointment_booked', 'appointment_rescheduled', 'appointment_reminder'].includes(kind))
      add('Consultation fee', money(input.consultationFeeMinor));
  } else if (kind.startsWith('bill_') || kind.startsWith('payment_')) {
    add('Invoice reference', input.reference);
    add('Appointment reference', input.appointmentReference);
    if (kind.startsWith('payment_')) {
      add('Receipt reference', input.paymentReference);
      add(
        kind === 'payment_reversed' ? 'Reversed amount' : 'Payment amount',
        money(input.paymentAmountMinor),
      );
      add('Payment method', input.paymentMethod);
    }
    add('Invoice total', money(input.totalMinor));
    add('Total paid', money(input.paidMinor));
    add('Outstanding balance', money(input.balanceMinor));
    add('Payment due date', date(input.dueDate));
  }
  const hospital = hospitalEmailBrand(published);
  return {
    version: 1,
    kind,
    hospital,
    recipientName: clean(recipientName, 120),
    title,
    summary,
    nextStep,
    actionLabel,
    tone,
    path: kind === 'portal_update' ? '/notifications' : notificationPath(event.path),
    details,
    occurredAt: now,
    subject: `${hospital.name} | ${title}${input.reference && kind !== 'portal_update' ? ` | ${clean(input.reference, 80)}` : ''}`,
  };
}

export function renderEmail(content, origin, { security = false } = {}) {
  const hospital = content.hospital || { name: 'Smart HMS' };
  const path =
    security && /^\/(?:login|reset-password#token=[a-f\d]{64})$/.test(content.path || '')
      ? content.path
      : notificationPath(content.path);
  const url = new URL(path, origin).href;
  const preferenceUrl = new URL('/messages', origin).href;
  const h = escapeHtml;
  const details = content.details || [];
  const greeting = content.recipientName ? `Hello ${content.recipientName},` : 'Hello,';
  const footer = security
    ? 'This is an account security email.'
    : 'You received this email because email updates are enabled for your patient account.';
  const asOf =
    !security && content.occurredAt
      ? `This message records an update on ${time(content.occurredAt)}. The portal shows the latest status and balance.`
      : '';
  const contact = [
    hospital.name,
    hospital.address,
    hospital.phone && `Reception: ${hospital.phone}`,
    hospital.email,
  ]
    .filter(Boolean)
    .join('\n');
  const text = [
    hospital.name,
    content.title,
    greeting,
    content.summary,
    details.map((row) => `${row.label}: ${row.value}`).join('\n'),
    content.nextStep,
    `${content.actionLabel}: ${url}`,
    asOf,
    contact,
    footer,
    !security && `Manage email preferences: ${preferenceUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const accent = { green: '#08785f', amber: '#92500b', blue: '#314ca6' }[content.tone] || '#314ca6';
  const rows = details
    .map(
      (row) =>
        `<tr><th scope="row" style="width:42%;padding:13px 16px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;font-size:13px;font-weight:600;color:#53617a;overflow-wrap:anywhere;word-break:break-word">${h(row.label)}</th><td style="padding:13px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:14px;font-weight:600;color:#20334e;overflow-wrap:anywhere;word-break:break-word">${h(row.value)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(content.title)}</title></head>
<body style="margin:0;padding:0;background-color:#eef3fa;color:#20334e;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${h(content.summary)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef3fa"><tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #dfe7f2;border-radius:18px;overflow:hidden">
<tr><td style="padding:25px 24px;background-color:#183452;color:#ffffff"><div style="font-size:22px;font-weight:700;letter-spacing:-0.4px">${h(hospital.name)}</div><div style="margin-top:6px;font-size:12px;letter-spacing:1.5px;color:#c3e7ed">PATIENT SERVICES</div></td></tr>
<tr><td style="padding:27px 24px"><div style="font-size:12px;font-weight:700;letter-spacing:1px;color:${accent};text-transform:uppercase">${security ? 'Account security' : 'Your hospital update'}</div>
<h1 style="margin:10px 0 22px;font-size:26px;line-height:1.25;color:#183452">${h(content.title)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.65">${h(greeting)}</p><p style="margin:0 0 22px;font-size:15px;line-height:1.65">${h(content.summary)}</p>
${rows ? `<table width="100%" cellspacing="0" cellpadding="0" border="0" aria-label="Update details" style="table-layout:fixed;background-color:#f6f8fc;border:1px solid #e2e8f0;border-radius:10px">${rows}</table>` : ''}
<p style="margin:22px 0;font-size:14px;line-height:1.7;color:#42566f">${h(content.nextStep)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background-color:${accent};border-radius:8px;text-align:center"><a href="${h(url)}" style="display:inline-block;padding:15px 22px;font-size:14px;font-weight:700;text-decoration:none;color:#ffffff">${h(content.actionLabel)}</a></td></tr></table>
<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#53617a">If the button does not open, copy this link into your browser:<br><a href="${h(url)}" style="color:#314ca6;overflow-wrap:anywhere;word-break:break-all">${h(url)}</a></p>
${asOf ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#53617a">${h(asOf)}</p>` : ''}
</td></tr><tr><td style="padding:22px 24px;background-color:#f6f8fc;border-top:1px solid #e2e8f0"><p style="margin:0 0 8px;font-size:14px;font-weight:700">${h(hospital.name)}</p>${hospital.address ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#53617a">${h(hospital.address)}</p>` : ''}${hospital.phone ? `<p style="margin:0 0 8px;font-size:13px;color:#53617a">Reception: ${h(hospital.phone)}</p>` : ''}${hospital.email ? `<p style="margin:0 0 12px;font-size:13px"><a style="color:#314ca6" href="mailto:${h(hospital.email)}">${h(hospital.email)}</a></p>` : ''}<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#53617a">${h(footer)}${!security ? ` <a href="${h(preferenceUrl)}" style="color:#314ca6">Manage preferences</a>.` : ''}</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    subject: clean(content.subject, 300),
    text,
    html,
    senderName: hospital.name,
    replyTo: z.email().safeParse(hospital.email).success ? hospital.email : undefined,
  };
}

export function securityEmail(kind, origin, token, published) {
  const hospital = hospitalEmailBrand(published);
  const reset = kind === 'reset';
  return renderEmail(
    {
      hospital,
      title: reset ? 'Reset your password' : 'Your password was changed',
      subject: reset
        ? `Reset your ${hospital.name} password`
        : `Your ${hospital.name} password changed`,
      summary: reset
        ? 'We received a request to reset your patient portal password.'
        : 'Your portal password was changed successfully. All existing sessions have been signed out.',
      nextStep: reset
        ? 'Use this single-use link within 15 minutes. If you did not request this, ignore this email; your password will stay unchanged.'
        : 'Sign in again using your new password. If you did not make this change, contact hospital reception.',
      actionLabel: reset ? 'Reset password' : 'Sign in to your portal',
      path: reset ? `/reset-password#token=${token}` : '/login',
      tone: 'blue',
      details: reset ? [{ label: 'Link validity', value: '15 minutes · one use' }] : [],
    },
    origin,
    { security: true },
  );
}
