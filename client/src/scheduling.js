export const hospitalTimezone = 'Asia/Colombo';
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: hospitalTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function dateAfter(days) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: hospitalTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + days * 86400000));
}
export function dateLabel(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: hospitalTimezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
export function timeLabel(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: hospitalTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}
export function localDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: hospitalTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
export function money(minor) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(minor / 100);
}
export function statusClass(value) {
  return value.toLowerCase().replaceAll(' ', '-');
}
