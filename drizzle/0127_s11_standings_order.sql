-- Correct the published S11 ordering without changing point values or match results.
WITH previous AS (
  SELECT r.*
  FROM tournament_rounds AS r
  JOIN tournament_stages AS s ON s.id = r.stage_id
  WHERE r.edition_slug = 's11'
    AND s.kind = 'group'
    AND r.standings_rules->'tiebreakers' = '["points", "maps_won", "map_difference"]'::jsonb
  FOR UPDATE OF r
),
updated AS (
  UPDATE tournament_rounds AS r
  SET standings_rules = r.standings_rules || jsonb_build_object(
        'version', 's11-net-maps-' || r.id::text,
        'tiebreakers', '["points", "map_difference", "maps_won"]'::jsonb
      ),
      version = r.version + 1
  FROM previous AS p
  WHERE p.id = r.id
  RETURNING r.id, r.edition_slug, r.standings_rules, r.version
)
INSERT INTO edition_events (edition_slug, kind, detail)
SELECT u.edition_slug, 'competition_round_rules', jsonb_build_object(
  'source', '0127_s11_standings_order',
  'entity', jsonb_build_object('type', 'tournament_round', 'id', u.id),
  'before', jsonb_build_object('standingsRules', p.standings_rules, 'version', p.version),
  'after', jsonb_build_object('standingsRules', u.standings_rules, 'version', u.version)
)
FROM updated AS u
JOIN previous AS p ON p.id = u.id;
