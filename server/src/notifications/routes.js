import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../models.js';
import { httpError } from '../auth.js';
import { parse, objectId, pageSchema } from '../validation.js';
const listSchema = pageSchema.extend({ filter: z.enum(['all', 'unread']).default('all') }).strict();
export function notificationRouter() {
  const router = Router();
  router.get('/notifications/unread-count', async (req, res) => {
    res.json({
      unreadCount: await Notification.countDocuments({ recipient: req.user._id, readAt: null }),
    });
  });
  router.get('/notifications', async (req, res) => {
    const { page, limit, filter } = parse(listSchema, req.query);
    const asOf = new Date();
    const query = {
      recipient: req.user._id,
      createdAt: { $lte: asOf },
      ...(filter === 'unread' ? { readAt: null } : {}),
    };
    const records = await Notification.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-recipient -eventKey -__v')
      .lean();
    res.json({
      records,
      total: await Notification.countDocuments(query),
      page,
      limit,
      asOf,
      unreadCount: await Notification.countDocuments({ recipient: req.user._id, readAt: null }),
    });
  });
  router.patch('/notifications/:id', async (req, res) => {
    const id = parse(objectId, req.params.id),
      { read } = parse(z.object({ read: z.boolean() }).strict(), req.body);
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user._id },
      { $set: { readAt: read ? new Date() : null } },
      { returnDocument: 'after' },
    ).select('-recipient -eventKey -__v');
    if (!notification) throw httpError(404, 'Notification not found.');
    res.json({ notification });
  });
  router.post('/notifications/read-all', async (req, res) => {
    const { through } = parse(z.object({ through: z.iso.datetime() }).strict(), req.body);
    const result = await Notification.updateMany(
      { recipient: req.user._id, readAt: null, createdAt: { $lte: new Date(through) } },
      { $set: { readAt: new Date() } },
    );
    res.json({ updated: result.modifiedCount });
  });
  return router;
}
