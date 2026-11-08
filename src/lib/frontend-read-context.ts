import { AsyncLocalStorage } from "node:async_hooks";

type FrontendReadContext = {
  readonly connectionId: string | undefined;
  readonly values: Map<string, Promise<unknown>>;
};

const requests = new AsyncLocalStorage<FrontendReadContext>();

export function createFrontendReadContext(
  connectionId?: string,
): FrontendReadContext {
  return { connectionId, values: new Map() };
}

export function runFrontendReadContext<T>(
  context: FrontendReadContext,
  read: () => T,
): T {
  return requests.run(context, read);
}

export function currentFrontendReadContext() {
  return requests.getStore();
}

export function frontendRequestValue<T>(
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  const values = currentFrontendReadContext()?.values;
  if (!values) return read();
  const existing = values.get(key);
  if (existing) return existing as Promise<T>;
  const value = read();
  values.set(key, value);
  return value;
}
