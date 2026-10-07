import {
  Appointment,
  DoctorSchedule,
  Consultation,
  Patient,
  Payment,
  Bill,
  Feedback,
  User,
  Doctor,
  Department,
  AppointmentSlot,
} from '../models.js';
import { hospitalDate, hospitalTimezone, dayBounds } from '../scheduling/time.js';

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function rangeBounds(from, to) {
  return { $gte: dayBounds(from).start, $lt: dayBounds(to).end };
}
const day = (field) => ({
  $dateToString: { date: field, format: '%Y-%m-%d', timezone: hospitalTimezone },
});
const countIf = (test) => ({ $sum: { $cond: [test, 1, 0] } });
const eq = (field, value) => ({ $eq: [field, value] });
const sum = (field) => ({ $sum: `$${field}` });
const join = (model, localField, as, fields) => ({
  $lookup: {
    from: model.collection.name,
    localField,
    foreignField: '_id',
    pipeline: [{ $project: fields }],
    as,
  },
});
const first = (path, fallback = 'Unavailable') => ({
  $ifNull: [{ $arrayElemAt: [path, 0] }, fallback],
});
const doctorJoins = [
  join(Doctor, 'doctor', 'doctorProfile', { user: 1, department: 1 }),
  join(User, 'doctorProfile.user', 'doctorUser', { name: 1 }),
  join(Department, 'doctorProfile.department', 'department', { name: 1 }),
];
export function reportPipeline(type, { from, to }, generatedAt) {
  const bounds = rangeBounds(from, to);
  let model,
    stages = [],
    summary = { count: { $sum: 1 } },
    sort = { _id: 1 };
  switch (type) {
    case 'appointments':
      model = Appointment;
      stages = [
        { $match: { startsAt: bounds } },
        join(Patient, 'patient', 'patientProfile', { user: 1 }),
        join(User, 'patientProfile.user', 'patientUser', { name: 1 }),
        {
          $project: {
            reference: 1,
            startsAt: 1,
            doctorName: 1,
            departmentName: 1,
            status: 1,
            patientName: first('$patientUser.name'),
          },
        },
      ];
      sort = { startsAt: 1, _id: 1 };
      summary = {
        count: { $sum: 1 },
        completed: countIf(eq('$status', 'Completed')),
        cancelled: countIf(eq('$status', 'Cancelled')),
        pending: countIf({ $not: [{ $in: ['$status', ['Completed', 'Cancelled']] }] }),
      };
      break;
    case 'schedules':
      model = DoctorSchedule;
      stages = [
        { $match: { startsAt: bounds } },
        ...doctorJoins,
        {
          $lookup: {
            from: AppointmentSlot.collection.name,
            localField: '_id',
            foreignField: 'schedule',
            pipeline: [
              {
                $group: {
                  _id: null,
                  slots: { $sum: 1 },
                  activeSlots: countIf(eq('$isActive', true)),
                },
              },
            ],
            as: 'capacity',
          },
        },
        {
          $project: {
            startsAt: 1,
            endsAt: 1,
            doctorName: first('$doctorUser.name'),
            departmentName: first('$department.name'),
            state: { $cond: ['$isActive', 'Active', 'Closed'] },
            slots: first('$capacity.slots', 0),
            activeSlots: first('$capacity.activeSlots', 0),
          },
        },
      ];
      sort = { startsAt: 1, _id: 1 };
      summary = {
        count: { $sum: 1 },
        active: countIf(eq('$state', 'Active')),
        slots: sum('slots'),
        activeSlots: sum('activeSlots'),
      };
      break;
    case 'consultations':
      model = Consultation;
      stages = [
        { $match: { status: 'Completed', completedAt: bounds } },
        { $group: { _id: day('$completedAt'), count: { $sum: 1 } } },
        { $project: { date: '$_id', count: 1 } },
      ];
      sort = { date: 1 };
      summary = { count: sum('count') };
      break;
    case 'registrations':
      model = Patient;
      stages = [
        { $match: { createdAt: bounds } },
        join(User, 'user', 'account', { name: 1 }),
        {
          $project: { patientId: '$_id', name: first('$account.name'), registeredAt: '$createdAt' },
        },
      ];
      sort = { registeredAt: 1, _id: 1 };
      break;
    case 'demographics': {
      model = Patient;
      const age = {
        $subtract: [
          {
            $subtract: [
              Number(to.slice(0, 4)),
              {
                $convert: {
                  input: { $substrCP: ['$dateOfBirth', 0, 4] },
                  to: 'int',
                  onError: null,
                  onNull: null,
                },
              },
            ],
          },
          { $cond: [{ $gt: [{ $substrCP: ['$dateOfBirth', 5, 5] }, to.slice(5)] }, 1, 0] },
        ],
      };
      stages = [
        { $match: { createdAt: bounds } },
        {
          $set: {
            age: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        {
                          $dateFromString: {
                            dateString: '$dateOfBirth',
                            onError: null,
                            onNull: null,
                          },
                        },
                        null,
                      ],
                    },
                    { $lte: ['$dateOfBirth', to] },
                  ],
                },
                age,
                null,
              ],
            },
          },
        },
        {
          $set: {
            ageBand: {
              $switch: {
                branches: [
                  { case: eq('$age', null), then: 'Unknown' },
                  { case: { $lt: ['$age', 18] }, then: '0–17' },
                  { case: { $lt: ['$age', 35] }, then: '18–34' },
                  { case: { $lt: ['$age', 50] }, then: '35–49' },
                  { case: { $lt: ['$age', 65] }, then: '50–64' },
                ],
                default: '65+',
              },
            },
          },
        },
        { $group: { _id: { ageBand: '$ageBand', gender: '$gender' }, count: { $sum: 1 } } },
        { $project: { ageBand: '$_id.ageBand', gender: '$_id.gender', count: 1 } },
      ];
      sort = { ageBand: 1, gender: 1 };
      summary = {
        count: sum('count'),
        unknownAge: { $sum: { $cond: [eq('$ageBand', 'Unknown'), '$count', 0] } },
      };
      break;
    }
    case 'revenue': {
      model = Payment;
      const inPeriod = (field) => ({
        $and: [{ $gte: [field, bounds.$gte] }, { $lt: [field, bounds.$lt] }],
      });
      stages = [
        { $match: { $or: [{ createdAt: bounds }, { reversedAt: bounds }] } },
        {
          $project: {
            method: 1,
            amountMinor: 1,
            events: {
              $concatArrays: [
                { $cond: [inPeriod('$createdAt'), [{ at: '$createdAt', reversal: false }], []] },
                { $cond: [inPeriod('$reversedAt'), [{ at: '$reversedAt', reversal: true }], []] },
              ],
            },
          },
        },
        { $unwind: '$events' },
        {
          $group: {
            _id: { date: day('$events.at'), method: '$method' },
            receiptCount: countIf(eq('$events.reversal', false)),
            reversalCount: countIf(eq('$events.reversal', true)),
            receiptsMinor: { $sum: { $cond: ['$events.reversal', 0, '$amountMinor'] } },
            reversalsMinor: { $sum: { $cond: ['$events.reversal', '$amountMinor', 0] } },
          },
        },
        {
          $project: {
            date: '$_id.date',
            method: '$_id.method',
            receiptCount: 1,
            reversalCount: 1,
            receiptsMinor: 1,
            reversalsMinor: 1,
            netMinor: { $subtract: ['$receiptsMinor', '$reversalsMinor'] },
          },
        },
      ];
      sort = { date: 1, method: 1 };
      summary = {
        receiptsMinor: sum('receiptsMinor'),
        reversalsMinor: sum('reversalsMinor'),
        netMinor: sum('netMinor'),
      };
      break;
    }
    case 'billing':
      model = Bill;
      stages = [
        { $match: { createdAt: bounds } },
        {
          $set: {
            status: {
              $cond: [
                { $gte: ['$paidMinor', '$totalMinor'] },
                'Paid',
                { $cond: [{ $lt: ['$dueDate', hospitalDate(generatedAt)] }, 'Overdue', 'Pending'] },
              ],
            },
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalMinor: sum('totalMinor'),
            paidMinor: sum('paidMinor'),
            balanceMinor: { $sum: { $subtract: ['$totalMinor', '$paidMinor'] } },
          },
        },
        { $project: { status: '$_id', count: 1, totalMinor: 1, paidMinor: 1, balanceMinor: 1 } },
      ];
      summary = {
        count: sum('count'),
        totalMinor: sum('totalMinor'),
        paidMinor: sum('paidMinor'),
        balanceMinor: sum('balanceMinor'),
      };
      break;
    case 'workload':
      model = Consultation;
      stages = [
        { $match: { status: 'Completed', completedAt: bounds } },
        { $group: { _id: '$doctor', count: { $sum: 1 } } },
        { $set: { doctor: '$_id' } },
        ...doctorJoins,
        { $project: { doctorId: '$_id', doctorName: first('$doctorUser.name'), count: 1 } },
      ];
      sort = { count: -1, doctorId: 1 };
      summary = { count: sum('count'), doctors: { $sum: 1 } };
      break;
    case 'departments':
      model = Appointment;
      stages = [
        { $match: { startsAt: bounds } },
        {
          $group: {
            _id: '$departmentName',
            count: { $sum: 1 },
            completed: countIf(eq('$status', 'Completed')),
            cancelled: countIf(eq('$status', 'Cancelled')),
            nonCancelled: countIf({ $ne: ['$status', 'Cancelled'] }),
          },
        },
        {
          $project: {
            departmentName: '$_id',
            count: 1,
            completed: 1,
            cancelled: 1,
            nonCancelled: 1,
          },
        },
      ];
      summary = { count: sum('count'), completed: sum('completed'), cancelled: sum('cancelled') };
      break;
    case 'feedback':
      model = Feedback;
      stages = [
        { $match: { createdAt: bounds } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $project: { rating: '$_id', count: 1, score: { $multiply: ['$_id', '$count'] } } },
      ];
      sort = { rating: -1 };
      summary = { count: sum('count'), score: sum('score') };
      break;
  }
  return { model, stages, summary, sort };
}
export async function generateReport(type, query, generatedAt, session) {
  const { model, stages, summary, sort } = reportPipeline(type, query, generatedAt);
  const [result] = await model
    .aggregate([
      ...stages,
      {
        $facet: {
          records: [
            { $sort: sort },
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            { $project: { _id: 0, score: 0 } },
          ],
          total: [{ $count: 'value' }],
          summary: [{ $group: { _id: null, ...summary } }, { $project: { _id: 0 } }],
        },
      },
    ])
    .session(session)
    .option({ maxTimeMS: 10000 });
  const totals = result.summary[0] || {};
  if (type === 'feedback') totals.average = totals.count ? totals.score / totals.count : null;
  return { records: result.records, total: result.total[0]?.value || 0, totals };
}
