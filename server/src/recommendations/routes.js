import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { Department, Doctor, Patient, User, audit } from '../models.js';
import { allowRoles } from '../auth.js';
import { parse } from '../validation.js';
import { hospitalDate } from '../scheduling/time.js';
import { evaluateGuide, evaluateSafety, matchRules, normalize } from './rules.js';
import { aiVersion, createDepartmentAI, departmentChoices } from './ai.js';
import { catalogDepartment } from './departments.js';
import { nextAvailability } from '../scheduling/next-availability.js';
const schema = z
  .object({
    symptoms: z.string().trim().min(3).max(1000),
    duration: z
      .object({
        value: z.number().int().min(1).max(3650),
        unit: z.enum(['hours', 'days', 'weeks', 'months']),
      })
      .strict()
      .optional(),
    painLevel: z.number().int().min(1).max(10).optional(),
    comments: z.string().trim().max(1000).default(''),
    emergencySigns: z.enum(['yes', 'no', 'unsure']),
    acknowledged: z.literal(true),
    cloudConsent: z.boolean().optional().default(false),
  })
  .strict();
function ageAt(birth, today) {
  if (!birth) return NaN;
  const years = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  return years - (today.slice(5) < birth.slice(5) ? 1 : 0);
}
export function recommendationRouter(config, { rateLimitEnabled = true, fetchImpl } = {}) {
  const router = Router();
  const ai = createDepartmentAI(config, { fetchImpl });
  router.get('/recommendations/status', allowRoles('patient'), async (_req, res) => {
    const departments = await Department.find({ isActive: true }).select('name').lean();
    const activeUsers = await User.find({ role: 'doctor', isActive: true }).select('_id');
    const filter = {
      department: { $in: departments.map((d) => d._id) },
      user: { $in: activeUsers.map((u) => u._id) },
    };
    const demoAvailable = Boolean(await Doctor.exists({ ...filter, isDemo: true }));
    res.json({
      aiEnabled: ai.enabled,
      provider: ai.provider,
      requiresCloudConsent: ai.provider === 'groq',
      thinkingEnabled: ai.thinkingEnabled,
      departmentCount: departments.length,
      supportedDepartmentCount: departmentChoices(departments).length,
      doctorCount: await Doctor.countDocuments(filter),
      demoAvailable,
      examples: demoAvailable
        ? departments.flatMap((department) => {
            const entry = catalogDepartment(department.name);
            return entry?.example ? [{ department: department.name, symptoms: entry.example }] : [];
          })
        : [],
    });
  });
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 5,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Please wait a minute before requesting more department guidance.' },
  });
  router.post(
    '/recommendations',
    allowRoles('patient'),
    ...(rateLimitEnabled ? [limiter] : []),
    async (req, res) => {
      const data = parse(schema, req.body);
      const patient = await Patient.findOne({ user: req.user._id }).select('dateOfBirth');
      const context = { age: ageAt(patient?.dateOfBirth, hospitalDate()) };
      const evaluated = evaluateGuide(data, context);
      const { matches, ...result } = evaluated;
      const safety = evaluateSafety(data, context);
      const ambiguous = !safety && matchRules(data).length > 1;
      result.source = safety || ambiguous ? 'safety' : 'rules';
      result.aiStatus = ai.enabled ? 'not_used' : 'disabled';
      result.fallback = false;
      result.suggestions = [];
      const activeDepartments =
        !safety && !ambiguous
          ? await Department.find({ isActive: true })
              .select('name')
              .sort({ name: 1, _id: 1 })
              .lean()
          : [];
      const rule = matches[0];
      let departments = rule
        ? activeDepartments.filter((d) => rule.aliases.includes(normalize(d.name)))
        : [];
      let evidence = [];
      if (ai.enabled && !safety && !ambiguous && (!rule || departments.length)) {
        if (ai.provider === 'groq')
          parse(
            z.literal(true, {
              error:
                'Please agree to send your description to Groq before requesting cloud AI guidance.',
            }),
            data.cloudConsent,
          );
        const controller = new AbortController();
        const disconnected = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on('close', disconnected);
        let decision;
        try {
          decision = await ai.recommend(data, departmentChoices(activeDepartments), {
            signal: controller.signal,
          });
        } finally {
          res.off('close', disconnected);
        }
        if (controller.signal.aborted) return;
        result.aiStatus = decision.status;
        result.thinkingAttempted = Boolean(decision.thinkingAttempted);
        result.thinkingStatus = decision.thinkingStatus || 'not_used';
        if (decision.status === 'ok') {
          result.source = 'ai';
          result.provider = ai.provider;
          result.model = decision.model || config.model;
          result.aiVersion = aiVersion;
          const chosen = activeDepartments.find((d) => String(d._id) === decision.departmentId);
          // Model disagreement with a single existing rule is not resolved by guessing.
          if (
            decision.decision === 'matched' &&
            chosen &&
            (!rule || departments.some((d) => String(d._id) === String(chosen._id)))
          ) {
            departments = [chosen];
            evidence = decision.evidence;
            result.outcome = 'matched';
            result.explanation =
              'AI identified a possible department from your description. This is a navigation suggestion, not a diagnosis or a measure of medical certainty.';
          } else {
            departments = [];
            result.outcome = decision.decision === 'review' ? 'review' : 'staff';
            result.explanation =
              result.outcome === 'review'
                ? 'Your description may need assessment by a qualified health professional. Do not rely on routine booking suggestions; this guide cannot determine urgency.'
                : 'AI could not provide a clear department suggestion within this guide. Please contact reception or a clinician to choose an appropriate service.';
          }
        } else {
          result.fallback = true;
        }
      }
      if (departments.length) {
        const users = await User.find({ role: 'doctor', isActive: true }).select('_id');
        for (const department of departments) {
          // Recheck availability after inference, which may take several seconds.
          if (!(await Department.exists({ _id: department._id, isActive: true }))) continue;
          const filter = { department: department._id, user: { $in: users.map((u) => u._id) } };
          const doctors = await Doctor.find(filter)
            .populate('user', 'name')
            .sort({ _id: 1 })
            .limit(6)
            .lean();
          const slots = await nextAvailability(doctors.map((d) => d._id));
          result.suggestions.push({
            department: { id: department._id, name: department.name },
            explanation:
              result.source === 'ai'
                ? `Department focus: ${departmentChoices([department])[0].scope}. The highlighted wording was selected from your description; discuss your symptoms with a clinician.`
                : rule.reason,
            matchedTerms: result.source === 'ai' ? [] : rule.matchedTerms,
            evidence: result.source === 'ai' ? evidence : [],
            doctors: doctors.map((d) => ({
              id: d._id,
              name: d.user.name,
              specialization: d.specialization,
              qualification: d.qualification,
              consultationFeeMinor: d.consultationFeeMinor,
              isDemo: Boolean(d.isDemo),
              nextSlots: slots.get(String(d._id)) || [],
            })),
            doctorCount: await Doctor.countDocuments(filter),
          });
        }
      }
      if (result.outcome === 'matched' && !result.suggestions.length) {
        result.outcome = 'unavailable';
        result.explanation =
          'The suggested service is not currently listed as an active department. Contact reception for help; no alternative has been assumed.';
      }
      // Record only outcome/version for project auditing. Never persist submitted symptom text.
      await audit(
        req.user._id,
        `department_guide_${result.outcome}`,
        'recommendations',
        result.source === 'ai' ? `${aiVersion}:${result.model}` : result.ruleVersion,
      );
      res.json(result);
    },
  );
  return router;
}
