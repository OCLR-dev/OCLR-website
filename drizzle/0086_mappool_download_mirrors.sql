ALTER TABLE "mappool_entries" ADD COLUMN "download_mirror" text;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps" ADD COLUMN "value_download_mirror" text;
--> statement-breakpoint
-- Organizer-supplied official packages for two historical slots (#852).
-- No changes to identity, publication, recorded attributes or match statistics.
DO $$
DECLARE
  target jsonb;
  state record;
  hit record;
  corrected jsonb;
  recovered jsonb;
  matches integer;
BEGIN
  FOR target IN SELECT value FROM jsonb_array_elements($downloads$
[
  {
    "editionSlug": "s2",
    "poolId": "captain-qualifier",
    "slot": "NM2",
    "beatmapId": 1009329,
    "beatmapSetId": 403096,
    "downloadMirror": "https://github.com/OCLR-dev/OCLR-website/raw/8e8416c3003795665b148208f6ecd94137ed812a/docs/imports/beatmaps/403096.osz",
    "packagePath": "docs/imports/beatmaps/403096.osz",
    "packageSha256": "c98304139ab47c9bde13a77ace1af547900e9fbaab32941b13e8a86d4417e1ad",
    "beatmapFile": "Reol - Yakusoku no Ao (Fatfan Kolek) [NiNo's Extra].osu",
    "beatmapMd5": "256a8a9df9a06d924d1578357ad56840"
  },
  {
    "editionSlug": "s6",
    "poolId": "captain-qualifier",
    "slot": "NM3",
    "beatmapId": 2314568,
    "beatmapSetId": 1034526,
    "downloadMirror": "https://github.com/OCLR-dev/OCLR-website/raw/8e8416c3003795665b148208f6ecd94137ed812a/docs/imports/beatmaps/1034526.osz",
    "packagePath": "docs/imports/beatmaps/1034526.osz",
    "packageSha256": "77b67ed47821a8463f8820da2b57d6274d41203b4e721ace368cb89876e3f96f",
    "beatmapFile": "ELFENSJoN - Hyousou wa Hakuen o Matoite (HeTo) [Dailycare's Extra].osu",
    "beatmapMd5": "e473fac1d442477700a83edf208eb966"
  }
]
$downloads$::jsonb)
  LOOP
    SELECT * INTO state FROM public.edition_state
    WHERE slug=target->>'editionSlug' AND jsonb_typeof(configuration->'archive')='object' FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF state.configuration->>'status' IS DISTINCT FROM 'completed'
       OR coalesce(state.configuration->'registration','null'::jsonb) <> 'null'::jsonb
       OR state.configuration->'archive'->>'editionSlug' IS DISTINCT FROM target->>'editionSlug' THEN
      RAISE EXCEPTION 'Download mirrors require a completed historical archive';
    END IF;
    corrected := state.configuration;
    matches := 0;
    FOR hit IN
      SELECT p.position-1 AS pool_index, m.position-1 AS map_index, m.value AS map
      FROM jsonb_array_elements(state.configuration->'archive'->'pools') WITH ORDINALITY p(value,position)
      CROSS JOIN LATERAL jsonb_array_elements(p.value->'maps') WITH ORDINALITY m(value,position)
      WHERE p.value->>'id'=target->>'poolId' AND m.value->>'slot'=target->>'slot'
        AND m.value->'beatmapId'=target->'beatmapId'
    LOOP
      matches := matches+1;
      IF matches > 1 THEN RAISE EXCEPTION 'Duplicate archive download mirror target'; END IF;
      IF hit.map->'downloadMirror' IS NOT NULL AND hit.map->'downloadMirror' <> 'null'::jsonb
         AND hit.map->'downloadMirror' <> target->'downloadMirror' THEN
        RAISE EXCEPTION 'Conflicting archive download mirror; review before updating';
      END IF;
      recovered := hit.map || jsonb_build_object('downloadMirror',target->'downloadMirror');
      corrected := jsonb_set(corrected,ARRAY['archive','pools',hit.pool_index::text,'maps',hit.map_index::text],recovered);
    END LOOP;
    IF corrected = state.configuration THEN CONTINUE; END IF;
    INSERT INTO public.edition_revisions(edition_slug,version,configuration)
    VALUES(state.slug,state.configuration_version,state.configuration) ON CONFLICT DO NOTHING;
    INSERT INTO public.edition_revisions(edition_slug,version,configuration)
    VALUES(state.slug,state.configuration_version+1,corrected);
    UPDATE public.edition_state SET configuration=corrected,
      configuration_version=state.configuration_version+1,configuration_updated_at=now() WHERE slug=state.slug;
    INSERT INTO public.edition_events(edition_slug,kind,detail)
    VALUES(state.slug,'archive_map_download_mirror', target || jsonb_build_object(
      'issue',852,'fromRevision',state.configuration_version,'toRevision',state.configuration_version+1));
    -- The existing source-manifest trigger invalidates stale relation/cache heads.
    -- Keep immutable documents/history; normalize s2 and s6 after migrating.
  END LOOP;
END;
$$;
