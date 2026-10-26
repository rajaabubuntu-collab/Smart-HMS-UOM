import {
  HeartPulse,
  Brain,
  Eye,
  Ear,
  Bone,
  Flower2,
  Activity,
  Apple,
  Baby,
  Stethoscope,
  Smile,
  HandHeart,
  Accessibility,
  Scissors,
  Droplets,
  Wind,
  Venus,
} from 'lucide-react';

const specialties = [
  [/cardiol/i, HeartPulse, 'rose'],
  [/neurol/i, Brain, 'violet'],
  [/ophthalm|eye/i, Eye, 'blue'],
  [/^ent$|ear.*throat/i, Ear, 'blue'],
  [/orthop|rheumat/i, Bone, 'mint'],
  [/dermat/i, Flower2, 'rose'],
  [/nutrition/i, Apple, 'mint'],
  [/paediatr|pediatr/i, Baby, 'rose'],
  [/dental|dentistry/i, Smile, 'blue'],
  [/psychiatr/i, HandHeart, 'violet'],
  [/physiotherap|rehabil/i, Accessibility, 'mint'],
  [/surgery/i, Scissors, 'blue'],
  [/nephrol|urol/i, Droplets, 'blue'],
  [/respirat|pulmon/i, Wind, 'mint'],
  [/obstetric|gynaecol/i, Venus, 'rose'],
  [/endocrin|gastro/i, Activity, 'violet'],
];

export default function DepartmentIcon({ name, size = 28 }) {
  const [, Icon, tone] = specialties.find(([pattern]) => pattern.test(name || '')) || [
    null,
    Stethoscope,
    'violet',
  ];
  return (
    <span className={`hospital-specialty-icon hospital-specialty-${tone}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.7} />
    </span>
  );
}
