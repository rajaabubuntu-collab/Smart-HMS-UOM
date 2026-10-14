import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, httpError } from '../auth.js';
import { Delivery, User, audit } from '../models.js';
import { parse, pageSchema } from '../validation.js';
import { deliveryConfig, deliveryMessage, sriLankanMobile } from './delivery-config.js';
import mongoose from 'mongoose';
import { renderEmail } from './email-content.js';

function mask(address, channel) {
  return channel === 'email'
    ? `${address.slice(0, 1)}***@${address.split('@')[1]}`
    : `${address.slice(0, 3)}*****${address.slice(-3)}`;
}
export function deliveryRouter(config) {
  const router = Router();
  const modes = config.delivery || deliveryConfig({});
  router.get('/notifications/preferences', allowRoles('patient'), (req, res) => {
    res.json({
      preferences: {
        email: Boolean(req.user.notificationPreferences?.email),
        sms: Boolean(req.user.notificationPreferences?.sms),
      },
      modes: { email: modes.email, sms: modes.sms },
    });
  });
  router.patch('/notifications/preferences', allowRoles('patient'), async (req, res) => {
    const preferences = parse(
      z.object({ email: z.boolean(), sms: z.boolean() }).strict(),
      req.body,
    );
    if (preferences.sms && !sriLankanMobile(req.user.phone))
      throw httpError(
        400,
        'Add a valid Sri Lankan mobile number to My profile first (07XXXXXXXX or +947XXXXXXXX).',
      );
    await mongoose.connection.transaction(async (session) => {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { notificationPreferences: preferences } },
        { session },
      );
      await audit(
        req.user._id,
        'notification_preferences_updated',
        'notifications',
        req.user._id,
        session,
      );
    });
    res.json({ preferences });
  });
  async function history(req, res) {
    const { page, limit } = parse(pageSchema, req.query);
    const filter = req.user.role === 'admin' ? {} : { recipient: req.user._id };
    const records = await Delivery.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(req.user.role === 'patient' ? '+destination +emailContent' : '+destination')
      .lean();
    res.json({
      modes: { email: modes.email, sms: modes.sms },
      page,
      limit,
      total: await Delivery.countDocuments(filter),
      records: records.map((job) => ({
        id: job._id,
        channel: job.channel,
        transport: job.transport,
        destination: mask(job.destination, job.channel),
        status: job.status,
        attempts: job.attempts,
        createdAt: job.createdAt,
        lastError: job.lastError,
        emailSubject:
          job.channel === 'email' && job.emailContent ? job.emailContent.subject : undefined,
        preview:
          job.transport === 'local'
            ? job.channel === 'email' && job.emailContent
              ? renderEmail(job.emailContent, config.origin).text
              : deliveryMessage(config.origin)
            : undefined,
      })),
    });
  }
  router.get('/notifications/deliveries', allowRoles('patient'), history);
  router.get('/admin/deliveries', allowRoles('admin'), history);
  return router;
}
