import { useSyncExternalStore } from 'react';
import si from './si.json';
import ta from './ta.json';
const supported = ['en', 'si', 'ta'];
let language = 'en';
try {
  const saved = localStorage.getItem('hms-language');
  if (supported.includes(saved)) language = saved;
} catch {
  /* Private browsing can disable storage. */
}
const listeners = new Set();
export const getLanguage = () => language;
export const getLocale = () => ({ en: 'en-LK', si: 'si-LK', ta: 'ta-LK' })[language];
export function setLanguage(value) {
  if (!supported.includes(value)) return;
  language = value;
  try {
    localStorage.setItem('hms-language', value);
  } catch {
    /* In-memory preference still works. */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  listeners.forEach((listener) => listener());
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === 'hms-language' && supported.includes(event.newValue)) {
      language = event.newValue;
      document.documentElement.lang = language;
      listeners.forEach((listener) => listener());
    }
  });
export function useLanguage() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getLanguage,
    () => 'en',
  );
}
export function t(text, values = {}) {
  if (typeof text !== 'string') return text;
  const translated = (language === 'si' ? si : language === 'ta' ? ta : {})[text] || text;
  return translated.replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
