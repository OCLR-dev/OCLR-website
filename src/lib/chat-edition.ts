export function chatEdition(value: string | null) {
  return value && /^[a-z0-9-]{1,80}$/.test(value) ? value : null;
}
