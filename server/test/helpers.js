import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { User, Patient, Doctor, Department } from '../src/models.js';

export const testPassword = 'Test-only-password-42!';
export const testConfig = {
  env: 'test',
  port: 4100,
  origin: 'http://localhost:5174',
  jwtSecret: randomBytes(48).toString('hex'),
  sessionHours: 1,
  trustProxy: false,
};
export const testMongoUri =
  process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true';
export function isolatedUri(prefix) {
  // Always override the database name; never drop an operator-supplied database.
  const uri = new URL(testMongoUri);
  uri.pathname = `/smart_hms_test_${prefix}_${process.pid}_${randomBytes(5).toString('hex')}`;
  return uri.toString();
}
export async function seedTestAccounts() {
  const passwordHash = await bcrypt.hash(testPassword, 12);
  const department = await Department.create({
    name: 'General Medicine',
    nameKey: 'general medicine',
    description: 'Test department',
  });
  const users = {};
  for (const role of ['admin', 'doctor', 'receptionist', 'patient']) {
    users[role] = await User.create({
      name: `Test ${role}`,
      email: `${role}@test.local`,
      passwordHash,
      role,
    });
  }
  await Patient.create({
    user: users.patient._id,
    dateOfBirth: '1998-05-20',
    gender: 'prefer-not-to-say',
  });
  await Doctor.create({
    user: users.doctor._id,
    department: department._id,
    specialization: 'General Medicine',
    qualification: 'Test qualification',
    consultationFeeMinor: 250000,
  });
  return { users, department };
}
