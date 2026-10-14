// Normalise Sri Lankan national numbers. This validates format, not ownership/allocation.
export function sriLankanPhone(value, { mobileOnly = false } = {}) {
  const compact = String(value ?? '').replace(/[\s().-]/g, '');
  const international = /^0[1-9]\d{8}$/.test(compact) ? `+94${compact.slice(1)}` : compact;
  return (mobileOnly ? /^\+947\d{8}$/ : /^\+94[1-9]\d{8}$/).test(international)
    ? international
    : null;
}
