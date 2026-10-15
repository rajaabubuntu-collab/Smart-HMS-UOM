import { hospitalEmailBrand } from './email-content.js';

// GSM-7 extension characters consume two septets, even though JS counts one character.
const basic = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const extended = new Set('\f^{}\\[~]|€');
export function smsUnits(text) {
  let units = 0;
  for (const character of String(text ?? '')) {
    if (basic.has(character)) units++;
    else if (extended.has(character)) units += 2;
    else return Infinity;
  }
  return units;
}
export const isSingleSegmentSms = (text) =>
  typeof text === 'string' && text.length > 0 && smsUnits(text) <= 160;

// Names stay whole. Unsupported scripts are omitted rather than sent as garbled text.
function name(value, max = 32) {
  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return text && smsUnits(text) <= max ? text : '';
}
const reference = (value) => (/^[A-Z0-9-]{1,32}$/.test(value || '') ? value : '');
const amount = (value) =>
  Number.isSafeInteger(value) && value >= 0
    ? `LKR ${Math.floor(value / 100).toLocaleString('en-LK')}.${String(value % 100).padStart(2, '0')}`
    : '';
function dateTime(value) {
  if (!value || Number.isNaN(new Date(value).valueOf())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
function dueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(new Date(value).valueOf()))
    return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00+05:30`));
}

const templates = {
  appointment_booked: ['Appointment confirmed', 'Manage in your patient portal.'],
  appointment_rescheduled: ['Appointment rescheduled', 'Check your patient portal.'],
  appointment_cancelled: ['Appointment cancelled', 'Book again in your patient portal.'],
  appointment_checked_in: ['Check-in confirmed', 'Please wait for the care team.'],
  appointment_reminder: ['Appointment reminder', 'Please bring your reference.'],
  consultation_started: ['Consultation started', 'Your visit is in progress.'],
  consultation_completed: [
    'Consultation completed',
    'View your visit record in the patient portal.',
  ],
  prescription_updated: [
    'Prescription updated',
    'Review the latest instructions in your patient portal.',
  ],
  bill_created: ['Your bill is ready', 'View your bill in the patient portal.'],
  bill_updated: ['Bill updated', 'View your bill in the patient portal.'],
  payment_recorded: ['Payment received', 'View your receipt in the patient portal.'],
  payment_reversed: ['Payment record reversed', 'Record correction, not a refund. Check portal.'],
  portal_update: ['A new update is available', 'Please sign in to your patient portal.'],
};

export function snapshotSms(event, published) {
  // Event builders already whitelist these operational details for email.
  // Never copy event.title, event.message, reasons, clinical notes or medication rows.
  const data = event.email || {};
  const kind = Object.hasOwn(templates, data.kind) ? data.kind : 'portal_update';
  const hospital = hospitalEmailBrand(published);
  const [title, nextStep] = templates[kind];
  const header = `${name(hospital.name) || 'Smart HMS'}: ${title}.`;
  const details = [];
  const add = (label, value) => {
    if (value) details.push(`${label}${value}.`);
  };
  if (
    kind.startsWith('appointment_') ||
    kind.startsWith('consultation_') ||
    kind === 'prescription_updated'
  ) {
    add('Ref ', reference(data.reference));
    const scheduled = dateTime(data.startsAt);
    if (kind === 'appointment_rescheduled') {
      add('New: ', scheduled && `${scheduled} (Sri Lanka)`);
      const previous = dateTime(data.previousStartsAt);
      add('Was: ', previous);
    } else if (
      ['appointment_booked', 'appointment_reminder', 'appointment_cancelled'].includes(kind)
    ) {
      add('', scheduled && `${scheduled} (Sri Lanka)`);
    }
    add('Doctor: ', name(data.doctorName));
    if (['appointment_booked', 'appointment_reminder'].includes(kind))
      add('Fee ', amount(data.consultationFeeMinor));
  } else if (kind.startsWith('bill_') || kind.startsWith('payment_')) {
    if (kind.startsWith('payment_')) {
      add('Receipt ', reference(data.paymentReference));
      add(kind === 'payment_reversed' ? 'Reversed ' : 'Paid ', amount(data.paymentAmountMinor));
      add('Balance ', amount(data.balanceMinor));
      add('Bill ', reference(data.reference));
    } else {
      add('Bill ', reference(data.reference));
      add('Total ', amount(data.totalMinor));
      add('Balance ', amount(data.balanceMinor));
      add('Due ', dueDate(data.dueDate));
    }
  }
  if (kind !== 'portal_update' && /^\+94[1-9]\d{8}$/.test(hospital.phone || ''))
    add('Help: ', hospital.phone);

  // Reserve the action sentence, then include complete fields in priority order.
  // Never truncate a date, amount, reference or disclaimer to fit the budget.
  const parts = [header];
  for (const detail of details) {
    if (smsUnits([...parts, detail, nextStep].join('\n')) <= 160) parts.push(detail);
  }
  const text = [...parts, nextStep].join('\n');
  return { version: 1, kind, text };
}
