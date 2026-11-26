import type { AppTranslator } from "./translate";

const labels = new Map([
  ["not_configured", "Not configured"],
  ["unannounced", "liru_registration_unannounced"],
  ["upcoming", "liru_registration_upcoming"],
  ["open", "liru_registration_open"],
  ["closed", "liru_registration_closed"],
  ["paused", "liru_registration_paused"],
  ["unavailable", "liru_registration_unavailable"],
]);

export function registrationStateLabel(state: string, tr: AppTranslator) {
  return tr(labels.get(state) ?? state);
}
