import { sriLankanPhone } from '../settings/phone.js';
import { z } from 'zod';

const schema = z.object({
  EMAIL_TRANSPORT: z.enum(['off', 'local', 'smtp']).default('local'),
  SMS_TRANSPORT: z.enum(['off', 'local', 'twilio', 'notifylk']).default('local'),
  ALLOW_LIVE_DELIVERY: z.enum(['true', 'false']).default('false'),
  DELIVERY_ALLOWED_RECIPIENTS: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM: z.string().default(''),
  TWILIO_MESSAGING_SERVICE_SID: z.string().default(''),
  NOTIFYLK_USER_ID: z.string().trim().default(''),
  NOTIFYLK_API_KEY: z.string().trim().default(''),
  NOTIFYLK_SENDER_ID: z.string().trim().default('NotifyDEMO'),
});
export function deliveryConfig(environment = process.env) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success)
    throw new Error('Invalid delivery configuration. Check notification environment settings.');
  const e = parsed.data;
  const allowed = e.DELIVERY_ALLOWED_RECIPIENTS.split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const live = e.EMAIL_TRANSPORT === 'smtp' || ['twilio', 'notifylk'].includes(e.SMS_TRANSPORT);
  if (live && (e.ALLOW_LIVE_DELIVERY !== 'true' || !allowed.length))
    throw new Error(
      'Live delivery requires ALLOW_LIVE_DELIVERY=true and explicit DELIVERY_ALLOWED_RECIPIENTS.',
    );
  if (
    e.EMAIL_TRANSPORT === 'smtp' &&
    (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASSWORD || !z.email().safeParse(e.EMAIL_FROM).success)
  )
    throw new Error('SMTP host, credentials and a valid EMAIL_FROM are required.');
  if (
    e.SMS_TRANSPORT === 'twilio' &&
    (!/^AC[a-f\d]{32}$/i.test(e.TWILIO_ACCOUNT_SID) ||
      !e.TWILIO_AUTH_TOKEN ||
      !(e.TWILIO_MESSAGING_SERVICE_SID
        ? /^MG[a-f\d]{32}$/i.test(e.TWILIO_MESSAGING_SERVICE_SID)
        : /^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/.test(e.TWILIO_FROM)))
  )
    throw new Error(
      'Twilio requires account credentials and a registered alphanumeric sender or Messaging Service SID.',
    );
  if (
    e.SMS_TRANSPORT === 'notifylk' &&
    (!/^\d+$/.test(e.NOTIFYLK_USER_ID) ||
      !e.NOTIFYLK_API_KEY ||
      !/^[A-Za-z0-9 ]{1,11}$/.test(e.NOTIFYLK_SENDER_ID) ||
      !/[A-Za-z0-9]/.test(e.NOTIFYLK_SENDER_ID))
  )
    throw new Error(
      'Notify.lk requires NOTIFYLK_USER_ID, NOTIFYLK_API_KEY and a valid NOTIFYLK_SENDER_ID.',
    );
  return {
    email: e.EMAIL_TRANSPORT,
    sms: e.SMS_TRANSPORT,
    allowed,
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      from: e.EMAIL_FROM,
    },
    twilio: {
      account: e.TWILIO_ACCOUNT_SID,
      token: e.TWILIO_AUTH_TOKEN,
      from: e.TWILIO_FROM,
      service: e.TWILIO_MESSAGING_SERVICE_SID,
    },
    notifylk: {
      userId: e.NOTIFYLK_USER_ID,
      apiKey: e.NOTIFYLK_API_KEY,
      senderId: e.NOTIFYLK_SENDER_ID,
    },
  };
}
export function sriLankanMobile(value) {
  return sriLankanPhone(value, { mobileOnly: true });
}
export const deliveryMessage = (origin) =>
  `Smart HMS: You have a new update in your patient portal. Sign in to view it: ${origin}/notifications`;
