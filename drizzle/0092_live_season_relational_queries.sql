CREATE TABLE "draft_pool_entries" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"user_id" bigint NOT NULL,
	CONSTRAINT "draft_pool_entries_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "draft_pool_entry_position" CHECK ("draft_pool_entries"."position" > 0),
	CONSTRAINT "draft_pool_entry_user" CHECK ("draft_pool_entries"."user_id" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "draft_turn_slots" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"team_id" uuid NOT NULL,
	CONSTRAINT "draft_turn_slots_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "draft_turn_slot_position" CHECK ("draft_turn_slots"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "player_season_availability_intervals" (
	"edition_slug" text NOT NULL,
	"user_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"status" text,
	CONSTRAINT "player_season_availability_intervals_edition_slug_user_id_position_pk" PRIMARY KEY("edition_slug","user_id","position"),
	CONSTRAINT "player_season_interval_position" CHECK ("player_season_availability_intervals"."position" BETWEEN 1 AND 200),
	CONSTRAINT "player_season_interval_status" CHECK ("player_season_availability_intervals"."status" IN ('available','unsure','unavailable'))
);
--> statement-breakpoint
CREATE TABLE "registration_answers" (
	"registration_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "registration_answers_registration_id_question_id_pk" PRIMARY KEY("registration_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_availability_intervals" (
	"fixture_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	CONSTRAINT "schedule_availability_intervals_fixture_id_user_id_position_pk" PRIMARY KEY("fixture_id","user_id","position"),
	CONSTRAINT "schedule_interval_position" CHECK ("schedule_availability_intervals"."position" BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "draft_pool_entries" ADD CONSTRAINT "draft_pool_entries_session_id_draft_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."draft_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_turn_slots" ADD CONSTRAINT "draft_turn_slots_session_id_draft_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."draft_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_availability_intervals" ADD CONSTRAINT "player_season_availability_intervals_owner_fk" FOREIGN KEY ("edition_slug","user_id") REFERENCES "public"."player_season_availability"("edition_slug","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_answers" ADD CONSTRAINT "registration_answers_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_availability_intervals" ADD CONSTRAINT "schedule_availability_intervals_owner_fk" FOREIGN KEY ("fixture_id","user_id") REFERENCES "public"."schedule_availability"("fixture_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_pool_entries_membership_idx" ON "draft_pool_entries" USING btree ("session_id","user_id");
--> statement-breakpoint
-- Keep older writers compatible. A parent write and its typed children commit together.
CREATE FUNCTION public.sync_registration_answers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE restored jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.answers IS NOT DISTINCT FROM OLD.answers THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.registration_answers WHERE registration_id = NEW.id;
  WITH saved AS (
    INSERT INTO public.registration_answers(registration_id, question_id, value)
    SELECT NEW.id, key, value FROM jsonb_each_text(NEW.answers)
    RETURNING question_id, value
  )
  SELECT coalesce(jsonb_object_agg(question_id, value), '{}'::jsonb) INTO restored FROM saved;
  IF restored IS DISTINCT FROM NEW.answers THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Registration answers must contain text values.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_registration_answers AFTER INSERT OR UPDATE OF answers ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.sync_registration_answers();
--> statement-breakpoint
CREATE FUNCTION public.sync_schedule_availability_intervals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE restored jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.intervals IS NOT DISTINCT FROM OLD.intervals THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.schedule_availability_intervals
  WHERE fixture_id = NEW.fixture_id AND user_id = NEW.user_id;
  WITH saved AS (
    INSERT INTO public.schedule_availability_intervals(fixture_id, user_id, position, "start", "end")
    SELECT NEW.fixture_id, NEW.user_id, position, value->>'start', value->>'end'
    FROM jsonb_array_elements(NEW.intervals) WITH ORDINALITY AS item(value, position)
    RETURNING position, "start", "end"
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('start', "start", 'end', "end") ORDER BY position), '[]'::jsonb)
  INTO restored FROM saved;
  IF restored IS DISTINCT FROM NEW.intervals THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Unsupported fixture availability interval.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_schedule_availability_intervals AFTER INSERT OR UPDATE OF intervals ON public.schedule_availability
FOR EACH ROW EXECUTE FUNCTION public.sync_schedule_availability_intervals();
--> statement-breakpoint
CREATE FUNCTION public.sync_player_season_availability_intervals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE restored jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.intervals IS NOT DISTINCT FROM OLD.intervals THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.player_season_availability_intervals
  WHERE edition_slug = NEW.edition_slug AND user_id = NEW.user_id;
  WITH saved AS (
    INSERT INTO public.player_season_availability_intervals(edition_slug, user_id, position, "start", "end", status)
    SELECT NEW.edition_slug, NEW.user_id, position, value->>'start', value->>'end', value->>'status'
    FROM jsonb_array_elements(NEW.intervals) WITH ORDINALITY AS item(value, position)
    RETURNING position, "start", "end", status
  )
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('start', "start", 'end', "end", 'status', status)) ORDER BY position), '[]'::jsonb)
  INTO restored FROM saved;
  IF restored IS DISTINCT FROM NEW.intervals THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Unsupported season availability interval.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_player_season_availability_intervals AFTER INSERT OR UPDATE OF intervals ON public.player_season_availability
FOR EACH ROW EXECUTE FUNCTION public.sync_player_season_availability_intervals();
--> statement-breakpoint
INSERT INTO public.registration_answers(registration_id, question_id, value)
SELECT r.id, answer.key, answer.value
FROM public.registrations r CROSS JOIN LATERAL jsonb_each_text(r.answers) AS answer;
--> statement-breakpoint
INSERT INTO public.schedule_availability_intervals(fixture_id, user_id, position, "start", "end")
SELECT a.fixture_id, a.user_id, item.position, item.value->>'start', item.value->>'end'
FROM public.schedule_availability a
CROSS JOIN LATERAL jsonb_array_elements(a.intervals) WITH ORDINALITY AS item(value, position);
--> statement-breakpoint
INSERT INTO public.player_season_availability_intervals(edition_slug, user_id, position, "start", "end", status)
SELECT a.edition_slug, a.user_id, item.position, item.value->>'start', item.value->>'end', item.value->>'status'
FROM public.player_season_availability a
CROSS JOIN LATERAL jsonb_array_elements(a.intervals) WITH ORDINALITY AS item(value, position);
--> statement-breakpoint
CREATE FUNCTION public.sync_draft_ordered_entries() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE restored jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.pool IS DISTINCT FROM OLD.pool THEN
    DELETE FROM public.draft_pool_entries WHERE session_id = NEW.id;
    WITH saved AS (
      INSERT INTO public.draft_pool_entries(session_id, position, user_id)
      SELECT NEW.id, item.position, (item.value #>> '{}')::numeric::bigint
      FROM jsonb_array_elements(NEW.pool) WITH ORDINALITY AS item(value, position)
      RETURNING position, user_id
    )
    SELECT coalesce(jsonb_agg(user_id ORDER BY position), '[]'::jsonb) INTO restored FROM saved;
    IF restored IS DISTINCT FROM NEW.pool THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Draft pool must contain numeric player IDs.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.turn_sequence IS DISTINCT FROM OLD.turn_sequence THEN
    DELETE FROM public.draft_turn_slots WHERE session_id = NEW.id;
    WITH saved AS (
      INSERT INTO public.draft_turn_slots(session_id, position, team_id)
      SELECT NEW.id, item.position, item.value::uuid
      FROM jsonb_array_elements_text(NEW.turn_sequence) WITH ORDINALITY AS item(value, position)
      RETURNING position, team_id
    )
    SELECT coalesce(jsonb_agg(team_id ORDER BY position), '[]'::jsonb) INTO restored FROM saved;
    IF restored IS DISTINCT FROM NEW.turn_sequence THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Draft turn order must contain saved team IDs.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_draft_ordered_entries AFTER INSERT OR UPDATE OF pool, turn_sequence ON public.draft_sessions
FOR EACH ROW EXECUTE FUNCTION public.sync_draft_ordered_entries();
--> statement-breakpoint
INSERT INTO public.draft_pool_entries(session_id, position, user_id)
SELECT s.id, item.position, (item.value #>> '{}')::numeric::bigint
FROM public.draft_sessions s
CROSS JOIN LATERAL jsonb_array_elements(s.pool) WITH ORDINALITY AS item(value, position);
--> statement-breakpoint
INSERT INTO public.draft_turn_slots(session_id, position, team_id)
SELECT s.id, item.position, item.value::uuid
FROM public.draft_sessions s
CROSS JOIN LATERAL jsonb_array_elements_text(s.turn_sequence) WITH ORDINALITY AS item(value, position);
--> statement-breakpoint
-- Verify against the retained originals before committing the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.answers IS DISTINCT FROM (
      SELECT coalesce(jsonb_object_agg(a.question_id, a.value), '{}'::jsonb)
      FROM public.registration_answers a WHERE a.registration_id = r.id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.schedule_availability a
    WHERE a.intervals IS DISTINCT FROM (
      SELECT coalesce(jsonb_agg(jsonb_build_object('start', i."start", 'end', i."end") ORDER BY i.position), '[]'::jsonb)
      FROM public.schedule_availability_intervals i
      WHERE i.fixture_id = a.fixture_id AND i.user_id = a.user_id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.player_season_availability a
    WHERE a.intervals IS DISTINCT FROM (
      SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('start', i."start", 'end', i."end", 'status', i.status)) ORDER BY i.position), '[]'::jsonb)
      FROM public.player_season_availability_intervals i
      WHERE i.edition_slug = a.edition_slug AND i.user_id = a.user_id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.draft_sessions s
    WHERE s.pool IS DISTINCT FROM (
      SELECT coalesce(jsonb_agg(p.user_id ORDER BY p.position), '[]'::jsonb)
      FROM public.draft_pool_entries p WHERE p.session_id = s.id
    ) OR s.turn_sequence IS DISTINCT FROM (
      SELECT coalesce(jsonb_agg(t.team_id ORDER BY t.position), '[]'::jsonb)
      FROM public.draft_turn_slots t WHERE t.session_id = s.id
    )
  ) THEN
    RAISE EXCEPTION 'Live season data failed lossless relation verification.';
  END IF;
END;
$$;
