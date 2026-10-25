/** Retry-After accepts seconds or an HTTP date. Never retry earlier than asked. */
export function remoteRetrySeconds(value: string | null, now = Date.now()) {
  if (value && /^\d+$/.test(value)) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds)) return Math.max(1, seconds);
  }
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date)
    ? Math.max(1, Math.ceil((date - now) / 1000))
    : 60;
}
