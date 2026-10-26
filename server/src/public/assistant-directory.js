import { Doctor, AppointmentSlot, Appointment, DoctorSchedule } from '../models.js';
import { publishedDoctors } from '../settings/administration.js';
import { dayBounds, hospitalDate, validDate } from '../scheduling/time.js';

// A deliberately read-only tool. Publication and account status are checked on every call.
export async function searchAssistantDoctors(plan, now = new Date()) {
  const { query, doctorId, departmentId, date, period } = plan;
  const filters = { query, doctorId, departmentId, date, period };
  const empty = { doctors: [], total: 0, filters, checkedAt: now.toISOString() };
  if (
    date &&
    (!validDate(date) ||
      date < hospitalDate(now) ||
      date > hospitalDate(new Date(+now + 180 * 86400000)))
  )
    return { ...empty, status: 'invalid-date' };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [result] = await Doctor.aggregate([
    ...publishedDoctors({ id: doctorId, department: departmentId }),
    ...(query
      ? [
          {
            $match: {
              $or: ['account.name', 'specialization', 'service.name'].map((field) => ({
                [field]: { $regex: escaped, $options: 'i' },
              })),
            },
          },
        ]
      : []),
    { $sort: { 'account.name': 1, _id: 1 } },
    {
      $facet: {
        count: [{ $count: 'total' }],
        doctors: [
          { $limit: 4 },
          {
            $project: {
              name: '$account.name',
              department: '$service.name',
              specialization: 1,
              qualification: 1,
              consultationFeeMinor: 1,
              isDemo: 1,
            },
          },
        ],
      },
    },
  ]).option({ maxTimeMS: 5000 });
  const bounds = date ? dayBounds(date) : null;
  const doctors = await Promise.all(
    result.doctors.map(async (doctor) => {
      const slots = await AppointmentSlot.aggregate([
        {
          $match: {
            doctor: doctor._id,
            isActive: true,
            startsAt: {
              $gt: now,
              ...(bounds
                ? { $gte: bounds.start, $lt: bounds.end }
                : { $lte: new Date(+now + 180 * 86400000) }),
            },
          },
        },
        ...(period !== 'any'
          ? [
              { $set: { localHour: { $hour: { date: '$startsAt', timezone: 'Asia/Colombo' } } } },
              {
                $match: {
                  localHour:
                    period === 'morning'
                      ? { $lt: 12 }
                      : period === 'afternoon'
                        ? { $gte: 12, $lt: 17 }
                        : { $gte: 17 },
                },
              },
            ]
          : []),
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
        { $limit: 3 },
        { $project: { startsAt: 1, endsAt: 1 } },
      ]).option({ maxTimeMS: 5000 });
      const id = String(doctor._id);
      return {
        id,
        name: doctor.name,
        department: doctor.department,
        specialization: doctor.specialization,
        qualification: doctor.qualification,
        consultationFeeMinor: doctor.consultationFeeMinor,
        demo: Boolean(doctor.isDemo),
        href: `/doctors/${id}`,
        bookingHref: `/book?${new URLSearchParams({ doctor: id, ...(date ? { date } : {}) })}`,
        slots: slots.map((slot) => ({
          id: String(slot._id),
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          href: `/book?${new URLSearchParams({ doctor: id, date: hospitalDate(slot.startsAt), slot: String(slot._id) })}`,
        })),
      };
    }),
  );
  return { ...empty, doctors, total: result.count[0]?.total || 0, status: 'checked' };
}
