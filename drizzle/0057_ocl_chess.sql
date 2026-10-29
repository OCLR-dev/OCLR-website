CREATE TABLE "chess_boards" (
	"id" integer PRIMARY KEY NOT NULL,
	"pixels" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "chess_board_singleton" CHECK ("chess_boards"."id" = 1),
	CONSTRAINT "chess_pixels_valid" CHECK (length("chess_boards"."pixels") = 16384 AND "chess_boards"."pixels" ~ '^[0-9a-f]+$')
);
--> statement-breakpoint
CREATE TABLE "chess_events" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" bigint NOT NULL,
	"command" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chess_events_revision_unique" UNIQUE("revision")
);
--> statement-breakpoint
CREATE TABLE "chess_players" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"next_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chess_events" ADD CONSTRAINT "chess_events_actor_id_users_osu_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chess_players" ADD CONSTRAINT "chess_players_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO chess_boards (id, pixels) VALUES (1, repeat('0', 16384));
