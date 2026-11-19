CREATE TABLE "tournament_player_reactions" (
	"edition_slug" text NOT NULL,
	"player_id" bigint NOT NULL,
	"emoji_id" text NOT NULL,
	"author_id" bigint NOT NULL,
	CONSTRAINT "tournament_player_reactions_pk" PRIMARY KEY("edition_slug","player_id","emoji_id","author_id")
);
--> statement-breakpoint
ALTER TABLE "tournament_player_reactions" ADD CONSTRAINT "tournament_player_reactions_author_id_users_osu_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_player_reactions" ADD CONSTRAINT "tournament_player_reactions_registration_fk" FOREIGN KEY ("edition_slug","player_id") REFERENCES "public"."registrations"("edition_slug","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_player_reactions_author_idx" ON "tournament_player_reactions" USING btree ("author_id");