CREATE TABLE "mappool_entry_suggesters" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"osu_id" bigint NOT NULL,
	"username" text NOT NULL,
	"candidate_id" uuid
);
--> statement-breakpoint
ALTER TABLE "mappool_entry_suggesters" ADD CONSTRAINT "mappool_entry_suggesters_entry_id_mappool_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."mappool_entries"("id") ON DELETE cascade ON UPDATE no action;