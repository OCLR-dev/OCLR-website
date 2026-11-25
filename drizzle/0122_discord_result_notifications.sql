CREATE TABLE "discord_result_deliveries" (
	"edition_slug" text NOT NULL,
	"fixture_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"result_version" integer NOT NULL,
	"published_revision" integer,
	"message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_result_deliveries_fixture_id_destination_id_pk" PRIMARY KEY("fixture_id","destination_id"),
	CONSTRAINT "discord_result_deliveries_revision" CHECK (
      "discord_result_deliveries"."result_version" > 0 AND ("discord_result_deliveries"."published_revision" IS NULL OR "discord_result_deliveries"."published_revision" > 0)
    ),
	CONSTRAINT "discord_result_deliveries_lease" CHECK (
      ("discord_result_deliveries"."lease_id" IS NULL) = ("discord_result_deliveries"."lease_expires_at" IS NULL)
      AND ("discord_result_deliveries"."status" = 'sending') = ("discord_result_deliveries"."lease_id" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "discord_result_settings" (
	"edition_slug" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"destination_id" uuid,
	"sealed_url" text,
	"enabled" boolean NOT NULL,
	"locale" text NOT NULL,
	CONSTRAINT "discord_result_settings_revision" CHECK ("discord_result_settings"."revision" > 0),
	CONSTRAINT "discord_result_settings_locale" CHECK ("discord_result_settings"."locale" IN ('en', 'zh-Hans', 'zh-Hant')),
	CONSTRAINT "discord_result_settings_credentials" CHECK (
      ("discord_result_settings"."destination_id" IS NULL) = ("discord_result_settings"."sealed_url" IS NULL)
      AND (NOT "discord_result_settings"."enabled" OR "discord_result_settings"."sealed_url" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "discord_result_deliveries" ADD CONSTRAINT "discord_result_deliveries_fixture_id_edition_slug_fixtures_id_edition_slug_fk" FOREIGN KEY ("fixture_id","edition_slug") REFERENCES "public"."fixtures"("id","edition_slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_result_settings" ADD CONSTRAINT "discord_result_settings_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_result_deliveries_ready_idx" ON "discord_result_deliveries" USING btree ("next_attempt_at") WHERE "discord_result_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "discord_result_deliveries_lease_idx" ON "discord_result_deliveries" USING btree ("lease_expires_at") WHERE "discord_result_deliveries"."status" = 'sending';--> statement-breakpoint
CREATE INDEX "discord_result_deliveries_edition_idx" ON "discord_result_deliveries" USING btree ("edition_slug","updated_at");