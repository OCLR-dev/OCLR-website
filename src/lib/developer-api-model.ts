/** Explicit read scopes; ordinary staff/write capabilities are never token scopes. */
export const developerApiScopes = [
  "identity:read",
  "tournaments:read",
  "tournaments:private:read",
  "profiles:read",
] as const;
export type DeveloperApiScope = (typeof developerApiScopes)[number];
export type DeveloperTokenMetadata = {
  id: string;
  origin: string;
  ports: number[];
  scopes: DeveloperApiScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
export const developerTokenPrefix = "oclr_dev_";
export function validDeveloperToken(value: string): boolean {
  return value.length === 52 && /^oclr_dev_[A-Za-z0-9_-]{43}$/.test(value);
}
/** Canonical loopback origins only; no suffix matching, credentials or paths. */
export function isDeveloperOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export const maxDeveloperPorts = 20;
export function isDeveloperPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** Check the entire Origin before comparing ports; URL parsing alone accepts aliases. */
export function developerOriginPort(origin: string): number | null {
  if (!isDeveloperOrigin(origin)) return null;
  const url = new URL(origin);
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return isDeveloperPort(port) ? port : null;
}

export function developerOriginAllowed(
  origin: string,
  ports: readonly number[] | null,
) {
  const port = developerOriginPort(origin);
  return port !== null && (ports === null || ports.includes(port));
}

/** Old rows retain their single port without rewriting their origin or audit history. */
export function developerTokenPorts(access: {
  origin: string;
  ports?: number[] | null;
}) {
  if (access.ports != null) return access.ports;
  const port = developerOriginPort(access.origin);
  return port === null ? [] : [port];
}
