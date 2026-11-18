CREATE TABLE "liru_daily_gacha" (
	"osu_id" bigint NOT NULL,
	"day" date NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drawn_at" timestamp with time zone,
	"cards" jsonb,
	CONSTRAINT "liru_daily_gacha_osu_id_day_pk" PRIMARY KEY("osu_id","day"),
	CONSTRAINT "liru_daily_gacha_draw_receipt" CHECK (CASE WHEN "liru_daily_gacha"."cards" IS NULL THEN "liru_daily_gacha"."drawn_at" IS NULL
          WHEN jsonb_typeof("liru_daily_gacha"."cards") = 'array' THEN
            "liru_daily_gacha"."drawn_at" IS NOT NULL AND jsonb_array_length("liru_daily_gacha"."cards") = 10
            AND COALESCE("liru_daily_gacha"."cards"->9->>'rarity' IN ('UR', 'SSR', 'SR'), FALSE)
          ELSE FALSE END)
);
--> statement-breakpoint
ALTER TABLE "liru_daily_gacha" ADD CONSTRAINT "liru_daily_gacha_osu_id_users_osu_id_fk" FOREIGN KEY ("osu_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;