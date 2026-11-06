CREATE TABLE "archive_rel_summary" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_slug" text,
	"value_archive_key" text,
	"value_ez_score_multiplier" double precision,
	"value_statistics_score_policy" text,
	"value_stages" text[],
	"value_published_at" text,
	"value_mp_total" bigint,
	"value_mp_covered" bigint,
	CONSTRAINT "archive_rel_summary_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_order_key" UNIQUE("document_id","parent_id","position"),
	CONSTRAINT "archive_rel_summary_root" CHECK ("archive_rel_summary"."id"=0 AND "archive_rel_summary"."parent_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "archive_rel_summary_fixtures" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_label" text,
	"value_stage" text,
	"value_covered" boolean,
	"value_technical_adjudication" boolean,
	"value_score" double precision[],
	CONSTRAINT "archive_rel_summary_fixtures_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_fixtures_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_summary_players" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_osu_id" bigint,
	"value_username" text,
	"value_team_id" text,
	"value_role" text,
	"value_tier" double precision,
	CONSTRAINT "archive_rel_summary_players_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_players_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_summary_pool_fixtures" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_round" text,
	"value_teams" text[],
	"value_team_ids" text[],
	"value_picks" text[],
	CONSTRAINT "archive_rel_summary_pool_fixtures_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_pool_fixtures_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_summary_pool_fixtures_bans" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_team" text,
	"value_team_id" text,
	"value_maps" text[],
	CONSTRAINT "archive_rel_summary_pool_fixtures_bans_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_pool_fixtures_bans_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_summary_pool_fixtures_maps" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_round" text,
	"value_slot" text,
	"value_map_id" double precision,
	"value_title" text,
	CONSTRAINT "archive_rel_summary_pool_fixtures_maps_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_pool_fixtures_maps_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_summary_teams" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_name" text,
	CONSTRAINT "archive_rel_summary_teams_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_summary_teams_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
ALTER TABLE "archive_relation_documents" DROP CONSTRAINT "archive_relation_document_kind";--> statement-breakpoint
ALTER TABLE "archive_relation_documents" DROP CONSTRAINT "archive_relation_document_source";--> statement-breakpoint
ALTER TABLE "archive_read_plays" ADD COLUMN "optional_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD COLUMN "public_summary_document_id" uuid;--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD COLUMN "public_play_count" integer;--> statement-breakpoint
ALTER TABLE "historical_archive_sources" ADD COLUMN "configuration_hash" text;--> statement-breakpoint
ALTER TABLE "archive_rel_summary" ADD CONSTRAINT "archive_rel_summary_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_fixtures" ADD CONSTRAINT "archive_rel_summary_fixtures_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_fixtures" ADD CONSTRAINT "archive_rel_summary_fixtures_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_summary"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_players" ADD CONSTRAINT "archive_rel_summary_players_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_players" ADD CONSTRAINT "archive_rel_summary_players_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_summary"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_pool_fixtures" ADD CONSTRAINT "archive_rel_summary_pool_fixtures_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_pool_fixtures" ADD CONSTRAINT "archive_rel_summary_pool_fixtures_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_summary"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_pool_fixtures_bans" ADD CONSTRAINT "archive_rel_summary_pool_fixtures_bans_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_pool_fixtures_bans" ADD CONSTRAINT "archive_rel_summary_pool_fixtures_bans_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_summary_pool_fixtures"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_pool_fixtures_maps" ADD CONSTRAINT "archive_rel_summary_pool_fixtures_maps_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_pool_fixtures_maps" ADD CONSTRAINT "archive_rel_summary_pool_fixtures_maps_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_summary_pool_fixtures"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_teams" ADD CONSTRAINT "archive_rel_summary_teams_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_summary_teams" ADD CONSTRAINT "archive_rel_summary_teams_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_summary"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_rel_summary_players_value_osu_id_idx" ON "archive_rel_summary_players" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_summary_players_value_team_id_idx" ON "archive_rel_summary_players" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_summary_pool_fixtures_bans_value_team_id_idx" ON "archive_rel_summary_pool_fixtures_bans" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_summary_pool_fixtures_maps_value_slot_idx" ON "archive_rel_summary_pool_fixtures_maps" USING btree ("value_slot","document_id");--> statement-breakpoint
ALTER TABLE "archive_relation_documents" ADD CONSTRAINT "archive_relation_document_edition_id" UNIQUE("edition_slug","id");--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD CONSTRAINT "archive_read_versions_edition_slug_public_summary_document_id_archive_relation_documents_edition_slug_id_fk" FOREIGN KEY ("edition_slug","public_summary_document_id") REFERENCES "public"."archive_relation_documents"("edition_slug","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_relation_documents" ADD CONSTRAINT "archive_relation_document_kind" CHECK ("archive_relation_documents"."kind" IN ('archive','statistics','summary'));--> statement-breakpoint
ALTER TABLE "archive_relation_documents" ADD CONSTRAINT "archive_relation_document_source" CHECK (("archive_relation_documents"."kind" IN ('archive','summary') AND "archive_relation_documents"."mp_id" IS NULL AND "archive_relation_documents"."snapshot_kind" IS NULL) OR ("archive_relation_documents"."kind"='statistics' AND "archive_relation_documents"."mp_id" IS NOT NULL AND "archive_relation_documents"."snapshot_kind" IS NOT NULL AND "archive_relation_documents"."mp_id">0 AND "archive_relation_documents"."snapshot_kind" IN ('draft','published')));--> statement-breakpoint
ALTER TABLE "historical_archive_sources" ADD CONSTRAINT "historical_archive_configuration_hash" CHECK ("historical_archive_sources"."configuration_hash" ~ '^[a-f0-9]{64}$');
--> statement-breakpoint
-- Fill only new typed presence markers; retained payloads/source/history are untouched.
UPDATE public.archive_read_plays p SET optional_fields=ARRAY(
  SELECT key FROM jsonb_object_keys(p.payload) AS keys(key)
  WHERE key IN ('winnerTeamId','rawScore','scoreMultiplier','hits') ORDER BY key
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.refresh_historical_archive_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.configuration->'archive') = 'object' THEN
    INSERT INTO public.historical_archive_sources(edition_slug,source_hash,configuration_hash)
    VALUES(NEW.slug,encode(sha256(convert_to((NEW.configuration->'archive')::text,'UTF8')),'hex'),
      encode(sha256(convert_to(NEW.configuration::text,'UTF8')),'hex'))
    ON CONFLICT(edition_slug) DO UPDATE SET source_hash=EXCLUDED.source_hash,configuration_hash=EXCLUDED.configuration_hash;
  ELSE
    DELETE FROM public.historical_archive_sources WHERE edition_slug=NEW.slug;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['archive_rel_summary','archive_rel_summary_fixtures','archive_rel_summary_players',
    'archive_rel_summary_pool_fixtures','archive_rel_summary_pool_fixtures_bans','archive_rel_summary_pool_fixtures_maps','archive_rel_summary_teams']
  LOOP
    EXECUTE format('CREATE TRIGGER protect_relation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation()',relation);
  END LOOP;
END;
$$;

--> statement-breakpoint
UPDATE public.historical_archive_sources h SET configuration_hash=encode(sha256(convert_to(s.configuration::text,'UTF8')),'hex')
FROM public.edition_state s WHERE h.edition_slug=s.slug;
--> statement-breakpoint
UPDATE public.archive_read_versions v SET public_play_count=(SELECT count(*)::integer FROM public.archive_read_plays p WHERE p.generation_id=v.id);
