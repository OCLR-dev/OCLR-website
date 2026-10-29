// Keep this module dependency-free: next.config.ts also loads it.
function ipv4(hostname: string): number[] | null {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(hostname))
    return null;
  const octets = hostname.split(".").map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
}

export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    ipv4(hostname)?.[0] === 127
  );
}

export function isPrivateNetworkHostname(hostname: string): boolean {
  const octets = ipv4(hostname);
  if (!octets) return false;
  const [a, b] = octets;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

export function hostnameFromHostHeader(host: string | null): string | null {
  if (!host) return null;
  // Parse only an authority, rejecting credentials, paths and ambiguous values.
  const match = /^(\[[\da-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/.exec(host);
  if (!match || (match[2] && Number(match[2]) > 65535)) return null;
  return match[1].toLowerCase();
}

export function isDevelopmentNetworkRequest(host: string | null): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const hostname = hostnameFromHostHeader(host);
  return (
    hostname !== null &&
    (isPrivateNetworkHostname(hostname) || isLoopbackHostname(hostname))
  );
}

export function allowsPlainHttpOrigin(
  hostname: string,
  environment: string | undefined,
): boolean {
  return (
    isLoopbackHostname(hostname) ||
    (environment === "development" && isPrivateNetworkHostname(hostname))
  );
}
