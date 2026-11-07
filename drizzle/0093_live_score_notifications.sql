ALTER TABLE "referee_events" ADD COLUMN "resolved_pick_id" uuid GENERATED ALWAYS AS (CASE WHEN payload->>'type' = 'attempt_resolved'
                AND (payload->>'pickId') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
               THEN (payload->>'pickId')::uuid END) STORED;--> statement-breakpoint
ALTER TABLE "referee_events" ADD COLUMN "resolved_attempt_id" uuid GENERATED ALWAYS AS (CASE WHEN payload->>'type' = 'attempt_resolved'
                AND (payload->>'attemptId') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
               THEN (payload->>'attemptId')::uuid END) STORED;--> statement-breakpoint
ALTER TABLE "referee_events" ADD COLUMN "resolved_status" text GENERATED ALWAYS AS (CASE WHEN payload->>'type' = 'attempt_resolved' THEN payload->>'status' END) STORED;--> statement-breakpoint
ALTER TABLE "referee_events" ADD COLUMN "resolved_winner_team_id" uuid GENERATED ALWAYS AS (CASE WHEN payload->>'type' = 'attempt_resolved'
                AND (payload->>'winnerTeamId') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
               THEN (payload->>'winnerTeamId')::uuid END) STORED;
--> statement-breakpoint
-- Notifications contain a routing key only. PostgreSQL delivers them on commit.
CREATE FUNCTION oclr_notify_draft_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  edition text := COALESCE(NEW.edition_slug, OLD.edition_slug);
BEGIN
  PERFORM pg_notify('oclr_live_snapshot', 'draft-private:' || edition);
  IF TG_OP = 'INSERT' THEN
    IF NEW.public_snapshot IS NOT NULL THEN
      PERFORM pg_notify('oclr_live_snapshot', 'draft-public:' || edition);
    END IF;
  ELSIF TG_OP = 'DELETE' OR NEW.public_snapshot IS DISTINCT FROM OLD.public_snapshot THEN
    PERFORM pg_notify('oclr_live_snapshot', 'draft-public:' || edition);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER oclr_live_draft_snapshot
AFTER INSERT OR UPDATE OR DELETE ON draft_sessions
FOR EACH ROW EXECUTE FUNCTION oclr_notify_draft_snapshot();
--> statement-breakpoint
CREATE FUNCTION oclr_notify_draft_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  edition text := COALESCE(NEW.edition_slug, OLD.edition_slug);
BEGIN
  PERFORM pg_notify('oclr_live_snapshot', 'draft-public:' || edition);
  PERFORM pg_notify('oclr_live_snapshot', 'draft-private:' || edition);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER oclr_live_draft_captains
AFTER INSERT OR UPDATE OR DELETE ON captains
FOR EACH ROW EXECUTE FUNCTION oclr_notify_draft_access();
--> statement-breakpoint
CREATE TRIGGER oclr_live_draft_teams
AFTER INSERT OR UPDATE OR DELETE ON teams
FOR EACH ROW EXECUTE FUNCTION oclr_notify_draft_access();
--> statement-breakpoint
CREATE FUNCTION oclr_notify_draft_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('oclr_live_snapshot', 'draft-public:' || NEW.slug);
  PERFORM pg_notify('oclr_live_snapshot', 'draft-private:' || NEW.slug);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER oclr_live_draft_settings
AFTER UPDATE OF configuration_version, pool_published, setup_version ON edition_state
FOR EACH ROW WHEN (
  OLD.configuration_version IS DISTINCT FROM NEW.configuration_version
  OR OLD.pool_published IS DISTINCT FROM NEW.pool_published
  OR OLD.setup_version IS DISTINCT FROM NEW.setup_version
)
EXECUTE FUNCTION oclr_notify_draft_settings();
--> statement-breakpoint
CREATE FUNCTION oclr_notify_referee_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('oclr_live_snapshot', 'referee:' || COALESCE(NEW.fixture_id, OLD.fixture_id)::text);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER oclr_live_referee_session
AFTER INSERT OR UPDATE OR DELETE ON referee_sessions
FOR EACH ROW EXECUTE FUNCTION oclr_notify_referee_snapshot();
--> statement-breakpoint
CREATE TRIGGER oclr_live_referee_assignment
AFTER INSERT OR UPDATE OR DELETE ON fixture_referees
FOR EACH ROW EXECUTE FUNCTION oclr_notify_referee_snapshot();
