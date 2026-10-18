import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Enquiry, audit } from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { parse, pageSchema, objectId, email } from '../validation.js';
import { sriLankanPhone } from '../settings/phone.js';

const status = z.enum(['new', 'in_progress', 'resolved']);
const enquirySchema = z
  .object({
    requestId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    email,
    phone: z
      .string()
      .trim()
      .max(30)
      .default('')
      .refine((v) => !v || sriLankanPhone(v), 'Enter a valid Sri Lankan phone number.')
      .transform((v) => (v ? sriLankanPhone(v) : '')),
    subject: z.enum(['appointments', 'services', 'visiting', 'billing', 'other']),
    message: z.string().trim().min(10).max(2000),
    consent: z.literal(true),
    website: z.string().max(0).default(''),
  })
  .strict();
const confirmation = (record) => ({ reference: record.reference });
export function publicEnquiryRouter({ rateLimitEnabled = true } = {}) {
  const router = Router();
  if (rateLimitEnabled)
    router.use(
      '/public/enquiries',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 5,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { message: 'Too many enquiries. Please try again later or contact reception.' },
      }),
    );
  router.post('/public/enquiries', async (req, res) => {
    const { consent: _consent, website: _website, ...data } = parse(enquirySchema, req.body);
    try {
      const enquiry = await Enquiry.create({
        ...data,
        reference: `ENQ-${randomBytes(6).toString('hex').toUpperCase()}`,
      });
      res.status(201).json(confirmation(enquiry));
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.requestId) throw error;
      const existing = await Enquiry.findOne({ requestId: data.requestId }).select('+requestId');
      if (!existing || !Object.entries(data).every(([key, value]) => existing[key] === value))
        throw httpError(
          409,
          'This enquiry changed. Refresh the page before sending a new enquiry.',
        );
      res.status(200).json(confirmation(existing));
    }
  });
  return router;
}
export function staffEnquiryRouter() {
  const router = Router();
  router.use('/enquiries', allowRoles('admin', 'receptionist'));
  router.get('/enquiries', async (req, res) => {
    const {
      page,
      limit,
      status: state,
    } = parse(pageSchema.extend({ status: status.optional() }).strict(), req.query);
    const filter = state ? { status: state } : {};
    const [items, total] = await Promise.all([
      Enquiry.find(filter)
        .select('-__v -updatedBy')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Enquiry.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  });
  router.patch('/enquiries/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const data = parse(z.object({ status, expectedStatus: status }).strict(), req.body);
    await mongoose.connection.transaction(async (session) => {
      const enquiry = await Enquiry.findOneAndUpdate(
        { _id: id, status: data.expectedStatus },
        { $set: { status: data.status, updatedBy: req.user._id } },
        { session, returnDocument: 'after' },
      );
      if (!enquiry) throw httpError(409, 'Enquiry changed. Refresh and try again.');
      await audit(req.user._id, 'enquiry_status_updated', 'enquiries', id, session);
    });
    res.json({ status: data.status });
  });
  return router;
}
