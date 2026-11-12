CREATE TABLE "imported_player_ratings" (
	"edition_slug" text NOT NULL,
	"user_id" bigint NOT NULL,
	"source" text NOT NULL,
	"value" double precision NOT NULL,
	"provisional" boolean DEFAULT false NOT NULL,
	"outdated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "imported_player_ratings_edition_slug_source_user_id_pk" PRIMARY KEY("edition_slug","source","user_id"),
	CONSTRAINT "imported_player_ratings_source" CHECK ("imported_player_ratings"."source" IN ('sip', 'etx')),
	CONSTRAINT "imported_player_ratings_value" CHECK ("imported_player_ratings"."value" > '-Infinity'::float8 AND "imported_player_ratings"."value" < 'Infinity'::float8 AND ("imported_player_ratings"."source" = 'sip' OR "imported_player_ratings"."value" >= 0))
);
--> statement-breakpoint
ALTER TABLE "imported_player_ratings" ADD CONSTRAINT "imported_player_ratings_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_player_ratings" ADD CONSTRAINT "imported_player_ratings_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;