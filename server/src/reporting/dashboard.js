import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Appointment, Doctor, Patient, Payment } from '../models.js';
import { parse } from '../validation.js';
import { hospitalDate, hospitalTimezone, dayBounds } from '../scheduling/time.js';
import { httpError } from '../auth.js';

const statuses = ['Scheduled', 'Waiting', 'In Consultation', 'Completed', 'Cancelled'];
const day = (field) => ({
  $dateToString: { date: field, format: '%Y-%m-%d', timezone: hospitalTimezone },
});
export function dashboardRouter() {
  const router = Router();
  router.get('/dashboard/analytics', async (req, res) => {
    const { window } = parse(
      z.object({ window: z.enum(['recent', 'upcoming']).default('recent') }).strict(),
      req.query,
    );
    const today = dayBounds(hospitalDate()).start;
    const start = new Date(today.getTime() + (window === 'recent' ? -6 : 0) * 86400000);
    const end = new Date(start.getTime() + 7 * 86400000);
    const dates = Array.from({ length: 7 }, (_, i) =>
      hospitalDate(new Date(start.getTime() + i * 86400000)),
    );
    const match = { startsAt: { $gte: start, $lt: end } };
    if (req.user.role === 'patient' || req.user.role === 'doctor') {
      const profile = await (req.user.role === 'patient' ? Patient : Doctor)
        .findOne({ user: req.user._id })
        .select('_id');
      if (!profile) throw httpError(404, 'Profile not found.');
      match[req.user.role] = profile._id;
    }
    let result;
    await mongoose.connection.transaction(
      async (session) => {
        const [facets] = await Appointment.aggregate([
          { $match: match },
          {
            $facet: {
              days: [{ $group: { _id: day('$startsAt'), value: { $sum: 1 } } }],
              statuses: [{ $group: { _id: '$status', value: { $sum: 1 } } }],
              ...(req.user.role === 'admin'
                ? {
                    departments: [
                      { $group: { _id: '$departmentName', value: { $sum: 1 } } },
                      { $sort: { value: -1, _id: 1 } },
                      { $limit: 10 },
                    ],
                  }
                : {}),
            },
          },
        ]).session(session);
        const fill = (labels, rows) =>
          labels.map((label) => ({ label, value: rows.find((r) => r._id === label)?.value || 0 }));
        result = {
          from: dates[0],
          to: dates.at(-1),
          timezone: hospitalTimezone,
          scope:
            req.user.role === 'patient'
              ? 'Your appointments'
              : req.user.role === 'doctor'
                ? 'Your assigned appointments'
                : 'Hospital appointments',
          days: fill(dates, facets.days),
          statuses: fill(statuses, facets.statuses),
        };
        if (req.user.role === 'admin') {
          result.departments = facets.departments.map((r) => ({ label: r._id, value: r.value }));
          const [payments] = await Payment.aggregate([
            {
              $facet: {
                receipts: [
                  { $match: { createdAt: { $gte: start, $lt: end } } },
                  { $group: { _id: day('$createdAt'), value: { $sum: '$amountMinor' } } },
                ],
                reversals: [
                  { $match: { reversedAt: { $gte: start, $lt: end } } },
                  { $group: { _id: day('$reversedAt'), value: { $sum: '$amountMinor' } } },
                ],
              },
            },
          ]).session(session);
          result.revenue = dates.map((label) => ({
            label,
            value:
              (payments.receipts.find((r) => r._id === label)?.value || 0) -
              (payments.reversals.find((r) => r._id === label)?.value || 0),
          }));
        }
      },
      { readConcern: { level: 'snapshot' } },
    );
    res.json(result);
  });
  return router;
}
