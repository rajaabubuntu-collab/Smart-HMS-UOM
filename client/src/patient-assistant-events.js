export function openPatientAssistant(mode = 'help') {
  window.dispatchEvent(new CustomEvent('hms:patient-assistant', { detail: { mode } }));
}
