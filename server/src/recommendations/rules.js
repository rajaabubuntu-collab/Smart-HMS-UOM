// Versioned navigation rules, not a validated diagnostic or triage algorithm.
// Source rationale and limitations: docs/week-7.md. No treatment rules.
export const ruleVersion = 'department-guide-1.0';
export const disclaimer =
  'This guide suggests a department only. It is not a diagnosis, medical advice or an urgency assessment. It cannot rule out an emergency. If symptoms are severe, sudden or worsening, seek medical help rather than waiting for an appointment.';
export const emergencyMessage =
  'Do not wait for a routine appointment if you may be having an emergency. In Sri Lanka call 1990 for an emergency ambulance; elsewhere call your local emergency number.';
export const rules = [
  {
    id: 'skin',
    label: 'Dermatology',
    aliases: ['dermatology'],
    terms: ['rash', 'itchy skin', 'skin itching', 'acne', 'eczema'],
    reason: 'These words concern the skin; Dermatology is the skin service.',
  },
  {
    id: 'ent',
    label: 'Ear, Nose and Throat',
    aliases: [
      'ent',
      'ear nose and throat',
      'ear, nose and throat',
      'ear, nose & throat',
      'ear nose throat',
      'otolaryngology',
    ],
    terms: [
      'earache',
      'ear pain',
      'blocked ear',
      'blocked ears',
      'nasal congestion',
      'blocked nose',
      'sore throat',
    ],
    reason: 'These words concern the ear, nose or throat; an ENT service may be relevant.',
  },
  {
    id: 'eyes',
    label: 'Ophthalmology',
    aliases: ['ophthalmology', 'eye clinic'],
    terms: ['itchy eyes', 'itchy eye', 'dry eyes', 'dry eye', 'watery eyes'],
    reason: 'These words concern the eyes; Ophthalmology is the eye service.',
  },
  {
    id: 'joints',
    label: 'Orthopaedics',
    aliases: ['orthopaedics', 'orthopedics', 'trauma and orthopaedics', 'trauma & orthopaedics'],
    terms: ['joint pain', 'knee pain', 'shoulder pain', 'back pain', 'joint stiffness'],
    reason:
      'These words concern joints or the musculoskeletal system; an Orthopaedics service may be relevant.',
  },
  {
    id: 'general',
    label: 'General Medicine',
    aliases: ['general medicine', 'general outpatient', 'general outpatient department'],
    terms: ['cough', 'fever', 'headache', 'tiredness', 'fatigue'],
    reason:
      'These are general symptom words; a general medical service can assess a range of concerns.',
  },
];
const urgentTerms = [
  'chest pain',
  'chest tightness',
  'tight chest',
  'heavy chest',
  'chest pressure',
  'difficulty breathing',
  'trouble breathing',
  'shortness of breath',
  'breathless',
  "can't breathe",
  'cannot breathe',
  'cant breathe',
  'choking',
  'unconscious',
  'unresponsive',
  'passed out',
  'seizure',
  'face drooping',
  'facial droop',
  'slurred speech',
  'one sided weakness',
  'stroke',
  'severe bleeding',
  'heavy bleeding',
  'uncontrolled bleeding',
  'vomiting blood',
  'severe allergic reaction',
  'swollen tongue',
  'swollen throat',
  'sudden vision loss',
  'loss of vision',
  'sudden blindness',
  'sudden severe headache',
  'worst headache',
  'suicide',
  'suicidal',
  'kill myself',
  'self harm',
  'overdose',
];
export const normalize = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (input, term) => new RegExp(`(?:^|[^a-z])${escape(term)}(?:$|[^a-z])`).test(input);
export function evaluateGuide(input, { age } = {}) {
  const text = normalize(`${input.symptoms} ${input.comments}`);
  const base = { ruleVersion, disclaimer, emergencyMessage };
  if (input.emergencySigns === 'yes' || urgentTerms.some((term) => contains(text, term)))
    return {
      ...base,
      outcome: 'urgent',
      explanation:
        'You selected a warning sign, or your description contains wording that may need urgent assessment. This simple guide cannot determine the cause or safely interpret context and negation.',
      matches: [],
    };
  if (input.emergencySigns === 'unsure')
    return {
      ...base,
      outcome: 'review',
      explanation:
        'Because you are unsure about warning signs, speak to a qualified health professional promptly. Use emergency services if this may be an emergency.',
      matches: [],
    };
  if (input.painLevel >= 8)
    return {
      ...base,
      outcome: 'review',
      explanation:
        'You reported a high pain level. Please seek advice from a qualified health professional promptly; this guide cannot assess the severity or urgency.',
      matches: [],
    };
  if (/\b(severe|sudden|worsening)\b/.test(text))
    return {
      ...base,
      outcome: 'review',
      explanation:
        'Your description mentions severe, sudden or worsening symptoms. Please seek advice from a qualified health professional promptly; routine department matching cannot assess this concern.',
      matches: [],
    };
  if (age < 18 || !Number.isFinite(age))
    return {
      ...base,
      outcome: 'staff',
      explanation:
        'This limited guide is for adults. Please contact hospital reception or a clinician for an appropriate service.',
      matches: [],
    };
  if (
    Array.from(text).some((character) => character.codePointAt(0) > 127) ||
    /\b(no|not|without|denies|denied|never|unsure|maybe|pregnant|pregnancy|postpartum|baby|infant|toddler|child|daughter|son)\b|\b(?:don't|do not|isn't|is not)\b/.test(
      text,
    )
  )
    return {
      ...base,
      outcome: 'staff',
      explanation:
        'This guide cannot reliably interpret the language, context or uncertainty in this description. Please contact reception or a clinician instead of relying on a department match.',
      matches: [],
    };
  const matched = rules
    .map((rule) => ({ ...rule, matchedTerms: rule.terms.filter((term) => contains(text, term)) }))
    .filter((rule) => rule.matchedTerms.length);
  if (matched.length !== 1)
    return {
      ...base,
      outcome: 'staff',
      explanation: matched.length
        ? 'Your description matches more than one service. Please contact reception or a clinician to choose the appropriate department.'
        : 'No clear department match was found. Please contact hospital reception for help choosing a service.',
      matches: [],
    };
  return {
    ...base,
    outcome: 'matched',
    explanation:
      'A department rule matched your description. This is a navigation suggestion, not a measure of medical certainty or safety.',
    matches: matched,
  };
}
