CREATE TABLE "contributor_directory" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contributor_directory_singleton" CHECK ("contributor_directory"."id" = 1),
	CONSTRAINT "contributor_directory_revision" CHECK ("contributor_directory"."revision" >= 0),
	CONSTRAINT "contributor_directory_array" CHECK (jsonb_typeof("contributor_directory"."entries") = 'array')
);
--> statement-breakpoint
CREATE TABLE "contributor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" bigint,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributor_events_revision_unique" UNIQUE("revision"),
	CONSTRAINT "contributor_events_revision" CHECK ("contributor_events"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "contributor_events" ADD CONSTRAINT "contributor_events_actor_id_users_osu_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("osu_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Preserve the previously published About identities and their original order.
-- This migration is tracked once; the insert is also safe to repeat.
INSERT INTO contributor_directory (id, entries) VALUES (1, '[{"id":"27500000-0000-4000-8000-000000000001","name":"qi_e","osuId":6963321,"published":true},{"id":"27500000-0000-4000-8000-000000000002","name":"Muziyami","osuId":7003013,"published":true}]'::jsonb) ON CONFLICT (id) DO NOTHING;
