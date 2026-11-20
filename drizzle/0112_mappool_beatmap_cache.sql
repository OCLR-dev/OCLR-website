CREATE TABLE "mappool_beatmap_cache" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"file_key" uuid NOT NULL,
	"beatmap_md5" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"source" text NOT NULL,
	"cached_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mappool_beatmap_cache_file_key_unique" UNIQUE("file_key")
);
--> statement-breakpoint
ALTER TABLE "mappool_beatmap_cache" ADD CONSTRAINT "mappool_beatmap_cache_entry_id_mappool_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."mappool_entries"("id") ON DELETE cascade ON UPDATE no action;