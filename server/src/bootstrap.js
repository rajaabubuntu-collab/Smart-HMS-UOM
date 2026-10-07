import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, audit } from './models.js';
import { parse } from './validation.js';
const input = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().trim().toLowerCase().max(254),
    password: z
      .string()
      .min(12)
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72),
  })
  .strict();
export async function bootstrapAdmin(values) {
  const data = parse(input, values);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const collection = mongoose.connection.db.collection('installation');
  try {
    await mongoose.connection.db.createCollection('installation');
  } catch (err) {
    if (err.code !== 48) throw err;
  }
  await mongoose.connection.transaction(async (session) => {
    if (await User.exists({}).session(session))
      throw new Error('Bootstrap requires a database with no user accounts.');
    await collection.insertOne({ _id: 'initial-admin', createdAt: new Date() }, { session });
    const [user] = await User.create(
      [{ name: data.name, email: data.email, passwordHash, role: 'admin' }],
      { session },
    );
    await audit(user._id, 'initial_admin_created', 'setup', user._id, session);
  });
}
