"use client";

import { useRef, useState, type ReactNode } from "react";
import styles from "./referee-commands.module.css";
import { useAppTranslations } from "@/i18n/shared";
import {
  copyRefereeCommand,
  refereeCommands,
  type RefereeCommand,
  type RefereeCommandInput,
} from "@/lib/referee-commands";

function CommandLine({
  command,
  compact = false,
  onPrepare,
  sent = false,
}: {
  command: RefereeCommand;
  compact?: boolean;
  onPrepare?: (text: string) => void;
  sent?: boolean;
}) {
  const tr = useAppTranslations();
  const text = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "copying" | "copied" | "manual"
  >("idle");
  const labels = {
    make: tr("Create room"),
    set: tr("Room rules"),
    addref: tr("Add Streamer to room"),
    invite: tr("Invite player"),
    timer: tr("Timer"),
    map: tr("Change beatmap"),
    mods: tr("Set Mods"),
    start: tr("Start countdown"),
    abort: tr("Abort game"),
  };
  const reasons: Record<string, string> = {
    "Configure Mods compatible with the round ruleset.": tr(
      "Configure Mods compatible with the round ruleset.",
    ),
    "Enter a valid room name.": tr("Enter a valid room name."),
    "Configure the round rules and room size first.": tr(
      "Configure the round rules and room size first.",
    ),
    "Assign an active Streamer in this fixture’s streaming task.": tr(
      "Assign an active Streamer in this fixture’s streaming task.",
    ),
    "This player's saved username is missing or invalid.": tr(
      "This player's saved username is missing or invalid.",
    ),
    "Choose a positive timer duration.": tr(
      "Choose a positive timer duration.",
    ),
    "Select a saved pool map and configure the ruleset first.": tr(
      "Select a saved pool map and configure the ruleset first.",
    ),
    "Configure this pool category's Mods policy first.": tr(
      "Configure this pool category's Mods policy first.",
    ),
    "Configure the independent start countdown first.": tr(
      "Configure the independent start countdown first.",
    ),
  };
  const label = command.isCaptain
    ? `${tr("Invite captain: {team}", { team: command.teamName ?? "" })} · ${command.playerName || tr("Not set")}`
    : command.teamName
      ? `${command.teamName} · ${command.playerName || labels[command.kind]}`
      : labels[command.kind];
  async function copy() {
    if (!command.text) return;
    if (onPrepare) {
      onPrepare(command.text);
      return;
    }
    setStatus("copying");
    const next = await copyRefereeCommand(command.text, navigator.clipboard);
    setStatus(next);
    if (next === "copied") setCopied(true);
    if (next === "manual") {
      requestAnimationFrame(() => {
        text.current?.focus();
        text.current?.select();
      });
    }
  }
  return (
    <div
      className={`${styles.command} ${compact ? styles.compactCommand : ""}`}
    >
      <div className={styles.commandField}>
        <span>{label}</span>
        {command.text ? (
          compact && status !== "manual" ? (
            <code className={styles.inlineCommand}>{command.text}</code>
          ) : (
            <textarea
              ref={text}
              aria-label={label}
              value={command.text}
              readOnly
              rows={command.kind === "make" ? 2 : 1}
              spellCheck={false}
              className={styles.commandText}
              onFocus={(event) => event.currentTarget.select()}
            />
          )
        ) : (
          <span className="small muted">
            {reasons[command.reason ?? ""] ?? tr("Command unavailable.")}
          </span>
        )}
      </div>
      <div className={styles.copyAction}>
        <button
          type="button"
          className={compact ? styles.iconCopy : "secondary"}
          data-copied={onPrepare ? sent : copied}
          title={
            onPrepare
              ? sent
                ? tr("Simulation confirmed")
                : tr("Prepare in IRC")
              : copied
                ? tr("Copied")
                : tr("Copy command")
          }
          disabled={!command.text || status === "copying"}
          onClick={copy}
          aria-label={
            onPrepare
              ? tr("Prepare {value0} in IRC", { value0: label })
              : tr("Copy {value0}", { value0: label })
          }
        >
          {compact ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
            </svg>
          ) : status === "copying" ? (
            tr("Copying…")
          ) : status === "copied" ? (
            tr("Copied")
          ) : (
            tr("Copy command")
          )}
        </button>
        <span
          className={`small muted ${styles.copyStatus} ${compact && status !== "manual" ? "sr-only" : ""}`}
          role="status"
        >
          {status === "copied"
            ? tr("Copied. Execute this command yourself in osu!.")
            : status === "manual"
              ? tr(
                  "Clipboard unavailable. Select the command and copy it manually.",
                )
              : ""}
        </span>
      </div>
    </div>
  );
}

/** Command previews share the server-projected inherited settings. */
export function RefereeCommands({
  settings,
  policy,
  rules,
  teams,
  selectedMap,
  mapSelector,
  stage,
  onPrepare,
  sentCommands = [],
}: RefereeCommandInput & {
  mapSelector?: ReactNode;
  stage?: "preparation" | "play";
  onPrepare?: (text: string) => void;
  sentCommands?: string[];
}) {
  const tr = useAppTranslations();
  const commands = refereeCommands({
    settings,
    policy,
    rules,
    teams,
    selectedMap,
  });
  const live = commands.filter((command) =>
    ["timer", "map", "mods", "start", "abort"].includes(command.kind),
  );
  const modules = [
    {
      title: tr("Room creation and rules"),
      kinds: ["make", "set"],
      hint: tr(
        "Send make to BanchoBot to create the room, then set its team mode, scoring and capacity.",
      ),
    },
    {
      title: tr("Players and room staff"),
      kinds: ["addref", "invite"],
      hint: tr(
        "The room creator adds the Streamer as a referee. Invite every player from both saved rosters by username, including substitutes.",
      ),
    },
    {
      title: tr("Map and Mods"),
      kinds: ["map", "mods"],
      hint: tr(
        "Choose a pool map, then copy both map and Mods commands. Mods include this round's NF and Freemod settings.",
      ),
    },
    {
      title: tr("Timers and start"),
      kinds: ["timer", "start"],
      hint: tr(
        "Timer starts a preparation countdown. Start begins the game after its separate countdown.",
      ),
    },
    {
      title: tr("Game interruption"),
      kinds: ["abort"],
      hint: tr(
        "Abort stops the game in osu!. Record the actual outcome or replay separately in the BP stage.",
      ),
    },
  ];
  return (
    <section
      className={`panel ${styles.assistant}`}
      aria-label={
        stage === "preparation" ? tr("Command list") : tr("Current commands")
      }
    >
      <div>
        <h3>
          {stage === "preparation"
            ? tr("Command list")
            : tr("Current commands")}
        </h3>
        {stage !== "preparation" && (
          <p className="small muted">
            {tr(
              "Copy commands here, then execute them in osu!. Copying never records a Ban, Pick or game result.",
            )}
          </p>
        )}
      </div>
      {stage !== "play" && (
        <>
          <div className={styles.modules}>
            {modules
              .filter(
                (module) =>
                  stage !== "preparation" ||
                  module.kinds.includes("make") ||
                  module.kinds.includes("invite"),
              )
              .map((module) => (
                <section
                  className={styles.commandModule}
                  key={module.title}
                  aria-label={module.title}
                >
                  <h4>{module.title}</h4>
                  <div className={styles.moduleColumns}>
                    <div className={styles.commandList}>
                      {commands
                        .filter((command) =>
                          module.kinds.includes(command.kind),
                        )
                        .map((command) => (
                          <CommandLine
                            key={`${command.id}:${command.text}`}
                            command={command}
                            onPrepare={onPrepare}
                            sent={
                              !!command.text &&
                              sentCommands.includes(command.text)
                            }
                            compact
                          />
                        ))}
                    </div>
                    <div className={styles.commandHint}>
                      <p>{module.hint}</p>
                      {module.kinds.includes("map") && mapSelector}
                    </div>
                  </div>
                </section>
              ))}
          </div>
          <details className={styles.setupSettings}>
            <summary>{tr("Room settings")}</summary>
            <div className={styles.stack}>
              <p className="small muted">
                {tr(
                  "Room settings use the saved round rules. The Streamer comes from this fixture's streaming task.",
                )}
              </p>
              <dl className={styles.settings}>
                {[
                  [tr("Room name"), settings.roomName || tr("Not set")],
                  [
                    tr("Preparation timer"),
                    settings.timerSeconds ?? tr("Not set"),
                  ],
                  [
                    tr("Start countdown seconds"),
                    settings.startSeconds ?? tr("Not set"),
                  ],
                  [
                    tr("Room slots (not players per team)"),
                    settings.roomSize ?? tr("Not set"),
                  ],
                  [
                    tr("Streamer osu! username"),
                    settings.streamerUsername || tr("Not set"),
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {rules && (
                <p className="small muted">
                  {tr("Players per team: {value0}", {
                    value0: rules.playersPerTeam,
                  })}{" "}
                  ·{" "}
                  {rules.teamType === "team-vs"
                    ? tr("Team Vs")
                    : tr("Head To Head")}{" "}
                  · {rules.scoringType === "scorev2" ? "Score V2" : "Score"}
                </p>
              )}
            </div>
          </details>
        </>
      )}

      {stage !== "preparation" && (
        <>
          {mapSelector}
          <div className={styles.stack}>
            {live.map((command) => (
              <CommandLine
                key={`${command.id}:${command.text}`}
                command={command}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
