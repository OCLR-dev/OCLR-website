import { AsyncLocalStorage } from "node:async_hooks";
import { remoteMode } from "./data-source";
const requests = new AsyncLocalStorage<Map<string, Promise<unknown>>>();
/** Route handlers do not share React's render cache. Keep their verification/data cache strictly inside one request. */
export function withFrontendReadRequest<T>(read: () => Promise<T>) {
  return remoteMode() ? requests.run(new Map(), read) : read();
}
export function frontendRequestValue<T>(
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  const values = requests.getStore();
  if (!values) return read();
  const existing = values.get(key);
  if (existing) return existing as Promise<T>;
  const value = read();
  values.set(key, value);
  return value;
}
