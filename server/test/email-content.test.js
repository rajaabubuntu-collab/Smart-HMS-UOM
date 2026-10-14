import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appointmentEmailDetails,
  billingEmailDetails,
  snapshotEmail,
  renderEmail,
  securityEmail,
  hospitalEmailBrand,
} from '../src/notifications/email-content.js';
import { createTransports } from '../src/notifications/transports.js';

const origin = 'https://hospital.example';
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const brand = {
  name: 'Test Hospital',
  address: 'Colombo 09',
  phone: '+94110000000',
  email: 'reception@example.com',
  isDemo: false,
};
const appointment = {
  reference: 'HMS-TEST',
  startsAt: '2026-10-20T03:30:00Z',
  doctorName: 'Dr Test',
  departmentName: 'General Medicine',
  consultationFeeMinor: 250050,
  history: [{ fromStartsAt: '2026-10-19T03:30:00Z', fromDoctorName: 'Dr Previous' }],
  reason: 'PRIVATE-REASON',
  notes: 'PRIVATE-NOTES',
};
const bill = {
  reference: 'INV-TEST',
  appointmentReference: 'HMS-TEST',
  totalMinor: 350050,
  paidMinor: 100000,
  dueDate: '2026-10-25',
  items: [{ description: 'PRIVATE-TREATMENT' }],
};
const payment = {
  reference: 'RCT-TEST',
  amountMinor: 100000,
  method: 'Bank transfer',
  externalReference: 'PRIVATE-BANK-REFERENCE',
  reversalReason: 'PRIVATE-REASON',
};
function build(kind) {
  const clinical = kind.startsWith('consultation') || kind === 'prescription_updated';
  const billing = kind.startsWith('bill_') || kind.startsWith('payment_');
  return snapshotEmail(
    {
      path: billing ? `/billing/${id}` : clinical ? '/records' : `/appointments?selected=${id}`,
      email: billing
        ? billingEmailDetails(bill, kind, payment)
        : appointmentEmailDetails(appointment, kind),
    },
    'Demo Patient',
    brand,
    new Date('2026-10-14T12:00:00Z'),
  );
}

test('hospital emails explain each event, include safe details and provide matching text and HTML links', () => {
  for (const kind of [
    'appointment_booked',
    'appointment_rescheduled',
    'appointment_cancelled',
    'appointment_checked_in',
    'appointment_reminder',
    'consultation_started',
    'consultation_completed',
    'prescription_updated',
    'bill_created',
    'bill_updated',
    'payment_recorded',
    'payment_reversed',
  ]) {
    const content = build(kind),
      rendered = renderEmail(content, origin);
    assert.ok(rendered.subject.includes(content.title), kind);
    assert.ok(rendered.text.includes(content.summary), kind);
    assert.ok(rendered.text.includes(`${origin}${content.path}`), kind);
    assert.ok(rendered.html.includes(`href="${origin}${content.path}"`), kind);
    for (const row of content.details)
      assert.ok(rendered.text.includes(`${row.label}: ${row.value}`), row.label);
    assert.ok(
      content.details.some((row) => row.value === 'HMS-TEST'),
      kind,
    );
    assert.ok(!JSON.stringify({ content, rendered }).includes('PRIVATE-'), kind);
    assert.match(rendered.text, /Reception: \+94110000000/);
    assert.equal(rendered.replyTo, 'reception@example.com');
    assert.doesNotMatch(rendered.html, /<script|<img|<iframe|<link\b|url\(/i);
  }
});

test('rescheduling shows previous and new Colombo times; payment amounts use exact LKR minor units', () => {
  const moved = renderEmail(build('appointment_rescheduled'), origin);
  assert.match(
    moved.text,
    /Previous appointment: Monday, 19 October 2026 at 09:00 \(Sri Lanka time\)/,
  );
  assert.match(moved.text, /New appointment: Tuesday, 20 October 2026 at 09:00 \(Sri Lanka time\)/);
  assert.match(moved.text, /Previous doctor: Dr Previous/);
  assert.match(moved.text, /Consultation fee: LKR 2,500.50/);
  const paid = renderEmail(build('payment_recorded'), origin);
  assert.match(paid.text, /Receipt reference: RCT-TEST/);
  assert.match(paid.text, /Payment amount: LKR 1,000.00/);
  assert.match(paid.text, /Outstanding balance: LKR 2,500.50/);
  assert.match(paid.text, /Payment due date: 25 October 2026/);
  assert.match(
    renderEmail(build('payment_reversed'), origin).text,
    /does not transfer or refund money/,
  );
});

test('snapshot preserves event details after source changes and keeps draft branding out', () => {
  const source = structuredClone(appointment);
  const content = snapshotEmail(
    { email: appointmentEmailDetails(source, 'appointment_booked'), path: '/appointments' },
    'Demo Patient',
    { ...brand, isDemo: true },
  );
  source.startsAt = '2027-01-01T00:00:00Z';
  source.doctorName = 'Changed';
  const rendered = renderEmail(content, origin);
  assert.match(rendered.text, /20 October 2026/);
  assert.match(rendered.text, /Dr Test/);
  assert.doesNotMatch(rendered.text, /Test Hospital|reception@example.com|Changed/);
  assert.deepEqual(hospitalEmailBrand(undefined), { name: 'Smart HMS' });
});

test('unrecognised events and unsafe paths cannot copy clinical text or redirect the recipient', () => {
  const unknown = snapshotEmail(
    {
      title: 'PRIVATE-DIAGNOSIS',
      message: 'PRIVATE-NOTES',
      path: '//evil.example',
      email: { kind: 'toString', reference: 'PRIVATE-REFERENCE' },
    },
    'Patient',
  );
  const rendered = renderEmail(unknown, origin);
  assert.equal(unknown.kind, 'portal_update');
  assert.doesNotMatch(JSON.stringify(rendered), /PRIVATE|evil\.example/);
  for (const path of [
    '//evil.example',
    'https://evil.example',
    '/appointments?selected=evil',
    '/billing/../admin',
    '/records#secret',
  ]) {
    const content = snapshotEmail(
      { path, email: appointmentEmailDetails(appointment, 'appointment_booked') },
      'Patient',
      brand,
    );
    assert.equal(content.path, '/notifications');
  }
});

test('HTML escapes untrusted names and header controls without breaking safe links', () => {
  const content = snapshotEmail(
    {
      path: '/appointments',
      email: {
        ...appointmentEmailDetails(appointment, 'appointment_booked'),
        doctorName: '<img src=x onerror=alert(1)>',
        reference: 'HMS\r\nBcc: victim@example.com',
      },
    },
    '<script>alert(1)</script>',
    { ...brand, name: 'Hospital & Care\r\nBcc: invalid', email: 'bad\r\n@example.com' },
  );
  const rendered = renderEmail(content, origin);
  assert.doesNotMatch(rendered.html, /<script|<img/);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.match(rendered.html, /Hospital &amp; Care/);
  assert.doesNotMatch(rendered.subject, /[\r\n]/);
  assert.equal(rendered.replyTo, undefined);
});

test('security emails carry actionable single-use links and omit optional notification preferences', () => {
  const token = 'a'.repeat(64);
  const reset = securityEmail('reset', origin, token, brand);
  assert.match(reset.text, /15 minutes/);
  assert.ok(reset.text.includes(`${origin}/reset-password#token=${token}`));
  assert.ok(reset.html.includes(`href="${origin}/reset-password#token=${token}"`));
  assert.doesNotMatch(reset.html, /Manage preferences/);
  const changed = securityEmail('changed', origin, undefined, brand);
  assert.match(changed.text, /All existing sessions have been signed out/);
  assert.ok(changed.text.includes(`${origin}/login`));
  assert.ok(!changed.text.includes(token));
});

test('SMTP sends multipart content with hospital identity; SMS still sends only the portal link', async () => {
  const content = renderEmail(build('payment_recorded'), origin);
  let email, sms;
  const config = {
    origin,
    delivery: {
      email: 'smtp',
      sms: 'twilio',
      smtp: {
        host: 'smtp.example',
        port: 587,
        user: 'test',
        password: 'test',
        from: 'sender@example.com',
      },
      twilio: { account: `AC${'a'.repeat(32)}`, token: 'test', from: 'HMSDemo' },
    },
  };
  const transport = createTransports(config, {
    mailFactory: () => ({
      sendMail: async (message) => {
        email = message;
        return { accepted: [message.to], messageId: 'test' };
      },
    }),
    fetchImpl: async (_url, options) => {
      sms = options.body.get('Body');
      return { ok: true, json: async () => ({ sid: `SM${'a'.repeat(32)}`, status: 'queued' }) };
    },
  });
  await transport.send(
    { _id: id, transport: 'smtp', channel: 'email', destination: 'patient@example.com' },
    content,
  );
  assert.equal(email.html, content.html);
  assert.equal(email.text, content.text);
  assert.equal(email.subject, content.subject);
  assert.deepEqual(email.from, { name: 'Test Hospital', address: 'sender@example.com' });
  assert.equal(email.replyTo, brand.email);
  await transport.send(
    { transport: 'twilio', channel: 'sms', destination: '+94770000000' },
    content,
  );
  assert.ok(sms.includes(`${origin}/notifications`));
  assert.doesNotMatch(sms, /RCT-TEST|Demo Patient|Payment amount|LKR/);
});
