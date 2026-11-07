CREATE TABLE "beatmap_difficulty_snapshots" (
	"beatmap_id" bigint PRIMARY KEY NOT NULL,
	"snapshot" jsonb,
	"retry_at" timestamp with time zone,
	CONSTRAINT "beatmap_difficulty_positive_id" CHECK ("beatmap_difficulty_snapshots"."beatmap_id" > 0)
);
