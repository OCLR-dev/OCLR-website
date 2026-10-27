CREATE TABLE "player_names" (
	"osu_id" bigint NOT NULL,
	"username" text NOT NULL,
	"source" text NOT NULL,
	"edition_slug" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
  "published" boolean DEFAULT false NOT NULL,
	"first_observed_at" timestamp with time zone,
	"last_observed_at" timestamp with time zone,
	CONSTRAINT "player_names_osu_id_username_source_edition_slug_reference_pk" PRIMARY KEY("osu_id","username","source","edition_slug","reference"),
	CONSTRAINT "player_names_uid" CHECK ("player_names"."osu_id" > 0 AND "player_names"."osu_id" <= 9007199254740991),
	CONSTRAINT "player_names_username" CHECK (length("player_names"."username") BETWEEN 1 AND 300),
	CONSTRAINT "player_names_source" CHECK ("player_names"."source" IN ('account', 'osu_current', 'osu_previous', 'archive_player', 'archive_staff', 'archive_replacement'))
);
--> statement-breakpoint
CREATE INDEX "player_names_search_idx" ON "player_names" USING btree (lower("username"));
--> statement-breakpoint
-- Source evidence is append-only, independent of OAuth accounts. Timestamps
-- describe observations; no rename date is inferred from a competition date.
CREATE FUNCTION oclr_observe_name(uid bigint, name text, origin text, edition text, evidence text, observed timestamptz, released boolean DEFAULT false)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO player_names(osu_id, username, source, edition_slug, reference, first_observed_at, last_observed_at, published)
  SELECT uid, name, origin, edition, evidence, observed, observed, released
  WHERE uid > 0 AND uid <= 9007199254740991 AND length(name) BETWEEN 1 AND 300
  ON CONFLICT (osu_id, username, source, edition_slug, reference) DO UPDATE SET
    first_observed_at = least(player_names.first_observed_at, excluded.first_observed_at),
    last_observed_at = greatest(player_names.last_observed_at, excluded.last_observed_at),
    published = player_names.published OR excluded.published;
$$;
--> statement-breakpoint
CREATE FUNCTION oclr_observe_profile(uid bigint, mode text, profile jsonb, observed timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE name text; observation timestamptz := observed;
BEGIN
  IF profile IS NULL OR profile->>'osuId' IS DISTINCT FROM uid::text OR profile->>'ruleset' IS DISTINCT FROM mode
     OR profile->>'source' IS DISTINCT FROM 'osu! API v2' OR jsonb_typeof(profile->'username') IS DISTINCT FROM 'string' THEN RETURN; END IF;
  -- A validated cache fetch timestamp is actual available observation evidence.
  -- It is not a rename date. Invalid/missing legacy timestamps remain unknown.
  IF observation IS NULL AND coalesce(profile->>'fetchedAt','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    BEGIN
      observation := (profile->>'fetchedAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      observation := NULL;
    END;
  END IF;
  PERFORM oclr_observe_name(uid, profile->>'username', 'osu_current', '', mode, observation, true);
  FOR name IN SELECT value #>> '{}' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(profile->'previousUsernames') = 'array' THEN profile->'previousUsernames' ELSE '[]'::jsonb END) WHERE jsonb_typeof(value) = 'string' LOOP
    PERFORM oclr_observe_name(uid, name, 'osu_previous', '', mode, observation, true);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION oclr_observe_archive(edition text, archive jsonb, observed timestamptz, released boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE person jsonb; replacement jsonb; origin text;
BEGIN
  FOREACH origin IN ARRAY ARRAY['player','staff'] LOOP
    FOR person IN SELECT jsonb_array_elements(coalesce(archive->(CASE WHEN origin = 'player' THEN 'players' ELSE 'staff' END), '[]'::jsonb)) LOOP
      IF person->>'osuId' ~ '^[1-9][0-9]{0,15}$' THEN
        PERFORM oclr_observe_name((person->>'osuId')::bigint, person->>'username', 'archive_' || origin, edition, coalesce(person->>'source',''), observed, released);
      END IF;
    END LOOP;
  END LOOP;
  FOR replacement IN SELECT jsonb_array_elements(coalesce(archive->'rosterReplacements', '[]'::jsonb)) LOOP
    FOR person IN SELECT jsonb_array_elements(replacement->'people') LOOP
      IF person->>'osuId' ~ '^[1-9][0-9]{0,15}$' THEN
        PERFORM oclr_observe_name((person->>'osuId')::bigint, person->>'username', 'archive_replacement', edition, coalesce(person->>'source',''), observed, released);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION oclr_capture_identity_names() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF TG_OP = 'UPDATE' THEN
      PERFORM oclr_observe_name(OLD.osu_id, OLD.username, 'account', '', '', NULL);
    END IF;
    PERFORM oclr_observe_name(NEW.osu_id, NEW.username, 'account', '', '', clock_timestamp());
  ELSIF TG_TABLE_NAME = 'user_profile_cache' THEN
    IF TG_OP = 'UPDATE' THEN
      PERFORM oclr_observe_profile(OLD.osu_id, OLD.mode, OLD.profile, NULL);
    END IF;
    PERFORM oclr_observe_profile(NEW.osu_id, NEW.mode, NEW.profile, clock_timestamp());
  ELSE
    PERFORM oclr_observe_archive(NEW.slug, NEW.configuration->'archive', clock_timestamp(), coalesce(NEW.configuration->>'published' = 'true', false));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_capture_names AFTER INSERT OR UPDATE OF username ON users FOR EACH ROW EXECUTE FUNCTION oclr_capture_identity_names();
CREATE TRIGGER profiles_capture_names AFTER INSERT OR UPDATE OF profile ON user_profile_cache FOR EACH ROW EXECUTE FUNCTION oclr_capture_identity_names();
CREATE TRIGGER archives_capture_names AFTER INSERT OR UPDATE OF configuration ON edition_state FOR EACH ROW EXECUTE FUNCTION oclr_capture_identity_names();
--> statement-breakpoint
-- Re-entrant backfill: provider fetchedAt is an observation, never a rename date.
SELECT oclr_observe_name(osu_id, username, 'account', '', '', NULL) FROM users;
SELECT oclr_observe_profile(osu_id, mode, profile, NULL) FROM user_profile_cache;
SELECT oclr_observe_archive(slug, configuration->'archive', NULL, coalesce(configuration->>'published' = 'true', false)) FROM edition_state;
SELECT oclr_observe_archive(edition_slug, configuration->'archive', NULL, coalesce(configuration->>'published' = 'true', false)) FROM edition_revisions;
