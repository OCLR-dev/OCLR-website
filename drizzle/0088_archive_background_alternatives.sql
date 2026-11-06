ALTER TABLE "archive_rel_archive_pools_maps" ADD COLUMN "value_background_set_id" bigint;
--> statement-breakpoint
-- Background-only alternatives approved by the organizer's #852 selection rule.
-- Group by edition so each corrected archive receives one audited revision.
DO $$
DECLARE
  targets jsonb := $backgrounds$[
  {
    "editionSlug": "s1",
    "poolId": "gs",
    "slot": "NM3",
    "beatmapId": 659750,
    "originalSetId": 293275,
    "title": "Scars of FAUNA",
    "artist": "Nekomata Master",
    "backgroundSetId": 743685,
    "backgroundBeatmapId": 1568262,
    "backgroundArtist": "Nekomata Master",
    "backgroundTitle": "Scars of FAUNA",
    "searchRank": 1,
    "source": "https://osu.ppy.sh/beatmapsets/743685",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Scars%20of%20FAUNA&s=any",
    "capturedAt": "2026-11-06T16:35:46.822Z",
    "coverSha256": "d499b303ef4094f9f7a14cb21b9e1b19ec4f745ffa087139db5467132f735038"
  },
  {
    "editionSlug": "s4",
    "poolId": "coach",
    "slot": "NM3",
    "beatmapId": 700445,
    "originalSetId": 313788,
    "title": "Suigetsu Kyouka Koubou Issen",
    "artist": "Xenon",
    "backgroundSetId": 433340,
    "backgroundBeatmapId": 934131,
    "backgroundArtist": "Onocchi, Xenon",
    "backgroundTitle": "Suigetsu Kyouka Koubou Issen",
    "searchRank": 1,
    "source": "https://osu.ppy.sh/beatmapsets/433340",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Suigetsu%20Kyouka%20Koubou%20Issen&s=any",
    "capturedAt": "2026-11-06T16:33:11.074Z",
    "coverSha256": "646ab4ecac05925831c2ae5d1ae5930de3134a6274d8072581658337c434ff10"
  },
  {
    "editionSlug": "s4",
    "poolId": "captain",
    "slot": "DT1",
    "beatmapId": 871267,
    "originalSetId": 400439,
    "title": "Yume Utsutsu",
    "artist": "Another Infinity feat. Mayumi Morinaga",
    "backgroundSetId": 545384,
    "backgroundBeatmapId": 1155482,
    "backgroundArtist": "Another Infinity feat. Mayumi Morinaga",
    "backgroundTitle": "Yume Utsutsu",
    "searchRank": 4,
    "source": "https://osu.ppy.sh/beatmapsets/545384",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Yume%20Utsutsu&s=any",
    "capturedAt": "2026-11-06T16:34:59.023Z",
    "coverSha256": "8cdecbbe5005117caf8fb0dbec5f4b271a05bd8411f21c99062c23fa91c3b884"
  },
  {
    "editionSlug": "s5",
    "poolId": "pool-1",
    "slot": "NM3",
    "beatmapId": 446261,
    "originalSetId": 186899,
    "title": "Moldy Eye",
    "artist": "Igorrr",
    "backgroundSetId": 1630837,
    "backgroundBeatmapId": 3329187,
    "backgroundArtist": "Igorrr",
    "backgroundTitle": "Moldy Eye",
    "searchRank": 8,
    "source": "https://osu.ppy.sh/beatmapsets/1630837",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Moldy%20Eye&s=any",
    "capturedAt": "2026-11-06T16:34:33.681Z",
    "coverSha256": "5c68fd3d0454ad8da65ba3897e470b9d32ba6e13518ee1c27dee3a9e22a311ab"
  },
  {
    "editionSlug": "s5",
    "poolId": "pool-4",
    "slot": "HR1",
    "beatmapId": 757229,
    "originalSetId": 342574,
    "title": "Kreuz",
    "artist": "sky_delta",
    "backgroundSetId": 347551,
    "backgroundBeatmapId": 769744,
    "backgroundArtist": "sky_delta",
    "backgroundTitle": "Kreuz",
    "searchRank": 1,
    "source": "https://osu.ppy.sh/beatmapsets/347551",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Kreuz&s=any",
    "capturedAt": "2026-11-06T16:34:40.819Z",
    "coverSha256": "d7329a8add8a83083b5dec565aa6aa3a07acb446ae68c8137def130629385b09"
  },
  {
    "editionSlug": "s5",
    "poolId": "coach-qualifier",
    "slot": "NM1",
    "beatmapId": 792500,
    "originalSetId": 360578,
    "title": "Bikkuri sa Setara Okoru yo!",
    "artist": "Camellia ft. Nanahira",
    "backgroundSetId": 762639,
    "backgroundBeatmapId": 1660264,
    "backgroundArtist": "Camellia feat. Nanahira",
    "backgroundTitle": "Bikkuri sa setara okoru yo!",
    "searchRank": 1,
    "source": "https://osu.ppy.sh/beatmapsets/762639",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Bikkuri%20sa%20Setara%20Okoru%20yo%21&s=any",
    "capturedAt": "2026-11-06T16:33:56.704Z",
    "coverSha256": "526d834eacc167bbb8d705e48e41d10ff241d860088a66bfed66b1e13f829a43"
  },
  {
    "editionSlug": "s6",
    "poolId": "fs",
    "slot": "HR2",
    "beatmapId": 483199,
    "originalSetId": 203212,
    "title": "Himiko",
    "artist": "Suzaku VS Genbu",
    "backgroundSetId": 1474934,
    "backgroundBeatmapId": 3026840,
    "backgroundArtist": "Suzaku vs. Genbu",
    "backgroundTitle": "Himiko",
    "searchRank": 6,
    "source": "https://osu.ppy.sh/beatmapsets/1474934",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Himiko&s=any",
    "capturedAt": "2026-11-06T16:35:08.927Z",
    "coverSha256": "d92b59ef52e16650a3e0f2176463dd2226e58ebaa2a9e8f52495ef0051735905"
  },
  {
    "editionSlug": "s9",
    "poolId": "gs",
    "slot": "HD3",
    "beatmapId": 486597,
    "originalSetId": 206326,
    "title": "Little Star",
    "artist": "REDALiCE feat. Ayumi Nomiya",
    "backgroundSetId": 730367,
    "backgroundBeatmapId": 1541404,
    "backgroundArtist": "REDALiCE feat. Ayumi Nomiya",
    "backgroundTitle": "Little Star",
    "searchRank": 2,
    "source": "https://osu.ppy.sh/beatmapsets/730367",
    "searchUrl": "https://osu.ppy.sh/beatmapsets?q=Little%20Star&s=any",
    "capturedAt": "2026-11-06T16:35:15.795Z",
    "coverSha256": "d59924203f9c078431457132b1e035367fb18d62005f0b12f6c84b8490b818d2"
  }
]$backgrounds$::jsonb;
  season text;
  target jsonb;
  state record;
  hit record;
  corrected jsonb;
  matches integer;
BEGIN
  FOR season IN SELECT DISTINCT value->>'editionSlug' FROM jsonb_array_elements(targets) ORDER BY 1 LOOP
    SELECT * INTO state FROM public.edition_state
    WHERE slug=season AND jsonb_typeof(configuration->'archive')='object'
      AND configuration->'archive'->>'editionSlug'=season FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF state.configuration->>'status' IS DISTINCT FROM 'completed'
       OR coalesce(state.configuration->'registration','null'::jsonb) <> 'null'::jsonb
       OR state.configuration->'archive'->>'editionSlug' IS DISTINCT FROM season THEN
      RAISE EXCEPTION 'Background alternatives require a completed historical archive';
    END IF;
    corrected := state.configuration;
    FOR target IN SELECT value FROM jsonb_array_elements(targets) WHERE value->>'editionSlug'=season LOOP
      matches := 0;
      FOR hit IN
        SELECT p.position-1 AS pool_index, m.position-1 AS map_index, m.value AS map
        FROM jsonb_array_elements(state.configuration->'archive'->'pools') WITH ORDINALITY p(value,position)
        CROSS JOIN LATERAL jsonb_array_elements(p.value->'maps') WITH ORDINALITY m(value,position)
        WHERE p.value->>'id'=target->>'poolId' AND m.value->>'slot'=target->>'slot'
          AND m.value->'beatmapId'=target->'beatmapId'
      LOOP
        matches := matches+1;
        IF matches > 1 THEN RAISE EXCEPTION 'Duplicate background alternative target'; END IF;
        IF hit.map->'backgroundSetId' IS NOT NULL AND hit.map->'backgroundSetId' <> 'null'::jsonb
           AND hit.map->'backgroundSetId' <> target->'backgroundSetId' THEN
          RAISE EXCEPTION 'Conflicting background alternative; review before updating';
        END IF;
        corrected := jsonb_set(corrected,ARRAY['archive','pools',hit.pool_index::text,'maps',hit.map_index::text],hit.map || jsonb_build_object('backgroundSetId',target->'backgroundSetId'));
      END LOOP;
    END LOOP;
    IF corrected = state.configuration THEN CONTINUE; END IF;
    INSERT INTO public.edition_revisions(edition_slug,version,configuration)
    VALUES(state.slug,state.configuration_version,state.configuration) ON CONFLICT DO NOTHING;
    INSERT INTO public.edition_revisions(edition_slug,version,configuration)
    VALUES(state.slug,state.configuration_version+1,corrected);
    UPDATE public.edition_state SET configuration=corrected,
      configuration_version=state.configuration_version+1,configuration_updated_at=now() WHERE slug=state.slug;
    INSERT INTO public.edition_events(edition_slug,kind,detail)
    VALUES(state.slug,'archive_background_alternatives',jsonb_build_object('issue',852,
      'fromRevision',state.configuration_version,'toRevision',state.configuration_version+1,
      'alternatives',(SELECT jsonb_agg(value) FROM jsonb_array_elements(targets) WHERE value->>'editionSlug'=season)));
    -- Existing source-manifest triggers invalidate stale typed/cache heads.
    -- Normalize s1 s4 s5 s6 s9 after applying the reviewed release.
  END LOOP;
END;
$$;
