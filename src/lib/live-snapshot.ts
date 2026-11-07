import { AsyncResource } from "node:async_hooks";
import { getPool } from "@/db";
import type { Notification } from "pg";
import { remoteMode } from "./data-source";

const channel = "oclr_live_snapshot";
const recheckMs = 10000;

type Subscriber = { refresh: () => void; disconnect: () => void };

function createListener() {
  const subscribers = new Map<string, Set<Subscriber>>();
  async function connect() {
    const client = await getPool().connect();
    function disconnect() {
      if (connection !== pending) return;
      connection = undefined;
      client.off("notification", receive);
      client.off("error", disconnect);
      client.off("end", disconnect);
      client.release(true);
      for (const group of [...subscribers.values()])
        for (const subscriber of [...group]) subscriber.disconnect();
    }
    function receive(message: Notification) {
      if (message.channel === channel && message.payload)
        for (const subscriber of subscribers.get(message.payload) ?? [])
          subscriber.refresh();
    }
    client.on("notification", receive);
    client.on("error", disconnect);
    client.on("end", disconnect);
    const pending = connection;
    try {
      await client.query("LISTEN oclr_live_snapshot");
      if (connection !== pending) throw new Error("Live listener closed");
      return disconnect;
    } catch (error) {
      disconnect();
      throw error;
    }
  }
  let connection: ReturnType<typeof connect> | undefined;
  return {
    async subscribe(key: string, subscriber: Subscriber) {
      let group = subscribers.get(key);
      if (!group) subscribers.set(key, (group = new Set()));
      group.add(subscriber);
      const pending = (connection ??= connect());
      const unsubscribe = () => {
        group.delete(subscriber);
        if (!group.size && subscribers.get(key) === group)
          subscribers.delete(key);
        if (!subscribers.size)
          void pending.then(
            (close) => {
              if (!subscribers.size) close();
            },
            () => {},
          );
      };
      try {
        await pending;
        return unsubscribe;
      } catch (error) {
        if (connection === pending) connection = undefined;
        unsubscribe();
        throw error;
      }
    },
  };
}

const live = globalThis as typeof globalThis & {
  oclrLiveListener?: ReturnType<typeof createListener>;
};

/** The ordinary route supplies each snapshot and rechecks access before every send. */
export async function liveSnapshot(
  request: Request,
  key: string,
  read: () => Promise<Response>,
) {
  if (new URL(request.url).searchParams.get("live") !== "1") return read();
  if (
    remoteMode() ||
    !process.env.DATABASE_URL ||
    !request.headers.get("accept")?.includes("application/x-ndjson")
  )
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });

  const listener = (live.oclrLiveListener ??= createListener());
  const encoder = new TextEncoder();
  let cancel = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let unsubscribe: (() => void) | undefined;
      let timer: ReturnType<typeof setInterval>;
      let closed = false;
      let reading = false;
      let dirty = false;
      let heartbeatDue = false;
      let previous: string | undefined;
      function dispose() {
        if (closed) return false;
        closed = true;
        clearInterval(timer);
        request.signal.removeEventListener("abort", close);
        unsubscribe?.();
        return true;
      }
      function close() {
        if (dispose()) controller.close();
      }
      function enqueue(line: string) {
        if ((controller.desiredSize ?? 0) <= 0) return close();
        controller.enqueue(encoder.encode(line + "\n"));
      }
      async function refresh(heartbeat = false) {
        if (closed) return;
        if (reading) {
          dirty = true;
          heartbeatDue ||= heartbeat;
          return;
        }
        reading = true;
        try {
          const response = await read();
          if ([401, 403, 404].includes(response.status)) {
            if (!closed) enqueue(`{"status":${response.status}}`);
            close();
            return;
          }
          if (!response.ok) return close();
          const snapshot = await response.text();
          if (closed) return;
          if (snapshot !== previous) {
            enqueue(`{"snapshot":${snapshot}}`);
            previous = snapshot;
          } else if (heartbeat) {
            enqueue("{}");
          }
        } catch {
          close();
        } finally {
          reading = false;
          if (!closed && dirty) {
            const heartbeat = heartbeatDue;
            dirty = heartbeatDue = false;
            void refresh(heartbeat);
          }
        }
      }
      cancel = dispose;
      if (request.signal.aborted) return close();
      request.signal.addEventListener("abort", close, { once: true });
      // Notifications come from a connection shared across requests. Preserve
      // this request's cookie/header context when reading its private snapshot.
      const onNotification = AsyncResource.bind(() => {
        if (unsubscribe) void refresh();
      });
      void listener
        .subscribe(key, {
          refresh: onNotification,
          disconnect: close,
        })
        .then((remove) => {
          if (closed) remove();
          else {
            unsubscribe = remove;
            timer = setInterval(() => void refresh(true), recheckMs);
            void refresh();
          }
        }, close);
    },
    cancel() {
      cancel();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
