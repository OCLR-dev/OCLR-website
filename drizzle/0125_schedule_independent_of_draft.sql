-- Keep schedule requests eligible when the draft locks its structure.
CREATE OR REPLACE FUNCTION invalidate_schedule_requests() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'fixtures' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE fixture_id=OLD.id AND status IN ('waiting','pending');
      RETURN OLD;
    END IF;
    IF ROW(OLD.scheduled_at,OLD.time_zone,OLD.home_team_id,OLD.away_team_id,OLD.home_source_id,OLD.away_source_id,OLD.home_source_outcome,OLD.away_source_outcome,OLD.published_at,OLD.status,OLD.round_id) IS DISTINCT FROM ROW(NEW.scheduled_at,NEW.time_zone,NEW.home_team_id,NEW.away_team_id,NEW.home_source_id,NEW.away_source_id,NEW.home_source_outcome,NEW.away_source_outcome,NEW.published_at,NEW.status,NEW.round_id) THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE fixture_id=NEW.id AND status IN ('waiting','pending');
    END IF;
  ELSIF TG_TABLE_NAME = 'edition_state' THEN
    IF NEW.configuration->>'status'='completed' OR NOT coalesce((NEW.configuration->>'published')::boolean,false) OR NEW.configuration->'archive' IS NOT NULL AND NEW.configuration->'archive' <> 'null'::jsonb THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=NEW.slug AND status IN ('waiting','pending');
    END IF;
  ELSIF TG_TABLE_NAME = 'teams' THEN
    IF OLD.captain_id IS DISTINCT FROM NEW.captain_id OR NEW.archived_at IS NOT NULL OR NOT NEW.identity_published OR NOT NEW.roster_published OR NEW.finalized_at IS NULL THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=OLD.edition_slug AND (basis->>'homeTeamId'=OLD.id::text OR basis->>'awayTeamId'=OLD.id::text) AND status IN ('waiting','pending');
    END IF;
  ELSIF TG_TABLE_NAME = 'captains' THEN
    IF TG_OP = 'UPDATE' AND NEW.user_id=OLD.user_id AND NEW.edition_slug=OLD.edition_slug AND NEW.published THEN RETURN NEW; END IF;
    UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=OLD.edition_slug AND (basis->>'homeCaptainId'=OLD.user_id::text OR basis->>'awayCaptainId'=OLD.user_id::text) AND status IN ('waiting','pending');
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'memberships' THEN
    IF TG_OP='DELETE' OR NEW.left_at IS NOT NULL THEN
      UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE edition_slug=OLD.edition_slug AND (basis->>'homeCaptainId'=OLD.user_id::text OR basis->>'awayCaptainId'=OLD.user_id::text) AND status IN ('waiting','pending');
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  ELSE
    WITH RECURSIVE affected(id) AS (SELECT NEW.fixture_id UNION SELECT f.id FROM fixtures f JOIN affected a ON f.home_source_id=a.id OR f.away_source_id=a.id)
    UPDATE schedule_requests SET status='expired',version=version+1,updated_at=now() WHERE fixture_id IN (SELECT id FROM affected) AND status IN ('waiting','pending');
  END IF;
  RETURN NEW;
END $$;
