import { z } from 'zod';
import { objectId, pageSchema, registerSchema } from '../validation.js';
import { appointmentStatuses } from '../models.js';
import { validDate } from './time.js';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validDate, 'Enter a valid date.');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time.');
export const scheduleCreateSchema = z
  .object({
    doctor: objectId,
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    slotMinutes: z.number().int().min(5).max(120),
  })
  .strict();
export const reasonSchema = z
  .object({ reason: z.string().trim().min(1, 'Please give a reason.').max(300) })
  .strict();
export const schedulesQuery = pageSchema
  .extend({ doctor: objectId.optional(), date: dateSchema.optional() })
  .strict();
export const directoryQuery = pageSchema
  .extend({ department: objectId.optional(), search: z.string().trim().max(80).default('') })
  .strict();
export const availabilityQuery = z.object({ date: dateSchema }).strict();
export const bookingSchema = z
  .object({
    slot: objectId,
    patient: objectId.optional(),
    reason: z.string().trim().max(500).default(''),
  })
  .strict();
export const rescheduleSchema = z
  .object({ slot: objectId, reason: z.string().trim().min(1).max(300) })
  .strict();
export const appointmentsQuery = pageSchema
  .extend({
    doctor: objectId.optional(),
    patient: objectId.optional(),
    date: dateSchema.optional(),
    status: z.enum(appointmentStatuses).optional(),
    view: z.enum(['upcoming', 'history', 'all']).default('all'),
  })
  .strict();
export const patientSearchQuery = pageSchema
  .extend({ search: z.string().trim().min(2, 'Enter at least two characters.').max(100) })
  .strict();
const intake = {
  bloodType: z.enum(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).default(''),
  allergies: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  address: z.string().trim().max(300).default(''),
  emergencyContact: z
    .object({
      name: z.string().trim().max(100),
      phone: z
        .string()
        .trim()
        .max(25)
        .regex(/^[+\d\s().-]*$/),
      relationship: z.string().trim().max(80),
    })
    .strict()
    .default({ name: '', phone: '', relationship: '' }),
};
export const walkInSchema = registerSchema.extend(intake).strict();
export const intakeUpdateSchema = walkInSchema.omit({ password: true, email: true }).strict();
export const staffUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z
      .string()
      .trim()
      .max(25)
      .regex(/^[+\d\s().-]*$/),
    isActive: z.boolean(),
    department: objectId.optional(),
    specialization: z.string().trim().min(1).max(100).optional(),
    qualification: z.string().trim().max(200).optional(),
    consultationFeeMinor: z.number().int().min(0).max(100000000).optional(),
  })
  .strict();
