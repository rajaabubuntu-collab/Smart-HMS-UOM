import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { HospitalSettings, audit } from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { parse } from '../validation.js';
import { sriLankanPhone } from './phone.js';

const id = '000000000000000000000001';
export const regionalDefaults = { timezone: 'Asia/Colombo', currency: 'LKR', language: 'English' };
export const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
export function defaultHospitalDetails() {
  return {
    name: '',
    description: '',
    address: '',
    phone: '',
    email: '',
    visitNotes: '',
    isDemo: true,
    hours: weekdays.map((day) => ({ day, closed: true, allDay: false, opens: '', closes: '' })),
  };
}
const text = (max) => z.string().trim().max(max);
const time = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]);
const detailsSchema = z
  .object({
    name: text(120),
    description: text(600),
    address: text(400),
    visitNotes: text(600),
    isDemo: z.boolean(),
    phone: text(30)
      .refine(
        (v) => !v || sriLankanPhone(v),
        'Use a Sri Lankan number such as 0112345678 or +94112345678.',
      )
      .transform((v) => (v ? sriLankanPhone(v) : '')),
    email: text(254)
      .toLowerCase()
      .refine((v) => !v || z.email().safeParse(v).success, 'Enter a valid email address.'),
    hours: z
      .array(
        z
          .object({
            day: z.enum(weekdays),
            closed: z.boolean(),
            allDay: z.boolean(),
            opens: time,
            closes: time,
          })
          .strict(),
      )
      .length(7),
  })
  .strict()
  .superRefine((v, ctx) => {
    v.hours.forEach((h, i) => {
      if (h.day !== weekdays[i])
        ctx.addIssue({
          code: 'custom',
          path: ['hours', i, 'day'],
          message: 'List each weekday once, Monday to Sunday.',
        });
      if (h.closed && h.allDay)
        ctx.addIssue({
          code: 'custom',
          path: ['hours', i, 'allDay'],
          message: 'A day cannot be both closed and open 24 hours.',
        });
      if (!h.closed && !h.allDay && (!h.opens || !h.closes || h.opens >= h.closes))
        ctx.addIssue({
          code: 'custom',
          path: ['hours', i, 'closes'],
          message: 'Closing time must be later than opening time on the same day.',
        });
    });
  })
  .transform((v) => ({
    ...v,
    hours: v.hours.map((h) => (h.closed || h.allDay ? { ...h, opens: '', closes: '' } : h)),
  }));
const versionSchema = z
  .object({
    version: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();
const draftSchema = versionSchema.extend({ details: detailsSchema });
function publishable(details) {
  const value = parse(detailsSchema, details);
  const fields = {};
  for (const key of ['name', 'address', 'phone'])
    if (!value[key]) fields[`details.${key}`] = 'Required before publication.';
  if (!value.hours.some((h) => !h.closed))
    fields['details.hours'] =
      'Add at least one day with reception opening hours before publication.';
  if (Object.keys(fields).length) {
    const error = httpError(
      400,
      'Complete the hospital name, address, reception number and opening hours before publishing.',
    );
    error.fields = fields;
    throw error;
  }
  return value;
}
function adminView(doc) {
  return {
    version: doc?.version || 0,
    details: doc?.draft || defaultHospitalDetails(),
    published: doc?.published || null,
    publishedAt: doc?.publishedAt || null,
    regional: regionalDefaults,
  };
}
export function publicHospitalRouter() {
  const router = Router();
  router.get('/public/hospital', async (req, res) => {
    parse(z.object({}).strict(), req.query);
    const doc = await HospitalSettings.findById(id).lean();
    // Explicit projection: drafts, edit history, account data and secrets are never public.
    const published = doc?.published;
    res.json({
      regional: regionalDefaults,
      hospital: published
        ? {
            name: published.name,
            description: published.description,
            address: published.address,
            phone: published.phone,
            email: published.email,
            visitNotes: published.visitNotes,
            isDemo: published.isDemo,
            hours: published.hours.map(({ day, closed, allDay, opens, closes }) => ({
              day,
              closed,
              allDay,
              opens,
              closes,
            })),
          }
        : null,
    });
  });
  return router;
}
export function hospitalSettingsRouter() {
  const router = Router();
  router.use('/admin/hospital-settings', allowRoles('admin'));
  router.get('/admin/hospital-settings', async (req, res) => {
    parse(z.object({}).strict(), req.query);
    res.json(adminView(await HospitalSettings.findById(id).lean()));
  });
  async function mutate(req, res, action) {
    const data = parse(action === 'save' ? draftSchema : versionSchema, req.body);
    let result;
    try {
      await mongoose.connection.transaction(async (session) => {
        const current = await HospitalSettings.findById(id).session(session).lean();
        if ((current?.version || 0) !== data.version)
          throw httpError(
            409,
            'Hospital settings changed in another tab. Reload the latest version before saving.',
          );
        if (action !== 'save' && !current) throw httpError(400, 'Save hospital details first.');
        const changes =
          action === 'save'
            ? { draft: data.details }
            : action === 'publish'
              ? { published: publishable(current.draft), publishedAt: new Date() }
              : { published: null, publishedAt: null };
        result = await HospitalSettings.findOneAndUpdate(
          { _id: id, ...(current ? { version: data.version } : {}) },
          { $set: { ...changes, updatedBy: req.user._id }, $inc: { version: 1 } },
          { session, upsert: !current, returnDocument: 'after', runValidators: true },
        ).lean();
        if (!result) throw httpError(409, 'Hospital settings changed. Reload before saving.');
        await audit(
          req.user._id,
          `hospital_settings_${action === 'save' ? 'saved' : action === 'publish' ? 'published' : 'unpublished'}`,
          'settings',
          id,
          session,
        );
      });
    } catch (error) {
      if (error.code === 11000)
        throw httpError(409, 'Hospital settings changed. Reload before saving.');
      throw error;
    }
    res.json(adminView(result));
  }
  router.patch('/admin/hospital-settings', (req, res) => mutate(req, res, 'save'));
  router.post('/admin/hospital-settings/publish', (req, res) => mutate(req, res, 'publish'));
  router.post('/admin/hospital-settings/unpublish', (req, res) => mutate(req, res, 'unpublish'));
  return router;
}
