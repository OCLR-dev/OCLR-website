ALTER TABLE "archive_rel_archive_pools_maps" ADD COLUMN "value_source_title" text;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps" ADD COLUMN "value_hp" double precision;--> statement-breakpoint
-- Exact S2 NM2 recovery from the organizer's reviewed official OSZ (#852).
DO $$
DECLARE
  state record;
  hit record;
  recovered jsonb;
  corrected jsonb;
  field text;
  matches integer := 0;
  attributes jsonb := $attributes${"title":"Reol - Yakusoku no Ao [NiNo's Extra]","mapper":"Fatfan Kolek","stars":5.67,"bpm":240,"drainSeconds":232,"cs":4,"ar":9.3,"od":8.3,"hp":5.5}$attributes$::jsonb;
BEGIN
  SELECT * INTO state FROM public.edition_state
  WHERE slug='s2' AND jsonb_typeof(configuration->'archive')='object'
    AND configuration->'archive'->>'editionSlug'='s2' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF state.configuration->>'status' IS DISTINCT FROM 'completed'
     OR coalesce(state.configuration->'registration','null'::jsonb) <> 'null'::jsonb THEN
    RAISE EXCEPTION 'S2 NM2 recovery requires a completed historical archive';
  END IF;
  corrected := state.configuration;
  FOR hit IN
    SELECT p.position-1 AS pool_index, m.position-1 AS map_index, m.value AS map
    FROM jsonb_array_elements(state.configuration->'archive'->'pools') WITH ORDINALITY p(value,position)
    CROSS JOIN LATERAL jsonb_array_elements(p.value->'maps') WITH ORDINALITY m(value,position)
    WHERE p.value->>'id'='captain-qualifier' AND m.value->>'slot'='NM2'
      AND m.value->'beatmapId'='1009329'::jsonb
  LOOP
    matches := matches+1;
    IF matches > 1 THEN RAISE EXCEPTION 'Duplicate S2 NM2 recovery target'; END IF;
    IF (hit.map->'beatmapSetId' IS NOT NULL AND hit.map->'beatmapSetId' NOT IN ('null'::jsonb,'403096'::jsonb))
       OR (hit.map->'coverPath' IS NOT NULL AND hit.map->'coverPath' NOT IN ('null'::jsonb,'"/archive/beatmaps/1009329/cover.jpg"'::jsonb)) THEN
      RAISE EXCEPTION 'Conflicting saved S2 NM2 artwork; review before updating';
    END IF;
    recovered := hit.map || '{"beatmapSetId":403096,"coverPath":"/archive/beatmaps/1009329/cover.jpg"}'::jsonb;
    FOREACH field IN ARRAY ARRAY['title','mapper'] LOOP
      IF recovered->field IS NULL OR recovered->field='null'::jsonb
         OR btrim(recovered->>field)=''
         OR upper(btrim(recovered->>field)) IN ('#N/A','N/A','#REF!','#VALUE!','#ERROR!','#NAME?','#DIV/0!') THEN
        -- The old title participates in statisticsArchiveKey. Keep it verbatim
        -- so recovering display metadata does not invalidate approved results.
        IF field='title' AND NOT (recovered ? 'sourceTitle') THEN
          recovered := recovered || jsonb_build_object('sourceTitle',coalesce(recovered->'title','null'::jsonb));
        END IF;
        recovered := jsonb_set(recovered,ARRAY[field],attributes->field,true);
      END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['stars','bpm','drainSeconds','cs','ar','od','hp'] LOOP
      IF recovered->field IS NULL OR recovered->field='null'::jsonb THEN
        recovered := jsonb_set(recovered,ARRAY[field],attributes->field,true);
      END IF;
    END LOOP;
    corrected := jsonb_set(corrected,ARRAY['archive','pools',hit.pool_index::text,'maps',hit.map_index::text],recovered);
  END LOOP;
  IF corrected = state.configuration THEN RETURN; END IF;
  INSERT INTO public.edition_revisions(edition_slug,version,configuration)
  VALUES('s2',state.configuration_version,state.configuration) ON CONFLICT DO NOTHING;
  INSERT INTO public.edition_revisions(edition_slug,version,configuration)
  VALUES('s2',state.configuration_version+1,corrected);
  UPDATE public.edition_state SET configuration=corrected,
    configuration_version=state.configuration_version+1,configuration_updated_at=now() WHERE slug='s2';
  INSERT INTO public.edition_events(edition_slug,kind,detail) VALUES('s2','archive_map_file_recovery',jsonb_build_object(
    'issue',852,'poolId','captain-qualifier','slot','NM2','beatmapId',1009329,
    'fromRevision',state.configuration_version,'toRevision',state.configuration_version+1,
    'packageSha256','c98304139ab47c9bde13a77ace1af547900e9fbaab32941b13e8a86d4417e1ad',
    'beatmapMd5','256a8a9df9a06d924d1578357ad56840',
    'backgroundSha256','9379c2b120c56eb811a674265c7f43cd0a1c8c0df113707547bcb1b218c1ef45',
    'source','https://github.com/OCLR-dev/OCLR-website/blob/8e8416c3003795665b148208f6ecd94137ed812a/docs/imports/beatmaps/403096.osz',
    'historicalSource','Organizer supplied #852: 5.67 stars, 240 BPM, 232 seconds drain; 2026-11-06'));
  -- Existing source-manifest triggers invalidate stale typed/cache heads.
  -- Normalize s2 after applying the reviewed release.
END;
$$;
