CREATE TABLE "referee_mp_bindings" (
	"fixture_id" uuid PRIMARY KEY NOT NULL,
	"match_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"dependency_fingerprint" text NOT NULL,
	"actor_id" bigint NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"import_id" uuid,
	"error" text,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "referee_mp_binding_values" CHECK ("referee_mp_bindings"."match_id" > 0 AND "referee_mp_bindings"."match_id" <= 9007199254740991 AND "referee_mp_bindings"."revision" > 0 AND "referee_mp_bindings"."issue_count" >= 0),
	CONSTRAINT "referee_mp_binding_fingerprint" CHECK ("referee_mp_bindings"."dependency_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "referee_mp_scores" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"fixture_id" uuid NOT NULL,
	"pick_id" uuid NOT NULL,
	"match_id" bigint NOT NULL,
	"game_id" bigint NOT NULL,
	"game_hash" text NOT NULL,
	"event_id" uuid,
	"review" boolean DEFAULT false NOT NULL,
	CONSTRAINT "referee_mp_score_values" CHECK ("referee_mp_scores"."game_id" > 0 AND "referee_mp_scores"."game_id" <= 9007199254740991 AND "referee_mp_scores"."match_id" > 0 AND "referee_mp_scores"."match_id" <= 9007199254740991),
	CONSTRAINT "referee_mp_score_hash" CHECK ("referee_mp_scores"."game_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "referee_mp_bindings" ADD CONSTRAINT "referee_mp_bindings_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_mp_bindings" ADD CONSTRAINT "referee_mp_bindings_actor_id_users_osu_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_mp_bindings" ADD CONSTRAINT "referee_mp_bindings_import_id_match_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."match_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_mp_scores" ADD CONSTRAINT "referee_mp_scores_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referee_mp_scores" ADD CONSTRAINT "referee_mp_scores_event_id_referee_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."referee_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referee_mp_game_once" ON "referee_mp_scores" USING btree ("game_id");