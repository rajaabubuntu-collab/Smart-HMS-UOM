import nodemailer from 'nodemailer';
import { deliveryMessage } from './delivery-config.js';

export function deliveryFailure(code, retryable = false) {
  const error = new Error(code);
  error.deliveryCode = code;
  error.retryable = retryable;
  return error;
}
export function createTransports(
  config,
  { fetchImpl = fetch, mailFactory = nodemailer.createTransport } = {},
) {
  const d = config.delivery;
  const mail =
    d.email === 'smtp'
      ? mailFactory({
          host: d.smtp.host,
          port: d.smtp.port,
          secure: d.smtp.port === 465,
          requireTLS: true,
          auth: { user: d.smtp.user, pass: d.smtp.password },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          disableFileAccess: true,
          disableUrlAccess: true,
        })
      : mailFactory({ jsonTransport: true });
  async function twilio(path, options = {}) {
    const response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${d.twilio.account}/Messages${path}`,
      {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${d.twilio.account}:${d.twilio.token}`).toString('base64')}`,
          ...options.headers,
        },
      },
    );
    if (!response.ok) {
      if (response.status === 429) throw deliveryFailure('provider_rate_limit', true);
      if (response.status >= 400 && response.status < 500)
        throw deliveryFailure('provider_rejected');
      throw new Error('Provider result uncertain');
    }
    return response.json();
  }
  return {
    async send(job, content) {
      const text =
        job.channel === 'email' && content ? content.text : deliveryMessage(config.origin);
      const subject = content?.subject ?? 'Smart HMS portal update';
      const emailFields = {
        subject,
        text,
        ...(content?.html ? { html: content.html } : {}),
        ...(content?.replyTo ? { replyTo: content.replyTo } : {}),
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
      };
      if (job.transport === 'local') {
        if (job.channel === 'email')
          await nodemailer.createTransport({ jsonTransport: true }).sendMail({
            from: 'demo@smarthms.local',
            to: job.destination,
            ...emailFields,
          });
        return { status: 'simulated', providerStatus: 'local_preview_only' };
      }
      if (job.channel === 'email') {
        try {
          const result = await mail.sendMail({
            from: content?.senderName
              ? { name: content.senderName, address: d.smtp.from }
              : d.smtp.from,
            to: job.destination,
            ...emailFields,
            messageId: `<${job._id}@${new URL(config.origin).hostname}>`,
          });
          if (!result.accepted?.length) throw deliveryFailure('provider_rejected');
          return {
            status: 'accepted',
            providerId: result.messageId,
            providerStatus: 'smtp_accepted',
          };
        } catch (error) {
          if (error.responseCode)
            throw deliveryFailure(
              'smtp_rejected',
              error.responseCode >= 400 && error.responseCode < 500,
            );
          throw error;
        }
      }
      const result = await twilio('.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          To: job.destination,
          ...(d.twilio.service
            ? { MessagingServiceSid: d.twilio.service }
            : { From: d.twilio.from }),
          Body: text,
        }),
      });
      if (!/^SM[a-f\d]{32}$/i.test(result.sid)) throw new Error('Provider result uncertain');
      return {
        status: ['failed', 'undelivered'].includes(result.status)
          ? 'failed'
          : result.status === 'delivered'
            ? 'delivered'
            : 'accepted',
        providerId: result.sid,
        providerStatus: result.status,
      };
    },
    async receipt(job) {
      if (!/^SM[a-f\d]{32}$/i.test(job.providerId))
        throw deliveryFailure('invalid_provider_reference');
      const result = await twilio(`/${job.providerId}.json`);
      return {
        status:
          result.status === 'delivered'
            ? 'delivered'
            : ['failed', 'undelivered', 'canceled'].includes(result.status)
              ? 'failed'
              : 'accepted',
        providerStatus: result.status,
      };
    },
  };
}
