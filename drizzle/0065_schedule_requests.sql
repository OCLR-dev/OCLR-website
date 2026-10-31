CREATE TABLE "schedule_availability" (
	"fixture_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"membership_id" uuid NOT NULL,
	"intervals" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "schedule_availability_fixture_id_user_id_pk" PRIMARY KEY("fixture_id","user_id"),
	CONSTRAINT "schedule_availability_intervals" CHECK (jsonb_typeof("schedule_availability"."intervals") = 'array' AND jsonb_array_length("schedule_availability"."intervals") <= 40)
);
--> statement-breakpoint
CREATE TABLE "schedule_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"request_id" uuid,
	"actor_id" bigint,
	"request_key" uuid,
	"request_hash" text,
	"action" text NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_event_request_key" UNIQUE("edition_slug","actor_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "schedule_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"fixture_id" uuid,
	"fixture_snapshot_id" uuid NOT NULL,
	"label" text NOT NULL,
	"basis" jsonb NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"proposer_id" bigint NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"decision_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_request_status" CHECK ("schedule_requests"."status" IN ('waiting','pending','approved','rejected','withdrawn','expired'))
);
--> statement-breakpoint
ALTER TABLE "schedule_availability" ADD CONSTRAINT "schedule_availability_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_availability" ADD CONSTRAINT "schedule_availability_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_availability" ADD CONSTRAINT "schedule_availability_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_request_id_schedule_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."schedule_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_actor_id_users_osu_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("osu_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_requests" ADD CONSTRAINT "schedule_requests_proposer_id_users_osu_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_events_request" ON "schedule_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_one_active_request" ON "schedule_requests" USING btree ("fixture_id") WHERE "schedule_requests"."status" IN ('waiting', 'pending');--> statement-breakpoint
CREATE INDEX "schedule_requests_edition" ON "schedule_requests" USING btree ("edition_slug");--> statement-breakpoint
CREATE FUNCTION schedule_expiry_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'expired' AND OLD.status IN ('waiting','pending') THEN
    INSERT INTO schedule_events (edition_slug, request_id, action, detail)
    VALUES (NEW.edition_slug, NEW.id, 'expired', jsonb_build_object('before',to_jsonb(OLD),'after',to_jsonb(NEW)));
    INSERT INTO edition_events (edition_slug, kind, detail)
    VALUES (NEW.edition_slug, 'competition_schedule', jsonb_build_object('action','expired','requestId',NEW.id));
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER schedule_expiry_audit AFTER UPDATE ON schedule_requests FOR EACH ROW EXECUTE FUNCTION schedule_expiry_audit();
--> statement-breakpoint
CREATE FUNCTION invalidate_schedule_requests() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'fixtures' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE fixture_id=OLD.id AND status IN ('waiting','pending');
      RETURN OLD;
    END IF;
    IF ROW(OLD.scheduled_at,OLD.time_zone,OLD.home_team_id,OLD.away_team_id,OLD.home_source_id,OLD.away_source_id,OLD.home_source_outcome,OLD.away_source_outcome,OLD.published_at,OLD.status,OLD.round_id) IS DISTINCT FROM ROW(NEW.scheduled_at,NEW.time_zone,NEW.home_team_id,NEW.away_team_id,NEW.home_source_id,NEW.away_source_id,NEW.home_source_outcome,NEW.away_source_outcome,NEW.published_at,NEW.status,NEW.round_id) THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE fixture_id=NEW.id AND status IN ('waiting','pending');
    END IF;
  ELSIF TG_TABLE_NAME = 'edition_state' THEN
    IF NEW.locked_at IS NOT NULL OR NEW.configuration->>'status'='completed' OR NOT coalesce((NEW.configuration->>'published')::boolean,false) OR NEW.configuration->'archive' IS NOT NULL AND NEW.configuration->'archive' <> 'null'::jsonb THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=NEW.slug AND status IN ('waiting','pending');
    END IF;
  ELSIF TG_TABLE_NAME = 'teams' THEN
    IF OLD.captain_id IS DISTINCT FROM NEW.captain_id OR NEW.archived_at IS NOT NULL OR NOT NEW.identity_published OR NOT NEW.roster_published OR NEW.finalized_at IS NULL THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=OLD.edition_slug AND (basis->>'homeTeamId'=OLD.id::text OR basis->>'awayTeamId'=OLD.id::text) AND status IN ('waiting','pending');
    END IF;
  ELSIF TG_TABLE_NAME = 'captains' THEN
    IF TG_OP = 'UPDATE' AND NEW.user_id=OLD.user_id AND NEW.edition_slug=OLD.edition_slug AND NEW.published THEN RETURN NEW; END IF;
    UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=OLD.edition_slug AND (basis->>'homeCaptainId'=OLD.user_id::text OR basis->>'awayCaptainId'=OLD.user_id::text) AND status IN ('waiting','pending');
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'memberships' THEN
    IF TG_OP='DELETE' OR NEW.left_at IS NOT NULL THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=OLD.edition_slug AND (basis->>'homeCaptainId'=OLD.user_id::text OR basis->>'awayCaptainId'=OLD.user_id::text) AND status IN ('waiting','pending');
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  ELSE
    WITH RECURSIVE affected(id) AS (SELECT NEW.fixture_id UNION SELECT f.id FROM fixtures f JOIN affected a ON f.home_source_id=a.id OR f.away_source_id=a.id)
    UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE fixture_id IN (SELECT id FROM affected) AND status IN ('waiting','pending');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER schedule_fixture_invalidation BEFORE UPDATE OR DELETE ON fixtures FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_edition_invalidation AFTER UPDATE ON edition_state FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_team_invalidation AFTER UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_captain_invalidation BEFORE DELETE ON captains FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_membership_invalidation BEFORE UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_result_invalidation AFTER INSERT ON match_results FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_revision_invalidation AFTER INSERT ON result_revisions FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_referee_invalidation AFTER INSERT ON referee_events FOR EACH ROW WHEN (NEW.payload->>'type' NOT IN ('settings_saved','policy_configured','dependencies_reconfirmed')) EXECUTE FUNCTION invalidate_schedule_requests();

--> statement-breakpoint
CREATE TRIGGER schedule_captain_update_invalidation BEFORE UPDATE OF published,user_id,edition_slug ON captains FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_result_update_invalidation AFTER UPDATE ON match_results FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
--> statement-breakpoint
CREATE TRIGGER schedule_revision_update_invalidation AFTER UPDATE ON result_revisions FOR EACH ROW EXECUTE FUNCTION invalidate_schedule_requests();
