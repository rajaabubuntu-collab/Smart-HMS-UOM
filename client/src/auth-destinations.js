// Navigation hints are never authorization. Destination routes still enforce role/ownership.
export function safePatientReturn(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  if (
    /^\/(?:billing|notifications|messages|records|appointments(?:\?selected=[a-f\d]{24})?|billing\/[a-f\d]{24})$/i.test(
      value,
    )
  )
    return true;
  if (!/^\/book(?:\?|$)/.test(value) || value.includes('#')) return false;
  const params = new URLSearchParams(value.split('?')[1] || '');
  const seen = new Set();
  for (const [key, entry] of params) {
    if (seen.has(key)) return false;
    seen.add(key);
    if (key === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) return false;
      const date = new Date(`${entry}T00:00:00Z`);
      if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== entry) return false;
    } else if (!['doctor', 'department', 'slot'].includes(key) || !/^[a-f\d]{24}$/i.test(entry))
      return false;
  }
  return !seen.has('slot') || (seen.has('doctor') && seen.has('date'));
}
