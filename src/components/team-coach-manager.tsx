"use client";
import { ReadOnlyFields } from "./staff-read-only";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import { PublicPlayerIdentity } from "./public-player-identity";

export function TeamCoachManager({
  slug,
  version,
  teamId,
  coaches,
}: {
  slug: string;
  version: number;
  teamId: string;
  coaches: { osuId: number; username: string }[];
}) {
  const tr = useAppTranslations(),
    router = useRouter();
  const [id, setId] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function save(action: "add_coach" | "remove_coach", userId: number) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/tournaments/${slug}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          confirmed: true,
          command: { action, teamId, userId },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        // Load the current version so a retry is not rejected as stale again.
        router.refresh();
        throw new Error(result.error);
      }
      setId("");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setPending(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save("add_coach", Number(id));
  }
  return (
    <ReadOnlyFields>
      <section className="form-stack spaced" aria-label={tr("Coaches")}>
        <h3>{tr("Coaches")}</h3>
        <p className="small muted">
          {tr(
            "Coaches do not occupy player slots or receive staff permissions. Coach identities follow roster publication; changes to a published roster are public immediately.",
          )}
        </p>
        <ul className="public-roster-grid">
          {coaches.map((c) => (
            <li className="panel form-stack" key={c.osuId}>
              <PublicPlayerIdentity {...c} />
              <span className="badge">{tr("Coach")}</span>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                aria-label={tr("Remove coach {name}", { name: c.username })}
                onClick={() => void save("remove_coach", c.osuId)}
              >
                {tr("Remove coach")}
              </button>
            </li>
          ))}
        </ul>
        <form className="form-stack" onSubmit={submit}>
          <label className="field">
            <span>{tr("Coach osu! ID")}</span>
            <input
              required
              type="number"
              inputMode="numeric"
              min={1}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
              value={id}
              disabled={pending}
              onChange={(e) => setId(e.target.value)}
            />
          </label>
          <div className="actions">
            <button disabled={pending} type="submit">
              {tr("Add coach")}
            </button>
          </div>
        </form>
        {error && (
          <p className="notice error-text" role="alert">
            {tr(error)}
          </p>
        )}
      </section>
    </ReadOnlyFields>
  );
}
