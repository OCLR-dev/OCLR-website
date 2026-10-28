"use client";
import { LoadingOverlay } from "./loading-overlay";
import { LoadingRegion } from "./loading-region";
import { useAppTranslations } from "@/i18n/shared";
import { remoteErrorMessage } from "@/lib/remote-errors";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { RemoteReadOnlyContext } from "./staff-read-only";
import { remoteHealthMonitor } from "@/lib/remote-health";
export function RemoteNotice({
  code = "REMOTE_UNSUPPORTED",
}: {
  code?: string;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="container page" role="status">
      {pending && <LoadingOverlay />}
      <h1>{tr("Remote frontend development")}</h1>
      <p className="notice">{remoteErrorMessage(code, tr)}</p>
      {["REMOTE_UNAVAILABLE", "RATE_LIMITED", "COLLECTION_CHANGED"].includes(
        code,
      ) && (
        <button
          type="button"
          className="secondary"
          disabled={pending}
          aria-busy={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {tr("Try again")}
        </button>
      )}
      <Link className="context-link" href="/remote">
        {tr("Manage remote connection")}
      </Link>
    </section>
  );
}
export function RemoteBoundary({
  children,
  error,
}: {
  children: ReactNode;
  error?: string;
}) {
  const path = usePathname();
  const [failure, setFailure] = useState<{ path: string; code: string } | null>(
    null,
  );
  const router = useRouter();
  useEffect(() => {
    const monitor = remoteHealthMonitor({
      privatePage: path.startsWith("/admin/"),
      initialFailure: Boolean(error),
      read: (signal) =>
        fetch("/api/remote/connection", { cache: "no-store", signal }),
      failed: (code) => setFailure({ path, code }),
      recovered: () => {
        setFailure(null);
        router.refresh();
      },
    });
    let active = true;
    let timer: number;
    const check = async () => {
      if (document.visibilityState === "visible") await monitor.check();
      if (!active) return;
      window.clearTimeout(timer);
      const delay = monitor.delay();
      if (delay !== null)
        timer = window.setTimeout(
          check,
          document.visibilityState === "visible"
            ? Math.max(1000, delay)
            : 15000,
        );
    };
    timer = window.setTimeout(check, 15000);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      monitor.dispose();
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [path, router, error]);
  if (["/remote", "/login", "/developer"].includes(path))
    return (
      <RemoteReadOnlyContext value={true}>{children}</RemoteReadOnlyContext>
    );
  const code = error ?? (failure?.path === path ? failure.code : undefined);
  return code ? (
    <RemoteNotice code={code} />
  ) : (
    <RemoteReadOnlyContext value={true}>{children}</RemoteReadOnlyContext>
  );
}
export function RemoteConnectionForm({ connected }: { connected: boolean }) {
  const tr = useAppTranslations();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const token = String(values.get("token") ?? "");
    form.reset(); // Clear the input before the request; never keep the token in React state.
    await change("connect", "POST", { mode: "developer", token });
  }
  async function change(action: string, method: string, body?: unknown) {
    if (busy) return;
    setActiveAction(action);
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/remote/connection", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) setError(result.code ?? "REMOTE_UNAVAILABLE");
      else {
        window.location.reload();
        return;
      }
    } catch {
      setError("REMOTE_UNAVAILABLE");
    }
    setBusy(false);
  }
  return (
    <section className="panel stack">
      {busy && <LoadingRegion />}
      <h2>{tr("Connect with Developer access")}</h2>
      <p className="muted">
        {tr(
          "Create short-lived access on the backend with identity:read and the required read scopes. Paste it here once; the local server keeps it only in memory.",
        )}
      </p>
      {error && (
        <p className="notice" role="alert">
          {remoteErrorMessage(error, tr)}
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          {tr("Developer token")}
          <input
            name="token"
            type="password"
            autoComplete="off"
            maxLength={100}
            required
            spellCheck={false}
          />
        </label>
        <div className="actions">
          <button
            disabled={busy}
            aria-busy={busy && activeAction === "connect"}
          >
            {tr("Connect")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-busy={busy && activeAction === "anonymous"}
            onClick={() => change("anonymous", "POST", { mode: "anonymous" })}
          >
            {tr("Browse public data anonymously")}
          </button>
          {connected && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-busy={busy && activeAction === "refresh"}
              onClick={() => change("refresh", "POST", { mode: "refresh" })}
            >
              {tr("Refresh")}
            </button>
          )}
          {connected && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-busy={busy && activeAction === "disconnect"}
              onClick={() => change("disconnect", "DELETE")}
            >
              {tr("Disconnect")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
