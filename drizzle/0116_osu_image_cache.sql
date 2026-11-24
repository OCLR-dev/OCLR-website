CREATE TABLE "osu_cached_images" (
	"variant" text NOT NULL,
	"image_id" integer NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"etag" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "osu_cached_images_variant_image_id_pk" PRIMARY KEY("variant","image_id")
);
--> statement-breakpoint
CREATE TABLE "osu_image_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"operation" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "osu_image_policies" (
	"kind" text PRIMARY KEY NOT NULL,
	"ttl_hours" integer NOT NULL,
	"capacity_mib" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "osu_cached_images" ADD CONSTRAINT "osu_cached_images_kind_osu_image_policies_kind_fk" FOREIGN KEY ("kind") REFERENCES "public"."osu_image_policies"("kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "osu_image_events" ADD CONSTRAINT "osu_image_events_actor_id_users_osu_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "osu_images_eviction_idx" ON "osu_cached_images" USING btree ("kind","fetched_at");
--> statement-breakpoint
INSERT INTO "osu_image_policies" ("kind", "ttl_hours", "capacity_mib")
VALUES ('avatar', 24, 64), ('background', 168, 256);
