import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotSms, smsUnits, isSingleSegmentSms } from '../src/notifications/sms-content.js';
import { createTransports } from '../src/notifications/transports.js';
import { deliveryConfig } from '../src/notifications/delivery-config.js';

const hospital = { name: 'Smart HMS', phone: '+94115279429', isDemo: false };
const data = {
  reference: 'HMS-1234567890',
  startsAt: '2026-10-20T03:30:00Z',
  previousStartsAt: '2026-10-19T03:30:00Z',
  doctorName: 'Dr Demo Perera',
  consultationFeeMinor: 250000,
  totalMinor: 350000,
  balanceMinor: 150000,
  paymentReference: 'RCT-1234567890ABCDEF',
  paymentAmountMinor: 200000,
  dueDate: '2026-10-25',
};
const kinds = [
  'appointment_booked',
  'appointment_reminder',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_checked_in',
  'consultation_started',
  'consultation_completed',
  'prescription_updated',
  'bill_created',
  'bill_updated',
  'payment_recorded',
  'payment_reversed',
];
const event = (kind, extra = {}) => ({
  title: 'PRIVATE-TITLE',
  message: 'PRIVATE-NOTES',
  email: {
    ...data,
    kind,
    diagnosis: 'PRIVATE-DIAGNOSIS',
    medications: [{ name: 'PRIVATE-MEDICINE' }],
    ...extra,
  },
});

test('every hospital SMS describes the event, preserves branding and fits one GSM-7 segment', () => {
  const texts = new Set();
  for (const kind of kinds) {
    const content = snapshotSms(event(kind), hospital);
    assert.equal(content.kind, kind);
    assert.ok(isSingleSegmentSms(content.text), `${kind}: ${smsUnits(content.text)}`);
    assert.match(content.text, /^Smart HMS:/);
    assert.doesNotMatch(content.text, /PRIVATE|undefined|NaN/);
    assert.ok(
      content.text.includes(kind.startsWith('payment_') ? data.paymentReference : data.reference),
    );
    texts.add(content.text);
  }
  assert.equal(texts.size, kinds.length);
});

test('booking and rescheduling include accurate Colombo dates, doctor and full references', () => {
  const booked = snapshotSms(event('appointment_booked'), hospital).text;
  assert.match(booked, /20 Oct 2026, 09:00 \(Sri Lanka\)/);
  assert.match(booked, /Doctor: Dr Demo Perera/);
  assert.match(booked, /Fee LKR 2,500.00/);
  const moved = snapshotSms(event('appointment_rescheduled'), hospital).text;
  assert.match(moved, /New: 20 Oct 2026, 09:00/);
  assert.match(moved, /Was: 19 Oct 2026, 09:00/);
  assert.match(moved, /Ref HMS-1234567890/);
});

test('billing SMS reports exact amounts and reversals always explain that no refund is made', () => {
  const paid = snapshotSms(event('payment_recorded'), hospital).text;
  assert.match(paid, /Paid LKR 2,000.00/);
  assert.match(paid, /Balance LKR 1,500.00/);
  const zero = snapshotSms(
    event('payment_recorded', { balanceMinor: 0, paymentAmountMinor: 200001 }),
    hospital,
  ).text;
  assert.match(zero, /Paid LKR 2,000.01/);
  assert.match(zero, /Balance LKR 0.00/);
  const reversed = snapshotSms(event('payment_reversed'), hospital).text;
  assert.match(reversed, /Reversed LKR 2,000.00/);
  assert.match(reversed, /Record correction, not a refund/);
  assert.match(snapshotSms(event('bill_updated'), hospital).text, /Due 25 Oct 2026/);
});

test('long names, Unicode and maximum amounts cannot exceed budget or truncate critical values', () => {
  for (const kind of kinds) {
    for (const brand of [{ name: 'A'.repeat(120) }, { name: 'රෝහල' }, { name: '^'.repeat(16) }]) {
      const content = snapshotSms(
        event(kind, {
          doctorName: 'Doctor '.repeat(30),
          reference: 'HMS-' + 'A'.repeat(28),
          paymentReference: 'RCT-' + 'B'.repeat(28),
          totalMinor: Number.MAX_SAFE_INTEGER,
          balanceMinor: Number.MAX_SAFE_INTEGER,
          paymentAmountMinor: Number.MAX_SAFE_INTEGER,
          consultationFeeMinor: Number.MAX_SAFE_INTEGER,
        }),
        brand,
      );
      assert.ok(isSingleSegmentSms(content.text), kind);
      assert.doesNotMatch(content.text, /Doctor Doctor|\.\.\.|undefined/);
      if (content.text.includes('LKR'))
        assert.ok(content.text.includes('LKR 90,071,992,547,409.91'));
      if (kind === 'payment_reversed') assert.match(content.text, /not a refund/);
    }
  }
  assert.ok(
    !snapshotSms(event('appointment_booked', { doctorName: 'වෛද්‍යවරයා' }), hospital).text.includes(
      'Doctor:',
    ),
  );
  assert.ok(
    !snapshotSms(event('appointment_booked'), { name: 'DRAFT BRAND', isDemo: true }).text.includes(
      'DRAFT BRAND',
    ),
  );
});

test('GSM-7 budget counts extension characters twice and rejects Unicode overflow', () => {
  assert.equal(smsUnits('a'.repeat(160)), 160);
  assert.equal(smsUnits('^{}\\[~]|€'), 18);
  assert.equal(isSingleSegmentSms('^'.repeat(80)), true);
  assert.equal(isSingleSegmentSms('^'.repeat(81)), false);
  assert.equal(isSingleSegmentSms('SMS 😊'), false);
  assert.equal(isSingleSegmentSms('“SMS”'), false);
  assert.equal(isSingleSegmentSms(''), false);
});

test('unknown event types never leak free text and stored SMS does not change with source edits', () => {
  const unknown = snapshotSms(event('toString'), hospital);
  assert.equal(unknown.kind, 'portal_update');
  assert.doesNotMatch(unknown.text, /PRIVATE|HMS-1234567890/);
  const input = event('appointment_booked');
  const content = snapshotSms(input, hospital);
  input.email.startsAt = '2027-01-01T00:00:00Z';
  assert.match(content.text, /20 Oct 2026/);
});

test('Notify.lk and Twilio send the SMS snapshot, ignore email bodies and block oversized snapshots', async () => {
  const smsContent = snapshotSms(event('appointment_booked'), hospital);
  const config = {
    origin: 'http://localhost:5173',
    delivery: {
      ...deliveryConfig({}),
      notifylk: { userId: '123', apiKey: 'synthetic', senderId: 'NotifyDEMO' },
      twilio: { account: `AC${'a'.repeat(32)}`, token: 'synthetic', from: 'SmartHMS' },
    },
  };
  let requests = 0;
  const transports = createTransports(config, {
    fetchImpl: async (url, options) => {
      requests++;
      const notify = url.startsWith('https://app.notify.lk/');
      assert.equal(options.body.get(notify ? 'message' : 'Body'), smsContent.text);
      assert.ok(!options.body.toString().includes('PRIVATE'));
      return {
        ok: true,
        json: async () =>
          notify
            ? { status: 'success', data: 'Sent' }
            : { sid: `SM${'a'.repeat(32)}`, status: 'queued' },
      };
    },
  });
  for (const transport of ['notifylk', 'twilio']) {
    const job = { channel: 'sms', transport, destination: '+94770000000', smsContent };
    assert.equal((await transports.send(job, { text: 'PRIVATE email body' })).status, 'accepted');
    for (const text of ['a'.repeat(161), '^'.repeat(81), 'Unicode 😊'])
      await assert.rejects(transports.send({ ...job, smsContent: { ...smsContent, text } }), {
        deliveryCode: 'invalid_sms_content',
      });
  }
  assert.equal(requests, 2);
});
