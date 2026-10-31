ALTER TABLE "referee_irc_commands" ADD COLUMN "automation" jsonb;--> statement-breakpoint
ALTER TABLE "referee_irc_connections" ADD COLUMN "bp_sync" boolean DEFAULT false NOT NULL;