CREATE TABLE "liru_gallery_message_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" bigint,
	"message_id" uuid NOT NULL,
	"request_id" uuid,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liru_gallery_message_request_unique" UNIQUE("author_id","request_id"),
	CONSTRAINT "liru_gallery_message_event_kind" CHECK (("liru_gallery_message_events"."kind" = 'posted' AND "liru_gallery_message_events"."request_id" IS NOT NULL) OR ("liru_gallery_message_events"."kind" IN ('edited', 'deleted') AND "liru_gallery_message_events"."request_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "liru_gallery_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" bigint NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liru_gallery_messages_body_length" CHECK (char_length(btrim("liru_gallery_messages"."body")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "liru_gallery_message_events" ADD CONSTRAINT "liru_gallery_message_events_author_id_users_osu_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("osu_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liru_gallery_messages" ADD CONSTRAINT "liru_gallery_messages_author_id_users_osu_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "liru_gallery_message_activity_idx" ON "liru_gallery_message_events" USING btree ("author_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "liru_gallery_messages_recent_idx" ON "liru_gallery_messages" USING btree ("created_at","id");