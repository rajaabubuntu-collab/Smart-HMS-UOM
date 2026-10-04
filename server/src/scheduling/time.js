// All offered sessions are date-specific in Asia/Colombo (UTC+05:30, no DST).
export const hospitalTimezone = 'Asia/Colombo';
export function hospitalDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: hospitalTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export function localInstant(date, time = '00:00') {
  return new Date(`${date}T${time}:00+05:30`);
}
export function dayBounds(date) {
  const start = localInstant(date);
  return { start, end: new Date(start.getTime() + 86400000) };
}
export function validDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function inBookingHorizon(date) {
  const today = hospitalDate();
  return date >= today && date <= hospitalDate(new Date(Date.now() + 180 * 86400000));
}
