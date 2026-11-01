CREATE TABLE "fixture_commentators" (
	"fixture_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"source" text NOT NULL,
	"assigned_by" bigint NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_scheduled_at" timestamp with time zone,
	"confirmed_time_zone" text NOT NULL,
	CONSTRAINT "fixture_commentators_fixture_id_user_id_pk" PRIMARY KEY("fixture_id","user_id"),
	CONSTRAINT "fixture_commentators_source" CHECK ("fixture_commentators"."source" IN ('self', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "fixture_commentators" ADD CONSTRAINT "fixture_commentators_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_commentators" ADD CONSTRAINT "fixture_commentators_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_commentators" ADD CONSTRAINT "fixture_commentators_assigned_by_users_osu_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("osu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixture_commentators_user_idx" ON "fixture_commentators" USING btree ("user_id");