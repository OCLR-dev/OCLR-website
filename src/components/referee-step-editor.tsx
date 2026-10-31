"use client";
import { useId, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { refereeMessage } from "@/i18n/referee";
import type { RefereePolicy, RefereeMap } from "@/lib/referee-model";
import styles from "./referee-step-editor.module.css";
type Step = RefereePolicy["steps"][number];
export function RefereeStepEditor({
  step,
  index,
  count,
  categories,
  maps,
  defaultTiedAt,
  tiedScoreReadOnly = false,
  onChange,
  onMove,
  onRemove,
}: {
  step: Step;
  index: number;
  count: number;
  categories: string[];
  maps: RefereeMap[];
  defaultTiedAt: number;
  tiedScoreReadOnly?: boolean;
  onChange: (patch: Partial<Step>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const tr = useAppTranslations();
  const controlId = useId();
  const [search, setSearch] = useState("");
  const limits =
    step.categories.length > 0 ||
    step.entryIds.length > 0 ||
    step.avoidRepeatCategory;
  const availableCategories = categories.filter(
    (category) => step.kind !== "ban" || category !== "TB",
  );
  const availableMaps = maps.filter(
    (map) =>
      (step.kind !== "ban" || map.category !== "TB") &&
      `${map.category}${map.position} ${map.beatmapId}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <li className={styles.row}>
      <div className={styles.primary}>
        <span className={styles.number}>{index + 1}</span>
        <label className={styles.action} htmlFor={`${controlId}-action`}>
          <span className="sr-only" id={`${controlId}-action-label`}>
            {tr("Step {number} action", { number: index + 1 })}
          </span>
          <select
            id={`${controlId}-action`}
            aria-labelledby={`${controlId}-action-label`}
            value={`${step.kind}:${step.actor}`}
            onChange={(event) => {
              const [kind, actor] = event.target.value.split(":") as [
                Step["kind"],
                Step["actor"],
              ];
              onChange({
                kind,
                actor,
                tiedAt: kind === "tb" ? (step.tiedAt ?? defaultTiedAt) : null,
                ...(kind !== step.kind
                  ? {
                      categories: kind === "tb" ? ["TB"] : [],
                      entryIds: [],
                      avoidRepeatCategory: false,
                    }
                  : {}),
              });
            }}
          >
            <option value="ban:firstBan">{tr("First Ban team")}</option>
            <option value="ban:secondBan">
              {refereeMessage(tr, "secondBan")}
            </option>
            <option value="pick:firstPick">{tr("First Pick team")}</option>
            <option value="pick:secondPick">
              {refereeMessage(tr, "secondPick")}
            </option>
            <option value="tb:neutral">TB · {tr("Neutral tiebreaker")}</option>
            <option value="tb:firstPick">TB · {tr("First Pick team")}</option>
            <option value="tb:secondPick">
              TB · {refereeMessage(tr, "secondPick")}
            </option>
          </select>
        </label>
        <div className={styles.tools}>
          <button
            type="button"
            className="secondary"
            disabled={index === 0}
            aria-label={tr("Move step {number} up", { number: index + 1 })}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="secondary"
            disabled={index === count - 1}
            aria-label={tr("Move step {number} down", { number: index + 1 })}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="secondary"
            aria-label={tr("Remove step {number}", { number: index + 1 })}
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </div>
      {step.kind === "tb" && (
        <label className="field">
          <span>{tr("Both teams must have this score before TB")}</span>
          <input
            type="number"
            min={0}
            max={98}
            required
            value={tiedScoreReadOnly ? defaultTiedAt : (step.tiedAt ?? "")}
            readOnly={tiedScoreReadOnly}
            onChange={(event) =>
              onChange({
                tiedAt:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
      )}
      <details className={styles.limits}>
        <summary>
          {limits
            ? tr("Step limits (configured)")
            : tr("Step limits (optional)")}
        </summary>
        <div className={styles.limitFields}>
          <fieldset>
            <legend>{tr("Allowed categories (empty allows all)")}</legend>
            <div className={styles.choices}>
              <button
                type="button"
                className="secondary"
                aria-pressed={step.categories.length === 0}
                onClick={() => onChange({ categories: [] })}
              >
                {tr("All categories")}
              </button>
              {availableCategories.map((category) => (
                <button
                  type="button"
                  className="secondary"
                  key={category}
                  aria-pressed={step.categories.includes(category)}
                  onClick={() =>
                    onChange({
                      categories: step.categories.includes(category)
                        ? step.categories.filter((value) => value !== category)
                        : [...step.categories, category],
                    })
                  }
                >
                  {category}
                </button>
              ))}
            </div>
          </fieldset>
          <details>
            <summary>
              {tr("Allowed pool entries (optional)")} · {step.entryIds.length}
            </summary>
            <div className={styles.limitFields}>
              <label className="field">
                <span>{tr("Find a pool map")}</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => onChange({ entryIds: [] })}
              >
                {tr("Allow all maps")}
              </button>
              <div className={styles.mapChoices}>
                {availableMaps.map((map) => (
                  <label key={map.id}>
                    <input
                      type="checkbox"
                      checked={step.entryIds.includes(map.id)}
                      onChange={(event) =>
                        onChange({
                          entryIds: event.target.checked
                            ? [...step.entryIds, map.id]
                            : step.entryIds.filter((id) => id !== map.id),
                        })
                      }
                    />
                    {map.category}
                    {map.position} · {map.beatmapId}
                  </label>
                ))}
              </div>
            </div>
          </details>
          {step.kind !== "ban" && (
            <label>
              <input
                type="checkbox"
                checked={step.avoidRepeatCategory}
                onChange={(event) =>
                  onChange({ avoidRepeatCategory: event.target.checked })
                }
              />{" "}
              {tr("This team cannot repeat a picked category")}
            </label>
          )}
        </div>
      </details>
    </li>
  );
}
