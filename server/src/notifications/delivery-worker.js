import { Delivery, User } from '../models.js';
import { sriLankanMobile } from './delivery-config.js';
import { createTransports } from './transports.js';
import { startReminderWorker } from './reminders.js';
import { renderEmail } from './email-content.js';

export async function runDeliveryBatch(
  config,
  { now = new Date(), limit = 20, transports = createTransports(config) } = {},
) {
  // A crash after an external send is ambiguous. Never blindly send again.
  await Delivery.updateMany(
    { status: 'processing', startedAt: { $lt: new Date(now.getTime() - 120000) } },
    { $set: { status: 'unknown', lastError: 'interrupted_delivery_check_provider' } },
  );
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await Delivery.findOneAndUpdate(
      { status: 'queued', nextAttemptAt: { $lte: now } },
      { $set: { status: 'processing', startedAt: now }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    ).select('+destination +emailContent +smsContent');
    if (!job) break;
    processed++;
    const user = await User.findById(job.recipient);
    const currentAddress =
      job.channel === 'email' ? user?.email : sriLankanMobile(user?.phone || '');
    let outcome;
    if (
      !user?.isActive ||
      !user.notificationPreferences?.[job.channel] ||
      currentAddress !== job.destination
    )
      outcome = { status: 'skipped', lastError: 'recipient_or_preference_changed' };
    else if (config.delivery[job.channel] !== job.transport)
      outcome = { status: 'skipped', lastError: 'transport_changed' };
    else if (
      job.transport !== 'local' &&
      !config.delivery.allowed.includes(job.destination.toLowerCase())
    )
      outcome = { status: 'skipped', lastError: 'recipient_not_approved' };
    else {
      try {
        const content =
          job.channel === 'email' && job.emailContent
            ? renderEmail(job.emailContent, config.origin)
            : undefined;
        outcome = await transports.send(job, content);
      } catch (error) {
        outcome = error.deliveryCode
          ? {
              status: error.retryable && job.attempts < 3 ? 'queued' : 'failed',
              nextAttemptAt: new Date(now.getTime() + 60000 * 2 ** (job.attempts - 1)),
              lastError: error.deliveryCode,
            }
          : { status: 'unknown', lastError: 'provider_result_uncertain' };
      }
    }
    await Delivery.updateOne(
      { _id: job._id, status: 'processing' },
      { $set: { ...outcome, checkedAt: now } },
    );
  }
  if (config.delivery.sms === 'twilio') {
    const accepted = await Delivery.find({
      status: 'accepted',
      transport: 'twilio',
      checkedAt: { $lte: new Date(now.getTime() - 60000) },
    })
      .sort({ checkedAt: 1 })
      .limit(limit)
      .select('+providerId');
    for (const job of accepted) {
      let outcome;
      if (now - job.createdAt > 86400000)
        outcome = { status: 'unknown', lastError: 'delivery_receipt_unconfirmed' };
      else {
        try {
          outcome = await transports.receipt(job);
        } catch {
          outcome = { lastError: 'receipt_check_unavailable' };
        }
      }
      await Delivery.updateOne(
        { _id: job._id, status: 'accepted' },
        { $set: { ...outcome, checkedAt: now } },
      );
    }
  }
  return { processed };
}
export function startDeliveryWorker(config) {
  const transports = createTransports(config);
  return startReminderWorker({
    intervalMs: 5000,
    run: () => runDeliveryBatch(config, { transports }),
    onError: () => console.error('Delivery queue check failed; queued messages remain stored.'),
  });
}
