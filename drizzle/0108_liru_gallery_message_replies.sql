ALTER TABLE "liru_gallery_message_events" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "liru_gallery_messages" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "liru_gallery_messages" ADD CONSTRAINT "liru_gallery_messages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."liru_gallery_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "liru_gallery_messages_parent_idx" ON "liru_gallery_messages" USING btree ("parent_id");