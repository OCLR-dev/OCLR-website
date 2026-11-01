CREATE TABLE "player_practice_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"user_id" bigint NOT NULL,
	"entry_id" uuid NOT NULL,
	"beatmap_id" bigint NOT NULL,
	"context_key" text NOT NULL,
	"score" bigint,
	"accuracy" double precision,
	"rating" integer,
	"comment" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_practice_owner_entry_unique" UNIQUE("edition_slug","user_id","entry_id"),
	CONSTRAINT "player_practice_score_valid" CHECK ("player_practice_records"."score" IS NULL OR "player_practice_records"."score" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "player_practice_accuracy_valid" CHECK ("player_practice_records"."accuracy" IS NULL OR "player_practice_records"."accuracy" BETWEEN 0 AND 100),
	CONSTRAINT "player_practice_rating_valid" CHECK ("player_practice_records"."rating" IS NULL OR "player_practice_records"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "player_practice_comment_bounded" CHECK (length("player_practice_records"."comment") <= 2000),
	CONSTRAINT "player_practice_version_valid" CHECK ("player_practice_records"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "player_season_availability" (
	"edition_slug" text NOT NULL,
	"user_id" bigint NOT NULL,
	"intervals" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_availability_edition_slug_user_id_pk" PRIMARY KEY("edition_slug","user_id"),
	CONSTRAINT "player_season_availability_bounded" CHECK (jsonb_typeof("player_season_availability"."intervals") = 'array' AND jsonb_array_length("player_season_availability"."intervals") <= 200),
	CONSTRAINT "player_season_availability_version_valid" CHECK ("player_season_availability"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "player_workspace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"actor_id" bigint NOT NULL,
	"resource" text NOT NULL,
	"entity_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_workspace_request_unique" UNIQUE("edition_slug","actor_id","request_key"),
	CONSTRAINT "player_workspace_resource_valid" CHECK ("player_workspace_events"."resource" IN ('practice','availability'))
);
--> statement-breakpoint
ALTER TABLE "player_practice_records" ADD CONSTRAINT "player_practice_records_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_practice_records" ADD CONSTRAINT "player_practice_records_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_availability" ADD CONSTRAINT "player_season_availability_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_availability" ADD CONSTRAINT "player_season_availability_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_workspace_events" ADD CONSTRAINT "player_workspace_events_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_practice_entry_idx" ON "player_practice_records" USING btree ("edition_slug","entry_id");