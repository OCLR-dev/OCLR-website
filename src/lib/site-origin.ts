/**
 * Origin predicates shared by request-time code and next.config.ts.
 * Keep this module dependency-free: it is imported while Next loads its config.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function ipv4Octets(hostname: string): number[] | null {
  const parts = normalizeHostname(hostname).split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) =>
      /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN,
  );
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

export function isLoopbackHostname(hostname: string) {
  return LOOPBACK_HOSTNAMES.has(normalizeHostname(hostname));
}

/** Split a Host header value into its hostname, dropping any port. */
export function hostnameFromHostHeader(host: string) {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const port = value.indexOf(":");
  return port === -1 ? value : value.slice(0, port);
}

/**
 * Development-only LAN entry point. next dev relativizes redirects against its
 * own startup origin, so a canonical redirect from a private address would loop
 * on the same URL instead of leaving the host.
 */
export function isDevelopmentNetworkRequest(host: string | null) {
  return (
      process.env.NODE_ENV === "development" &&
      host !== null &&
      isPrivateNetworkHostname(hostnameFromHostHeader(host))
  );
}

/** RFC 1918 IPv4 literals: 10/8, 172.16/12 and 192.168/16. */
export function isPrivateNetworkHostname(hostname: string) {
  const octets = ipv4Octets(hostname);
  if (!octets) return false;
  const [first, second] = octets;
  return (
      first === 10 ||
      (first === 192 && second === 168) ||
      (first === 172 && second >= 16 && second <= 31)
  );
}

/**
 * Plain HTTP is acceptable on loopback anywhere, and on a private IPv4 origin
 * only in development. Production keeps the HTTPS-only rule.
 */
export function allowsPlainHttpOrigin(
    hostname: string,
    environment: string | undefined,
) {
  return (
      isLoopbackHostname(hostname) ||
      (environment === "development" && isPrivateNetworkHostname(hostname))
  );
}
