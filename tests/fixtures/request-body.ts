import { editionSchema } from "../../src/lib/editions";
import { generateTurnSequence, maxDraftTurns } from "../../src/lib/draft-order";
import { edition } from "./edition";

export function maximumApplication(answer: string) {
  const questions = Array.from({ length: 16 }, (_, i) => ({
    id: `q${i}`.padEnd(40, "x"),
    label: `Synthetic question ${i}`,
    type: "text" as const,
    required: true,
    maxLength: 2000,
  }));
  const configuration = editionSchema.parse({
    ...edition,
    rules: { ...edition.rules!, version: "測".repeat(80) },
    registration: { ...edition.registration, questions },
  });
  return {
    configuration,
    input: {
      configurationVersion: 0,
      rulesAcknowledged: true,
      eligibilityAcknowledged: true,
      rulesVersion: configuration.rules!.version,
      reapply: { expectedUpdatedAt: "2026-01-01T00:00:00.000Z", attempt: 1 },
      answers: Object.fromEntries(questions.map((q) => [q.id, answer])),
    },
  };
}

export const syntheticTeamIds = Array.from(
  { length: 32 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
);

export function maximumDraftInput(teamIds = syntheticTeamIds) {
  return {
    expectedVersion: 0,
    confirmed: true,
    command: {
      action: "configure",
      expectedSetupVersion: 0,
      turnSequence: generateTurnSequence(
        teamIds,
        maxDraftTurns / teamIds.length,
        "snake",
      ),
    },
  };
}

// JSON permits every string code unit (including ASCII IDs/keys) as \uXXXX.
export function escapedJson(input: unknown) {
  return JSON.stringify(input).replace(/"(?:[^"\\]|\\.)*"/g, (value) => {
    const decoded: string = JSON.parse(value);
    return `"${decoded
      .split("")
      .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join("")}"`;
  });
}
