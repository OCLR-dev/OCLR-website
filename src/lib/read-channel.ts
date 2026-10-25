import { AsyncLocalStorage } from "node:async_hooks";
const channel = new AsyncLocalStorage<boolean>();
/** Independent of the user's cumulative roles: this delegated channel never grants writes. */
export const inReadChannel = () => channel.getStore() === true;
export const withReadChannel = <T>(read: () => Promise<T>) =>
  channel.run(true, read);
