import { Router } from 'express';
import { z } from 'zod';
import { Department, Doctor, Patient, User, audit } from '../models.js';
import { allowRoles } from '../auth.js';
import { parse } from '../validation.js';
import { hospitalDate } from '../scheduling/time.js';
import { evaluateGuide, normalize } from './rules.js';
const schema = z
  .object({
    symptoms: z.string().trim().min(3).max(1000),
    duration: z
      .object({
        value: z.number().int().min(1).max(3650),
        unit: z.enum(['hours', 'days', 'weeks', 'months']),
      })
      .strict(),
    painLevel: z.number().int().min(1).max(10).optional(),
    comments: z.string().trim().max(1000).default(''),
    emergencySigns: z.enum(['yes', 'no', 'unsure']),
    acknowledged: z.literal(true),
  })
  .strict();
function ageAt(birth, today) {
  if (!birth) return NaN;
  const years = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  return years - (today.slice(5) < birth.slice(5) ? 1 : 0);
}
export function recommendationRouter() {
  const router = Router();
  router.post('/recommendations', allowRoles('patient'), async (req, res) => {
    const data = parse(schema, req.body);
    const patient = await Patient.findOne({ user: req.user._id }).select('dateOfBirth');
    const evaluated = evaluateGuide(data, { age: ageAt(patient?.dateOfBirth, hospitalDate()) });
    const { matches, ...result } = evaluated;
    result.suggestions = [];
    if (matches.length) {
      const rule = matches[0];
      const activeDepartments = await Department.find({ isActive: true })
        .select('name')
        .sort({ name: 1, _id: 1 })
        .lean();
      const departments = activeDepartments.filter((d) => rule.aliases.includes(normalize(d.name)));
      const users = await User.find({ role: 'doctor', isActive: true }).select('_id');
      for (const department of departments) {
        const filter = { department: department._id, user: { $in: users.map((u) => u._id) } };
        const doctors = await Doctor.find(filter)
          .populate('user', 'name')
          .sort({ _id: 1 })
          .limit(6)
          .lean();
        result.suggestions.push({
          department: { id: department._id, name: department.name },
          explanation: rule.reason,
          matchedTerms: rule.matchedTerms,
          doctors: doctors.map((d) => ({
            id: d._id,
            name: d.user.name,
            specialization: d.specialization,
            qualification: d.qualification,
            consultationFeeMinor: d.consultationFeeMinor,
          })),
          doctorCount: await Doctor.countDocuments(filter),
        });
      }
      if (!departments.length) {
        result.outcome = 'unavailable';
        result.explanation = `A rule matched ${rule.label}, but this service is not currently listed as an active department. Contact reception for help; no alternative has been assumed.`;
      }
    }
    // Record only outcome/version for project auditing. Never persist submitted symptom text.
    await audit(
      req.user._id,
      `department_guide_${result.outcome}`,
      'recommendations',
      result.ruleVersion,
    );
    res.json(result);
  });
  return router;
}
