import { getTableColumns, sql } from "drizzle-orm";
import {
  draftPoolEntries,
  draftSessions,
  draftTurnSlots,
  playerSeasonAvailability,
  playerSeasonAvailabilityIntervals,
  registrationAnswers,
  registrations,
  scheduleAvailability,
  scheduleAvailabilityIntervals,
} from "@/db/schema";
import type { AvailabilityInterval } from "./schedule-model";
import type { SeasonAvailabilityInterval } from "./player-workspace-model";

const { answers: _answers, ...registrationMetadata } =
  getTableColumns(registrations);
void _answers;
export { registrationMetadata };

// JSON aggregation is used only to produce the existing DTO shape from rows.
// Qualify the outer owner explicitly for Drizzle single-table projections.
export const registrationAnswerValues = sql<Record<string, string>>`coalesce((
  SELECT jsonb_object_agg(answer.question_id, answer.value)
  FROM ${registrationAnswers} answer
  WHERE answer.registration_id = "registrations"."id"
), '{}'::jsonb)`;
export const registrationReadColumns = {
  id: registrations.id,
  editionSlug: registrations.editionSlug,
  userId: registrations.userId,
  status: registrations.status,
  source: registrations.source,
  rulesVersion: registrations.rulesVersion,
  eligibilityAcknowledged: registrations.eligibilityAcknowledged,
  eligibilityVerification: registrations.eligibilityVerification,
  configurationVersion: registrations.configurationVersion,
  answers: registrationAnswerValues,
  attempt: registrations.attempt,
  statusReason: registrations.statusReason,
  draftUnavailableReason: registrations.draftUnavailableReason,
  createdAt: registrations.createdAt,
  updatedAt: registrations.updatedAt,
};

const { intervals: _fixtureIntervals, ...fixtureAvailabilityMetadata } =
  getTableColumns(scheduleAvailability);
void _fixtureIntervals;
export const fixtureAvailabilityReadColumns = {
  ...fixtureAvailabilityMetadata,
  intervals: sql<AvailabilityInterval[]>`coalesce((
    SELECT jsonb_agg(jsonb_build_object('start', i."start", 'end', i."end") ORDER BY i.position)
    FROM ${scheduleAvailabilityIntervals} i
    WHERE i.fixture_id = "schedule_availability"."fixture_id"
      AND i.user_id = "schedule_availability"."user_id"
  ), '[]'::jsonb)`,
};

const { intervals: _seasonIntervals, ...seasonAvailabilityMetadata } =
  getTableColumns(playerSeasonAvailability);
void _seasonIntervals;
export { seasonAvailabilityMetadata };
export const seasonAvailabilityReadColumns = {
  ...seasonAvailabilityMetadata,
  intervals: sql<SeasonAvailabilityInterval[]>`coalesce((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('start', i."start", 'end', i."end", 'status', i.status)) ORDER BY i.position)
    FROM ${playerSeasonAvailabilityIntervals} i
    WHERE i.edition_slug = "player_season_availability"."edition_slug"
      AND i.user_id = "player_season_availability"."user_id"
  ), '[]'::jsonb)`,
};

export const draftTurnSequence = sql<string[]>`coalesce((
  SELECT jsonb_agg(slot.team_id ORDER BY slot.position)
  FROM ${draftTurnSlots} slot
  WHERE slot.session_id = "draft_sessions"."id"
), '[]'::jsonb)`;
export const draftSessionReadColumns = {
  id: draftSessions.id,
  editionSlug: draftSessions.editionSlug,
  state: draftSessions.state,
  version: draftSessions.version,
  turnIndex: draftSessions.turnIndex,
  turnSequence: draftTurnSequence,
  pool: sql<number[]>`coalesce((
    SELECT jsonb_agg(entry.user_id ORDER BY entry.position)
    FROM ${draftPoolEntries} entry
    WHERE entry.session_id = "draft_sessions"."id"
  ), '[]'::jsonb)`,
  publicVersion: draftSessions.publicVersion,
  publishedRevision: draftSessions.publishedRevision,
  publicSnapshot: draftSessions.publicSnapshot,
  captainSnapshot: draftSessions.captainSnapshot,
};
