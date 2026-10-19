import { AppointmentSlot, Appointment, DoctorSchedule } from '../models.js';

export async function nextAvailability(doctorIds, now = new Date()) {
  if (!doctorIds.length) return new Map();
  const rows = await AppointmentSlot.aggregate([
    {
      $match: {
        doctor: { $in: doctorIds },
        isActive: true,
        startsAt: { $gt: now, $lte: new Date(+now + 180 * 86400000) },
      },
    },
    {
      $lookup: {
        from: DoctorSchedule.collection.name,
        localField: 'schedule',
        foreignField: '_id',
        pipeline: [{ $match: { isActive: true } }, { $project: { _id: 1 } }],
        as: 'session',
      },
    },
    { $match: { 'session.0': { $exists: true } } },
    {
      $lookup: {
        from: Appointment.collection.name,
        localField: '_id',
        foreignField: 'slot',
        pipeline: [{ $match: { holdsSlot: true } }, { $limit: 1 }, { $project: { _id: 1 } }],
        as: 'reservation',
      },
    },
    { $match: { 'reservation.0': { $exists: false } } },
    { $sort: { startsAt: 1, _id: 1 } },
    {
      $group: {
        _id: '$doctor',
        slots: { $push: { id: '$_id', startsAt: '$startsAt', endsAt: '$endsAt' } },
      },
    },
    { $project: { slots: { $slice: ['$slots', 3] } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.slots]));
}
