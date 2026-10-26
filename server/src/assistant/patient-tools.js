import { z } from 'zod';
import {
  Patient,
  Appointment,
  Bill,
  Payment,
  Consultation,
  Notification,
  audit,
} from '../models.js';
import { httpError } from '../auth.js';
import { dayBounds, hospitalDate, validDate } from '../scheduling/time.js';
export const kinds = [
  'appointments',
  'bills',
  'payments',
  'records',
  'prescriptions',
  'notifications',
  'profile',
  'guide',
  'hospital',
  'help',
];
export const searchSchema = z
  .object({
    kind: z.enum(kinds),
    query: z.string().trim().max(80),
    status: z.enum([
      'all',
      'upcoming',
      'past',
      'scheduled',
      'waiting',
      'cancelled',
      'completed',
      'unpaid',
      'paid',
      'overdue',
      'unread',
    ]),
    dateFrom: z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/),
    dateTo: z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/),
    offset: z.number().int().min(0).max(500),
  })
  .strict();
export const defaultSearch = (kind) => ({
  kind,
  query: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  offset: 0,
});
const field = (label, value, format = 'text') => ({ label, value: value ?? '', format });
const regex = (value) => ({ $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
export async function patientSearch(user, search, now = new Date()) {
  const { kind, query, status, dateFrom, dateTo, offset } = searchSchema.parse(search);
  if (
    [dateFrom, dateTo].some((d) => d && !validDate(d)) ||
    (dateFrom && dateTo && dateFrom > dateTo)
  )
    throw httpError(400, 'Please choose a valid date range.');
  const allowed = {
    appointments: ['all', 'upcoming', 'past', 'scheduled', 'waiting', 'cancelled', 'completed'],
    bills: ['all', 'paid', 'unpaid', 'overdue'],
    notifications: ['all', 'unread'],
  };
  if (!(allowed[kind] || ['all']).includes(status))
    throw httpError(400, 'That status does not apply to this search.');
  const patient = await Patient.findOne({ user: user._id }).lean();
  if (!patient) throw httpError(404, 'Patient profile not found.');
  const result = {
    mode: 'account',
    kind,
    search,
    items: [],
    summary: [],
    total: 0,
    offset,
    limit: 5,
    checkedAt: now.toISOString(),
  };
  if (['guide', 'hospital', 'help'].includes(kind)) return { ...result, mode: kind };
  const filter = { patient: patient._id };
  const range = {
    ...(dateFrom ? { $gte: dayBounds(dateFrom).start } : {}),
    ...(dateTo ? { $lt: dayBounds(dateTo).end } : {}),
  };
  let Model,
    projection,
    sort = { createdAt: -1, _id: -1 },
    populate;
  if (kind === 'profile') {
    return {
      ...result,
      total: 1,
      items: [
        {
          id: 'profile',
          title: 'My profile',
          href: '/profile',
          fields: [
            field('Full name', user.name),
            field('Email address', user.email),
            field('Phone', user.phone),
            field('Date of birth', patient.dateOfBirth),
            field('Blood type', patient.bloodType),
            field('Allergy information', patient.allergies?.join(', ') || 'Not recorded'),
          ],
        },
      ],
    };
  }
  if (kind === 'appointments') {
    Model = Appointment;
    projection = 'reference doctorName departmentName startsAt endsAt status consultationFeeMinor';
    if (status === 'upcoming') {
      filter.startsAt = { $gt: now };
      filter.status = { $in: ['Scheduled', 'Waiting', 'In Consultation'] };
      sort = { startsAt: 1, _id: 1 };
    } else if (status === 'past') filter.startsAt = { $lt: now };
    else if (status !== 'all')
      filter.status = {
        scheduled: 'Scheduled',
        waiting: 'Waiting',
        cancelled: 'Cancelled',
        completed: 'Completed',
      }[status];
    if (dateFrom || dateTo) {
      if (filter.startsAt) filter.$and = [{ startsAt: range }];
      else filter.startsAt = range;
    }
    if (query)
      filter.$or = ['reference', 'doctorName', 'departmentName'].map((key) => ({
        [key]: regex(query),
      }));
  } else if (kind === 'bills') {
    Model = Bill;
    projection =
      'reference appointmentReference doctorName totalMinor paidMinor dueDate createdAt items';
    if (status === 'paid') filter.$expr = { $gte: ['$paidMinor', '$totalMinor'] };
    if (['unpaid', 'overdue'].includes(status))
      filter.$expr = { $lt: ['$paidMinor', '$totalMinor'] };
    if (status === 'overdue') filter.dueDate = { $lt: hospitalDate(now) };
    if (dateFrom || dateTo) filter.createdAt = range;
    if (query)
      filter.$or = ['reference', 'appointmentReference', 'doctorName', 'items.description'].map(
        (key) => ({ [key]: regex(query) }),
      );
  } else if (kind === 'payments') {
    // Ownership is enforced by a join, not a caller-supplied bill/patient identifier.
    const match = {
      ...(query ? { reference: regex(query) } : {}),
      ...(dateFrom || dateTo ? { createdAt: range } : {}),
    };
    const [data] = await Payment.aggregate([
      { $match: match },
      {
        $lookup: {
          from: Bill.collection.name,
          localField: 'bill',
          foreignField: '_id',
          pipeline: [{ $match: { patient: patient._id } }, { $project: { reference: 1 } }],
          as: 'ownedBill',
        },
      },
      { $unwind: '$ownedBill' },
      {
        $facet: {
          count: [{ $count: 'total' }],
          totals: [
            { $match: { reversedAt: null } },
            { $group: { _id: null, amount: { $sum: '$amountMinor' } } },
          ],
          items: [
            { $sort: sort },
            { $skip: offset },
            { $limit: 5 },
            {
              $project: {
                reference: 1,
                createdAt: 1,
                amountMinor: 1,
                method: 1,
                reversedAt: 1,
                bill: 1,
              },
            },
          ],
        },
      },
    ]).option({ maxTimeMS: 5000 });
    return {
      ...result,
      total: data.count[0]?.total || 0,
      summary: [field('Recorded payments', data.totals[0]?.amount || 0, 'money')],
      items: data.items.map((p) => ({
        id: String(p._id),
        title: p.reference,
        href: `/billing/${p.bill}`,
        fields: [
          field('Recorded', p.createdAt, 'datetime'),
          field('Amount', p.amountMinor, 'money'),
          field('Method', p.method),
          field('Status', p.reversedAt ? 'Reversed' : 'Recorded'),
        ],
      })),
    };
  } else if (['records', 'prescriptions'].includes(kind)) {
    Model = Consultation;
    filter.status = 'Completed';
    projection = 'appointment completedAt diagnosis treatment medications noMedicationReason';
    sort = { completedAt: -1, _id: -1 };
    if (dateFrom || dateTo) filter.completedAt = range;
    if (kind === 'prescriptions') filter['medications.0'] = { $exists: true };
    if (query)
      filter.$or = ['diagnosis', 'treatment', 'medications.name'].map((key) => ({
        [key]: regex(query),
      }));
    populate = {
      path: 'appointment',
      select: 'reference doctorName startsAt',
      match: { patient: patient._id },
    };
  } else if (kind === 'notifications') {
    Model = Notification;
    delete filter.patient;
    filter.recipient = user._id;
    projection = 'title message path createdAt readAt';
    if (status === 'unread') filter.readAt = null;
    if (dateFrom || dateTo) filter.createdAt = range;
    if (query) filter.$or = ['title', 'message'].map((key) => ({ [key]: regex(query) }));
  }
  const read = Model.find(filter)
    .select(projection)
    .sort(sort)
    .skip(offset)
    .limit(5)
    .maxTimeMS(5000)
    .lean();
  if (populate) read.populate(populate);
  const [items, total] = await Promise.all([read, Model.countDocuments(filter).maxTimeMS(5000)]);
  result.total = total;
  if (kind === 'bills') {
    const [sums] = await Bill.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalMinor' },
          paid: { $sum: '$paidMinor' },
          due: { $sum: { $max: [0, { $subtract: ['$totalMinor', '$paidMinor'] }] } },
        },
      },
    ]).option({ maxTimeMS: 5000 });
    result.summary = [
      field('Total billed', sums?.total || 0, 'money'),
      field('Paid', sums?.paid || 0, 'money'),
      field('Outstanding balance', sums?.due || 0, 'money'),
    ];
  }
  result.items = items.map((item) => {
    const base = { id: String(item._id) };
    if (kind === 'appointments')
      return {
        ...base,
        title: item.reference,
        subtitle: item.doctorName,
        href: `/appointments?selected=${item._id}`,
        fields: [
          field('Department', item.departmentName),
          field('Appointment time', item.startsAt, 'datetime'),
          field('Status', item.status),
          field('Consultation fee', item.consultationFeeMinor, 'money'),
        ],
      };
    if (kind === 'bills')
      return {
        ...base,
        title: item.reference,
        subtitle: item.doctorName,
        href: `/billing/${item._id}`,
        fields: [
          field('Created', item.createdAt, 'datetime'),
          field('Due date', item.dueDate),
          field('Total', item.totalMinor, 'money'),
          field('Paid', item.paidMinor, 'money'),
          field('Outstanding balance', Math.max(0, item.totalMinor - item.paidMinor), 'money'),
        ],
        charges: item.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          totalMinor: i.quantity * i.unitPriceMinor,
        })),
      };
    if (kind === 'notifications')
      return {
        ...base,
        title: item.title,
        subtitle: item.message,
        href: '/notifications',
        fields: [
          field('Received', item.createdAt, 'datetime'),
          field('Status', item.readAt ? 'Read' : 'Unread'),
        ],
      };
    return {
      ...base,
      title: item.appointment?.reference || 'Consultation record',
      subtitle: item.appointment?.doctorName || '',
      href: '/records',
      fields: [
        field('Completed', item.completedAt, 'datetime'),
        ...(kind === 'records'
          ? [field('Diagnosis', item.diagnosis), field('Treatment', item.treatment)]
          : []),
      ],
      medications: item.medications.map(({ name, dosage, frequency, duration }) => ({
        name,
        dosage,
        frequency,
        duration,
      })),
      noMedicationReason: item.noMedicationReason,
    };
  });
  if (['records', 'prescriptions'].includes(kind))
    await audit(user._id, 'medical_history_viewed', 'clinical', patient._id);
  return result;
}
