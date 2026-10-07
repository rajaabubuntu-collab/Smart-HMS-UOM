import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { allowRoles, httpError } from '../auth.js';
import { AuditLog, User } from '../models.js';
import { pageSchema, parse } from '../validation.js';
import { dateSchema } from '../scheduling/validation.js';
import { hospitalDate, hospitalTimezone } from '../scheduling/time.js';
import { reports } from './definitions.js';
import { escapeRegex, generateReport, rangeBounds } from './service.js';
const date = dateSchema.refine(
  (d) => d >= '1900-01-01' && d <= '2199-12-31',
  'Use a date from 1900 to 2199.',
);
const range = (schema) =>
  schema
    .refine((q) => q.from <= q.to, {
      path: ['to'],
      message: 'End date must not be before start date.',
    })
    .refine((q) => (new Date(q.to) - new Date(q.from)) / 86400000 < 366, {
      path: ['to'],
      message: 'Choose a range of at most 366 days.',
    });
const reportQuery = range(
  pageSchema.extend({ from: date.default(hospitalDate), to: date.default(hospitalDate) }).strict(),
);
const auditQuery = range(
  pageSchema
    .extend({
      from: date.default(hospitalDate),
      to: date.default(hospitalDate),
      user: z.string().trim().max(100).default(''),
      action: z.string().trim().max(100).default(''),
      module: z.string().trim().max(100).default(''),
      q: z.string().trim().max(100).default(''),
    })
    .strict(),
);
export function reportingRouter() {
  const router = Router();
  router.use(['/admin/reports', '/admin/audit'], allowRoles('admin'));
  router.get('/admin/reports', (req, res) => {
    parse(z.object({}).strict(), req.query);
    res.json({ reports: Object.entries(reports).map(([id, report]) => ({ id, ...report })) });
  });
  router.get('/admin/reports/:type', async (req, res) => {
    const type = parse(z.enum(Object.keys(reports)), req.params.type);
    const query = parse(reportQuery, req.query),
      definition = reports[type];
    if (definition.singleDay && query.from !== query.to)
      throw httpError(400, 'Daily appointments requires the same start and end date.');
    const generatedAt = new Date();
    let result;
    // All facets and joins read a consistent database snapshot without altering source records.
    await mongoose.connection.transaction(
      async (session) => {
        result = await generateReport(type, query, generatedAt, session);
      },
      { readConcern: { level: 'snapshot' } },
    );
    res.json({
      report: { id: type, title: definition.title, basis: definition.basis },
      period: { from: query.from, to: query.to, timezone: hospitalTimezone, generatedAt },
      columns: definition.columns,
      summary: definition.metrics.map(({ key, label, format }) => ({
        key,
        label,
        format,
        value: Object.hasOwn(result.totals, key) ? result.totals[key] : 0,
      })),
      records: result.records,
      total: result.total,
      page: query.page,
      limit: query.limit,
    });
  });
  router.get('/admin/audit/options', async (req, res) => {
    parse(z.object({}).strict(), req.query);
    const actions = await AuditLog.distinct('action'),
      modules = await AuditLog.distinct('module');
    res.json({ actions: actions.sort(), modules: modules.sort() });
  });
  router.get('/admin/audit', async (req, res) => {
    const { from, to, page, limit, user, action, module, q } = parse(auditQuery, req.query);
    const match = {
      createdAt: rangeBounds(from, to),
      ...(action ? { action } : {}),
      ...(module ? { module } : {}),
    };
    const stages = [
      { $match: match },
      {
        $lookup: {
          from: User.collection.name,
          localField: 'actor',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, role: 1 } }],
          as: 'account',
        },
      },
      {
        $project: {
          id: '$_id',
          actorId: { $ifNull: ['$actor', null] },
          actorName: { $ifNull: [{ $arrayElemAt: ['$account.name', 0] }, 'Unlinked actor'] },
          actorRole: { $ifNull: [{ $arrayElemAt: ['$account.role', 0] }, null] },
          action: 1,
          module: 1,
          target: 1,
          createdAt: 1,
        },
      },
    ];
    if (user)
      stages.push({
        $match: /^[a-f\d]{24}$/i.test(user)
          ? { actorId: new mongoose.Types.ObjectId(user) }
          : { actorName: { $regex: escapeRegex(user), $options: 'i' } },
      });
    if (q)
      stages.push({
        $match: {
          $or: ['action', 'module', 'target'].map((field) => ({
            [field]: { $regex: escapeRegex(q), $options: 'i' },
          })),
        },
      });
    const [result] = await AuditLog.aggregate([
      ...stages,
      {
        $facet: {
          records: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { _id: 0 } },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ]).option({ maxTimeMS: 10000 });
    res.json({
      records: result.records,
      total: result.total[0]?.value || 0,
      page,
      limit,
      period: { from, to, timezone: hospitalTimezone },
    });
  });
  return router;
}
