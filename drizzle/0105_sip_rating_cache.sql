CREATE TABLE "sip_rating_cache" (
	"osu_id" bigint PRIMARY KEY NOT NULL,
	"value" double precision,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sip_rating_cache" ADD CONSTRAINT "sip_rating_cache_osu_id_users_osu_id_fk" FOREIGN KEY ("osu_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;