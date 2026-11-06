-- Organizer-confirmed sources from #852. Patch only originalId, never the
-- historical BID, recorded attributes, MP evidence, results or publication.
DO $$
DECLARE
  state record;
  target record;
  hit record;
  corrected_configuration jsonb;
  changes jsonb;
  matches integer;
BEGIN
  FOR state IN
    SELECT * FROM public.edition_state
    WHERE slug IN ('s5', 's10') AND jsonb_typeof(configuration->'archive') = 'object'
    ORDER BY slug FOR UPDATE
  LOOP
    IF state.configuration->>'status' IS DISTINCT FROM 'completed'
       OR state.configuration->'registration' NOT IN ('null'::jsonb)
       OR state.configuration->'archive'->>'editionSlug' IS DISTINCT FROM state.slug THEN
      RAISE EXCEPTION 'Original-map correction requires a completed historical archive: %', state.slug;
    END IF;
    corrected_configuration := state.configuration;
    changes := '[]'::jsonb;
    FOR target IN
      SELECT * FROM (VALUES
        ('s5', 'pool-4', 'NM4', 2756449, 2755377),
        ('s10', 'gs1', 'NM6', 5015295, 4000824),
        ('s10', 'gs2', 'NM4', 5036455, 4934310),
        ('s10', 'gs2', 'DT4', 5033877, 1571394),
        ('s10', 'f', 'NM7', 4769379, 5206595)
      ) AS sources(slug, pool_id, slot, beatmap_id, original_id)
      WHERE slug = state.slug
    LOOP
      matches := 0;
      FOR hit IN
        SELECT p.position - 1 AS pool_index, m.position - 1 AS map_index, m.value AS map
        FROM jsonb_array_elements(corrected_configuration->'archive'->'pools') WITH ORDINALITY AS p(value, position)
        CROSS JOIN LATERAL jsonb_array_elements(p.value->'maps') WITH ORDINALITY AS m(value, position)
        WHERE p.value->>'id' = target.pool_id AND m.value->>'slot' = target.slot
          AND m.value->'beatmapId' = to_jsonb(target.beatmap_id)
      LOOP
        matches := matches + 1;
        IF matches > 1 THEN
          RAISE EXCEPTION 'Duplicate original-map correction target: %/%/%', state.slug, target.pool_id, target.slot;
        END IF;
        IF hit.map->'originalId' = to_jsonb(target.original_id) THEN
          CONTINUE;
        END IF;
        IF hit.map->'originalId' IS NOT NULL AND hit.map->'originalId' <> 'null'::jsonb THEN
          RAISE EXCEPTION 'Conflicting originalId; review saved source before updating: %/%/%', state.slug, target.pool_id, target.slot;
        END IF;
        corrected_configuration := jsonb_set(corrected_configuration,
          ARRAY['archive', 'pools', hit.pool_index::text, 'maps', hit.map_index::text, 'originalId'],
          to_jsonb(target.original_id), true);
        changes := changes || jsonb_build_array(jsonb_build_object(
          'poolId', target.pool_id, 'slot', target.slot,
          'beatmapId', target.beatmap_id, 'originalId', target.original_id));
      END LOOP;
    END LOOP;
    IF jsonb_array_length(changes) = 0 THEN
      CONTINUE;
    END IF;
    -- Retain the exact old JSONB and one new revision per changed edition.
    INSERT INTO public.edition_revisions(edition_slug, version, configuration)
    VALUES(state.slug, state.configuration_version, state.configuration)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.edition_revisions(edition_slug, version, configuration)
    VALUES(state.slug, state.configuration_version + 1, corrected_configuration);
    UPDATE public.edition_state SET configuration = corrected_configuration,
      configuration_version = state.configuration_version + 1,
      configuration_updated_at = now()
    WHERE slug = state.slug;
    INSERT INTO public.edition_events(edition_slug, kind, detail)
    VALUES(state.slug, 'archive_map_sources_correction', jsonb_build_object(
      'issue', 852, 'fromRevision', state.configuration_version,
      'toRevision', state.configuration_version + 1, 'changes', changes));
    -- The configuration trigger invalidates the old relation/cache digest.
    -- Reads safely use the corrected source until the existing normalization
    -- command creates a new immutable typed document; keep old evidence intact.
  END LOOP;
END;
$$;
