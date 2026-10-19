import { normalize, rules } from './rules.js';

// Prototype navigation scopes, not clinically validated symptom/diagnosis mappings.
// Real specialty names; all accompanying seed profiles and examples are synthetic.
const entries = [
  ['general', 'General Medicine', 'General medical concerns', 'I have been coughing for two days'],
  ['skin', 'Dermatology', 'Skin concerns', 'My skin feels itchy and has small red patches'],
  ['ent', 'ENT', 'Ear, nose and throat concerns', 'My ear feels blocked'],
  ['eyes', 'Ophthalmology', 'Eye concerns', 'My eyes feel dry after working at a screen'],
  ['joints', 'Orthopaedics', 'Bone and joint injury concerns', 'My knee aches when walking'],
  [
    'cardiology',
    'Cardiology',
    'Routine heart-condition follow-up; acute chest symptoms need review',
    'I would like a routine follow-up for my heart condition',
  ],
  [
    'neurology',
    'Neurology',
    'Routine neurological-condition follow-up; sudden neurological changes need review',
    'I need a routine follow-up for my migraine',
  ],
  [
    'gastroenterology',
    'Gastroenterology',
    'Digestive system concerns',
    'I need a follow-up for recurring indigestion',
  ],
  [
    'endocrinology',
    'Endocrinology',
    'Diabetes, thyroid and hormone-condition reviews',
    'I would like a routine review for diabetes',
  ],
  [
    'respiratory',
    'Respiratory Medicine',
    'Routine lung-condition follow-up; breathing difficulty needs review',
    'I want a routine asthma review',
  ],
  [
    'nephrology',
    'Nephrology',
    'Kidney-condition follow-up',
    'I need a routine follow-up for chronic kidney disease',
  ],
  [
    'urology',
    'Urology',
    'Urinary tract and prostate concerns',
    'I want a routine follow-up for a prostate condition',
  ],
  [
    'rheumatology',
    'Rheumatology',
    'Inflammatory joint and autoimmune-condition follow-up',
    'I would like a review for rheumatoid arthritis',
  ],
  [
    'dental',
    'Dental Care',
    'Teeth, gums and routine dental care',
    'I would like a routine dental check-up',
  ],
  [
    'surgery',
    'General Surgery',
    'Routine surgical follow-up and wound review',
    'I need a routine review of a healed surgical wound',
  ],
  [
    'psychiatry',
    'Psychiatry',
    'Non-crisis mental health support; self-harm concerns need review',
    'I would like support with ongoing anxiety',
  ],
  [
    'rehabilitation',
    'Physiotherapy & Rehabilitation',
    'Physical rehabilitation and mobility recovery',
    'I need help with rehabilitation after a healed ankle injury',
  ],
  [
    'nutrition',
    'Clinical Nutrition',
    'Dietary assessment and nutrition support',
    'I would like help planning a balanced diet',
  ],
  ['paediatrics', 'Paediatrics', 'Child health services; contact hospital staff', null],
  [
    'obstetrics',
    'Obstetrics & Gynaecology',
    'Pregnancy and reproductive health services; contact hospital staff',
    null,
  ],
];
const extraAliases = {
  respiratory: ['pulmonology'],
  dental: ['dentistry', 'dental'],
  rehabilitation: ['physiotherapy', 'rehabilitation medicine'],
  nutrition: ['nutrition', 'dietetics'],
  paediatrics: ['pediatrics'],
  obstetrics: ['obstetrics and gynaecology', 'obstetrics and gynecology'],
};
export const departmentCatalog = entries.map(([id, name, scope, example]) => ({
  id,
  name,
  scope,
  example,
  aiSupported: Boolean(example),
  aliases: [
    ...new Set([
      normalize(name),
      ...(rules.find((r) => r.id === id)?.aliases || []),
      ...(extraAliases[id] || []),
    ]),
  ],
}));
export function catalogDepartment(name) {
  return departmentCatalog.find((entry) => entry.aliases.includes(normalize(name)));
}
