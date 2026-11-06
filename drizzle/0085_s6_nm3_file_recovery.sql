ALTER TABLE "archive_rel_archive_pools_maps" ADD COLUMN "value_beatmap_set_id" bigint;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps" ADD COLUMN "value_cover_path" text;
--> statement-breakpoint
-- Exact difficulty/background recovered from the organizer's reviewed OSZ (#852).
-- Preserve historical identity, recorded attributes, approvals and MP statistics.
DO $$
DECLARE
  state record;
  hit record;
  recovered jsonb;
  corrected jsonb;
  field text;
  matches integer := 0;
  provenance text := 'https://github.com/OCLR-dev/OCLR-website/blob/ecef7c74bc10f845c86a4166a612f885a22ae0ee/docs/imports/beatmaps/2314568.osz; MD5 e473fac1d442477700a83edf208eb966';
BEGIN
  SELECT * INTO state FROM public.edition_state
  WHERE slug='s6' AND jsonb_typeof(configuration->'archive')='object' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF state.configuration->>'status' IS DISTINCT FROM 'completed'
     OR coalesce(state.configuration->'registration','null'::jsonb) <> 'null'::jsonb
     OR state.configuration->'archive'->>'editionSlug' IS DISTINCT FROM 's6' THEN
    RAISE EXCEPTION 'S6 NM3 recovery requires a completed historical archive';
  END IF;
  corrected := state.configuration;
  FOR hit IN
    SELECT p.position-1 AS pool_index, m.position-1 AS map_index, m.value AS map
    FROM jsonb_array_elements(state.configuration->'archive'->'pools') WITH ORDINALITY p(value,position)
    CROSS JOIN LATERAL jsonb_array_elements(p.value->'maps') WITH ORDINALITY m(value,position)
    WHERE p.value->>'id'='captain-qualifier' AND m.value->>'slot'='NM3'
      AND m.value->'beatmapId'='2314568'::jsonb
  LOOP
    matches := matches+1;
    IF matches > 1 THEN RAISE EXCEPTION 'Duplicate S6 NM3 recovery target'; END IF;
    IF (hit.map->'beatmapSetId' IS NOT NULL AND hit.map->'beatmapSetId' NOT IN ('null'::jsonb,'1034526'::jsonb))
       OR (hit.map->'coverPath' IS NOT NULL AND hit.map->'coverPath' NOT IN ('null'::jsonb,'"/archive/beatmaps/2314568/cover.jpg"'::jsonb)) THEN
      RAISE EXCEPTION 'Conflicting saved S6 NM3 artwork; review before updating';
    END IF;
    recovered := hit.map || '{"beatmapSetId":1034526,"coverPath":"/archive/beatmaps/2314568/cover.jpg"}'::jsonb;
    FOREACH field IN ARRAY ARRAY['cs','ar','od'] LOOP
      IF recovered->field IS NULL OR recovered->field='null'::jsonb THEN
        recovered := jsonb_set(recovered,ARRAY[field],'{"cs":4,"ar":9.5,"od":9.1}'::jsonb->field,true);
      END IF;
    END LOOP;
    corrected := jsonb_set(corrected,ARRAY['archive','pools',hit.pool_index::text,'maps',hit.map_index::text],recovered);
  END LOOP;
  IF corrected = state.configuration THEN RETURN; END IF;
  INSERT INTO public.edition_revisions(edition_slug,version,configuration)
  VALUES('s6',state.configuration_version,state.configuration) ON CONFLICT DO NOTHING;
  INSERT INTO public.edition_revisions(edition_slug,version,configuration)
  VALUES('s6',state.configuration_version+1,corrected);
  UPDATE public.edition_state SET configuration=corrected,
    configuration_version=state.configuration_version+1,configuration_updated_at=now() WHERE slug='s6';
  INSERT INTO public.edition_events(edition_slug,kind,detail) VALUES('s6','archive_map_file_recovery',jsonb_build_object(
    'issue',852,'poolId','captain-qualifier','slot','NM3','beatmapId',2314568,
    'fromRevision',state.configuration_version,'toRevision',state.configuration_version+1,
    'packageSha256','700df144c44ff92299e9284c26422621f5b1f55becb64abc3ffee9e076416b71',
    'beatmapMd5','e473fac1d442477700a83edf208eb966', 'source',provenance));
  -- The existing source-manifest trigger invalidates stale relation/cache heads.
  -- Keep immutable documents/history, then use db:normalize-archives -- s6 --apply --verify.
END;
$$;
