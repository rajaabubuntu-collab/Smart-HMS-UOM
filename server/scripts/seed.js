import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { connectDatabase, User, Patient, Doctor, Department, audit } from '../src/models.js';

const config = loadConfig();
if (config.env !== 'development')
  throw new Error('Development seed is disabled outside development.');
const directory = fileURLToPath(new URL('../../.local/', import.meta.url));
mkdirSync(directory, { recursive: true, mode: 0o700 });
const output = `${directory}dev-credentials.txt`;
const accounts = [
  { role: 'admin', name: 'Development Administrator', email: 'admin@smarthms.local' },
  { role: 'doctor', name: 'Demo Doctor', email: 'doctor@smarthms.local' },
  { role: 'receptionist', name: 'Demo Receptionist', email: 'reception@smarthms.local' },
  { role: 'patient', name: 'Demo Patient', email: 'patient@smarthms.local' },
];
const credentials = [];
try {
  await connectDatabase(config.mongoUri);
  await mongoose.connection.transaction(async (session) => {
    credentials.length = 0; // Transaction callbacks may retry.
    let department = await Department.findOne({ nameKey: 'general medicine' }).session(session);
    if (!department)
      [department] = await Department.create(
        [
          {
            name: 'General Medicine',
            nameKey: 'general medicine',
            description: 'General outpatient care and consultations.',
          },
        ],
        { session },
      );
    for (const account of accounts) {
      if (await User.exists({ email: account.email }).session(session)) continue;
      const password = randomBytes(18).toString('base64url');
      const [user] = await User.create(
        [{ ...account, passwordHash: await bcrypt.hash(password, 12) }],
        { session },
      );
      if (account.role === 'patient')
        await Patient.create(
          [{ user: user._id, dateOfBirth: '1995-06-15', gender: 'prefer-not-to-say' }],
          { session },
        );
      if (account.role === 'doctor')
        await Doctor.create(
          [
            {
              user: user._id,
              department: department._id,
              specialization: 'General Medicine',
              qualification: 'Sample qualification — demo only',
              consultationFeeMinor: 250000,
            },
          ],
          { session },
        );
      await audit(user._id, 'development_account_seeded', 'setup', user._id, session);
      credentials.push(`${account.role}\nEmail: ${account.email}\nPassword: ${password}\n`);
    }
  });
  if (credentials.length) {
    writeFileSync(
      output,
      `${existsSync(output) ? '\n' : 'SMART HMS — LOCAL DEVELOPMENT ACCOUNTS\nSynthetic accounts only. Do not publish this file.\n\n'}${credentials.join('\n')}\n`,
      { flag: 'a', mode: 0o600 },
    );
    console.log(
      `Created ${credentials.length} development accounts. Credentials saved in .local/dev-credentials.txt (gitignored).`,
    );
  } else
    console.log(
      'Development accounts already exist. Passwords and patient details were preserved.',
    );
} finally {
  await mongoose.disconnect();
}
