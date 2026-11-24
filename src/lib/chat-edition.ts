export const chatEditionPattern = /^[a-z0-9-]{1,80}$/;
export function chatEdition(value: string | null) {
  return value && chatEditionPattern.test(value) ? value : null;
}
