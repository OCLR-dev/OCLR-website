ALTER TABLE "chat_prompt_events" ADD COLUMN "before_max_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "chat_prompt_events" ADD COLUMN "after_max_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "chat_prompt_settings" ADD COLUMN "max_output_tokens" integer DEFAULT 2048 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_prompt_settings" ADD CONSTRAINT "chat_prompt_settings_output_limit" CHECK ("chat_prompt_settings"."max_output_tokens" between 1 and 16384);