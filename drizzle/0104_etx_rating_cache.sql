CREATE TABLE "etx_rating_cache" (
	"osu_id" bigint PRIMARY KEY NOT NULL,
	"rating" jsonb,
	"attempted_on" date NOT NULL,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "etx_rating_cache" ADD CONSTRAINT "etx_rating_cache_osu_id_users_osu_id_fk" FOREIGN KEY ("osu_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;