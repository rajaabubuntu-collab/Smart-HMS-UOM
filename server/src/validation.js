import { z } from 'zod';
import { hospitalDate } from './scheduling/time.js';

const text = (max) => z.string().trim().max(max);
const requiredText = (max) => text(max).min(1, 'This field is required.');
const phone = text(25).regex(/^[+\d\s().-]*$/, 'Enter a valid phone number.');
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.');
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record ID.');
const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value <= hospitalDate() &&
      value >= '1900-01-01'
    );
  }, 'Enter a valid birth date between 1900 and today.');
const gender = z.enum(['female', 'male', 'other', 'prefer-not-to-say']);
const person = { name: requiredText(100), email, phone: phone.default(''), password };

export const registerSchema = z.object({ ...person, dateOfBirth, gender }).strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();
export const profileSchema = z
  .object({
    phone,
    address: text(300),
    emergencyContact: z.object({ name: text(100), phone, relationship: text(80) }).strict(),
  })
  .strict();
export const departmentSchema = z
  .object({ name: requiredText(80), description: text(500).default('') })
  .strict();
export const staffSchema = z.discriminatedUnion('role', [
  z.object({ ...person, role: z.literal('receptionist') }).strict(),
  z
    .object({
      ...person,
      role: z.literal('doctor'),
      department: objectId,
      specialization: requiredText(100),
      qualification: text(200).default(''),
      consultationFeeMinor: z.number().int().min(0).max(100000000),
    })
    .strict(),
]);
export const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error('Please check the highlighted fields.');
    error.status = 400;
    error.fields = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message]),
    );
    throw error;
  }
  return result.data;
}
