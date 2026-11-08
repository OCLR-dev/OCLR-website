"use client";
import { useEffect, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { BackupAction } from "@/lib/admin-operations-write-contracts";
type Job = {
  id: string;
  state: string;
  action: string;
  target?: string;
  createdAt: string;
  manifest?: {
    createdAt: string;
    source: string;
    release: string;
    schema: string;
    mediaHash?: string;
  };
};
export function BackupManager() {
  const tr = useAppTranslations(),
    [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [serviceCode, setServiceCode] = useState("loading"),
    [selected, setSelected] = useState<Job | null>(null),
    [confirmation, setConfirmation] = useState("");
  function statusLabel(value: string) {
    switch (value) {
      case "queued":
        return tr("Queued");
      case "running":
        return tr("Running");
      case "validated":
        return tr("Validated");
      case "completed":
        return tr("Completed");
      case "failed":
        return tr("Failed");
      default:
        return value;
    }
  }

  const unavailable = tr("Backup service is unavailable.");
  const serviceMessage =
    serviceCode === "not_configured"
      ? tr(
          "The backup operator has not been configured. Ask the server operator to complete the one-time installation.",
        )
      : serviceCode === "rejected"
        ? tr(
            "The backup operator rejected the connection. Ask the server operator to check the database target and configuration.",
          )
        : serviceCode === "loading"
          ? tr("Checking backup service.")
          : unavailable;
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const r = await fetch("/api/admin/backups", { cache: "no-store" });
        if (!r.ok) {
          const failure = await r.json().catch(() => ({}));
          if (active) {
            setReady(false);
            setServiceCode(failure.code || "unreachable");
          }
          return;
        }
        const data = await r.json();
        if (!Array.isArray(data)) throw Error();
        if (active) {
          setJobs(data);
          setReady(true);
          setServiceCode("");
        }
      } catch {
        if (active) {
          setReady(false);
          setServiceCode("unreachable");
        }
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function submit(action: BackupAction, file?: File, source?: string) {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ action });
      if (source) {
        query.set("source", source);
        query.set("confirm", confirmation);
      }
      const response = await fetch("/api/admin/backups?" + query, {
        method: "POST",
        body: file,
      });
      if (!response.ok) throw Error();
      setSelected(null);
      setConfirmation("");
    } catch {
      setError(tr("Backup request could not be completed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel spaced">
      <p>
        {tr(
          "Backups contain private site data. Restore replaces the entire database and signs everyone out. All staff grants require reauthorization. Matching media files are required separately.",
        )}
      </p>
      <div className="actions backup-actions">
        <button
          className="button"
          disabled={busy || !ready}
          onClick={() => void submit("backup")}
        >
          {tr("Create backup")}
        </button>
        <label>
          {tr("Upload backup for validation")}
          <input
            type="file"
            accept=".oclr"
            disabled={busy || !ready}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void submit("import", file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {!ready && (
        <p role={serviceCode === "loading" ? "status" : "alert"}>
          {serviceMessage}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            <p className="small">{job.id}</p>
            <p>
              {job.createdAt} ·{" "}
              {job.action === "import"
                ? tr("Upload backup for validation")
                : job.action === "restore"
                  ? tr("Confirm restore")
                  : tr("Create backup")}{" "}
              · {statusLabel(job.state)}
            </p>
            {job.state === "completed" && (
              <a
                className="button secondary"
                href={"/api/admin/backups?download=" + job.id}
              >
                {tr("Download")}
              </a>
            )}
            {job.state === "validated" && (
              <button
                className="button secondary"
                onClick={() => {
                  setConfirmation("");
                  setSelected(job);
                }}
              >
                {tr("Review restore")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {selected && (
        <section className="panel spaced">
          <h2>{tr("Confirm full database restore")}</h2>
          <p>
            {selected.manifest?.source} · {selected.manifest?.createdAt}
          </p>
          <p className="small">{selected.target}</p>
          <p className="small">{selected.manifest?.release}</p>
          <p className="small" style={{ overflowWrap: "anywhere" }}>
            {selected.manifest?.schema}
          </p>
          <p>
            {tr(
              "The service will stop during restore. Type REPLACE to confirm replacement of the current database.",
            )}
          </p>
          <input
            aria-label="REPLACE"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
          <div className="actions">
            <button
              className="button"
              disabled={busy || !ready || confirmation !== "REPLACE"}
              onClick={() => void submit("restore", undefined, selected.id)}
            >
              {tr("Confirm restore")}
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setConfirmation("");
                setSelected(null);
              }}
            >
              {tr("Cancel")}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
