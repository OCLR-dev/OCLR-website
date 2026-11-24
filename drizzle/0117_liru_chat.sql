CREATE TABLE "chat_rule_indexes" (
	"edition_slug" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"sections" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "chat_return_edition" text;--> statement-breakpoint
ALTER TABLE "chat_rule_indexes" ADD CONSTRAINT "chat_rule_indexes_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE cascade ON UPDATE no action;