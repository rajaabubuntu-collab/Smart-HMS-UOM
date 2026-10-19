import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { User, Doctor, Department, DoctorSchedule, audit } from '../models.js';
import { createSchedule } from '../scheduling/service.js';
import { hospitalDate, localInstant } from '../scheduling/time.js';
import { departmentCatalog, catalogDepartment } from '../recommendations/departments.js';

const firstNames = [
  'Nadeesha',
  'Kasun',
  'Fathima',
  'Dinesh',
  'Kavindi',
  'Arun',
  'Sanduni',
  'Imran',
  'Tharushi',
  'Ruwan',
  'Ayesha',
  'Sajith',
  'Anjali',
  'Niroshan',
  'Shalini',
  'Sameera',
  'Dilini',
  'Farhan',
  'Malini',
  'Praveen',
];
const lastNames = [
  'Perera',
  'Jayawardena',
  'Rahman',
  'Fernando',
  'Wickramasinghe',
  'Sivakumar',
  'Gunawardena',
  'Nazeer',
  'Rathnayake',
  'De Silva',
  'Nawaz',
  'Senanayake',
  'Wijesinghe',
  'Rajendran',
  'Balasuriya',
  'Abeysekera',
  'Karunaratne',
  'Ameer',
  'Weerasinghe',
  'Tharmalingam',
];
export const demoEmail = (id, index) => `demo.${id}.${index + 1}@smart-hms.example.invalid`;

export async function seedDemoDirectory({
  environment,
  days = 7,
  catalog = departmentCatalog,
  onCredential = () => {},
}) {
  if (environment !== 'development')
    throw new Error('Demo directory is restricted to development.');
  if (!Number.isInteger(days) || days < 1 || days > 14)
    throw new Error('Choose 1–14 schedule days.');
  const actor = await User.findOne({ role: 'admin', isActive: true });
  if (!actor)
    throw new Error('Create a development administrator before seeding the demo directory.');
  const reservedEmails = catalog.flatMap((entry) => [0, 1, 2].map((i) => demoEmail(entry.id, i)));
  if (await User.exists({ email: { $in: reservedEmails }, isDemo: { $ne: true } }))
    throw new Error('A reserved demo email belongs to an unmarked account; no data was changed.');
  const stats = {
    departmentsCreated: 0,
    doctorsCreated: 0,
    schedulesCreated: 0,
    sessionsSkipped: 0,
  };
  for (const entry of catalog) {
    let department = (await Department.find()).find(
      (d) => catalogDepartment(d.name)?.id === entry.id,
    );
    if (!department) {
      department = await Department.create({
        name: entry.name,
        nameKey: entry.name.toLowerCase(),
        description: `${entry.scope}. Synthetic department for local project testing.`,
        isDemo: true,
        isPublic: false,
      });
      stats.departmentsCreated++;
    }
    if (!department.isActive) continue; // Never reactivate an operator-disabled service.
    for (let index = 0; index < 3; index++) {
      const email = demoEmail(entry.id, index);
      let user = await User.findOne({ email });
      let doctor = user ? await Doctor.findOne({ user: user._id }) : null;
      if (!user) {
        const position = departmentCatalog.findIndex((d) => d.id === entry.id);
        const name = `Dr. ${firstNames[(position + index * 7) % 20]} ${lastNames[(position * 3 + index * 5) % 20]} (Demo)`;
        const password = randomBytes(24).toString('base64url');
        const passwordHash = await bcrypt.hash(password, 12);
        await mongoose.connection.transaction(async (session) => {
          [user] = await User.create(
            [
              {
                name,
                email,
                role: 'doctor',
                passwordHash,
                isDemo: true,
                notificationPreferences: { email: false, sms: false },
              },
            ],
            { session },
          );
          [doctor] = await Doctor.create(
            [
              {
                user: user._id,
                department: department._id,
                specialization: entry.name,
                qualification: 'Fictional clinician profile — demonstration only',
                consultationFeeMinor: (2500 + (position % 5) * 500 + index * 250) * 100,
                isDemo: true,
                isPublic: false,
              },
            ],
            { session },
          );
          await audit(actor._id, 'demo_doctor_seeded', 'setup', doctor._id, session);
        });
        stats.doctorsCreated++;
        await onCredential({ name, email, password });
      }
      if (!user.isActive || !doctor?.isDemo || String(doctor.department) !== String(department._id))
        continue;
      // Add future sessions only; preserve existing/closed sessions, bookings and edits.
      for (let day = 1; day <= days; day++) {
        const date = hospitalDate(new Date(Date.now() + day * 86400000));
        const hour = 9 + index * 3;
        const startTime = `${String(hour).padStart(2, '0')}:00`;
        const endTime = `${String(hour + 2).padStart(2, '0')}:00`;
        const startsAt = localInstant(date, startTime),
          endsAt = localInstant(date, endTime);
        if (
          await DoctorSchedule.exists({
            doctor: doctor._id,
            startsAt: { $lt: endsAt },
            endsAt: { $gt: startsAt },
          })
        ) {
          stats.sessionsSkipped++;
          continue;
        }
        try {
          await createSchedule(
            { doctor: doctor._id, date, startTime, endTime, slotMinutes: 15 },
            actor,
          );
          stats.schedulesCreated++;
        } catch (error) {
          if (error.status !== 409) throw error;
          stats.sessionsSkipped++;
        }
      }
    }
  }
  return stats;
}
