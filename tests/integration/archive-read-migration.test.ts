import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertTestDatabase } from "../database";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { archiveContentHash } from "../../src/lib/archive-read-model";
const base = process.env.TEST_DATABASE_URL;
describe.skipIf(!base)(
  "historical relational migration and immutable JSONB history",
  () => {
    it("preserves saved data on upgrade and retains edits/withdrawal transactionally", async () => {
      assertTestDatabase(base);
      const name = `oclr_archive_migration_${randomUUID().replaceAll("-", "")}_test`;
      const admin = new Pool({ connectionString: base });
      const url = new URL(base);
      url.pathname = `/${name}`;
      const folder = mkdtempSync(
        join(tmpdir(), "oclr-archive-migration-test-"),
      );
      let pool: Pool | undefined;
      try {
        await admin.query(
          `CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`,
        );
        pool = new Pool({ connectionString: url.toString() });
        mkdirSync(join(folder, "meta"));
        const file = join(folder, "meta/_journal.json"),
          journal = JSON.parse(
            readFileSync("drizzle/meta/_journal.json", "utf8"),
          );
        const entries = journal.entries;
        journal.entries = entries.filter((e: { idx: number }) => e.idx < 77);
        for (const entry of journal.entries)
          copyFileSync(
            `drizzle/${entry.tag}.sql`,
            join(folder, `${entry.tag}.sql`),
          );
        writeFileSync(file, JSON.stringify(journal));
        await migrate(drizzle(pool), { migrationsFolder: folder });
        await pool.query(
          "INSERT INTO edition_state(slug,configuration) VALUES ('s7',$1)",
          [JSON.stringify({ archive: statisticsArchive })],
        );
        const snapshot = {
          archiveKey: statisticsArchiveKey(statisticsArchive),
          source: statisticsSource(),
          poolId: "final",
          included: [1, 2],
        };
        await pool.query(
          "INSERT INTO historical_statistics(edition_slug,mp_id,fixture_id,version,draft,published,published_at) VALUES ('s7',999177,'one',3,$1,$1,'2026-01-01T00:00:00Z')",
          [JSON.stringify(snapshot)],
        );
        const saved = (await pool.query("SELECT * FROM historical_statistics"))
          .rows;
        // A populated pre-cutover database must retain its existing typed
        // documents/heads and start in the compatible source-read state.
        journal.entries = entries.filter((e: { idx: number }) => e.idx < 82);
        for (const entry of journal.entries.filter(
          (e: { idx: number }) => e.idx >= 77,
        ))
          copyFileSync(
            `drizzle/${entry.tag}.sql`,
            join(folder, `${entry.tag}.sql`),
          );
        writeFileSync(file, JSON.stringify(journal));
        await migrate(drizzle(pool), { migrationsFolder: folder });
        const hash = archiveContentHash(statisticsArchive);
        const document = (
          await pool.query(
            "INSERT INTO archive_relation_documents(edition_slug,document_key,kind,content_hash,codec_version) VALUES ('s7','archive','archive',$1,1) RETURNING *",
            [hash],
          )
        ).rows[0];
        await pool.query(
          "INSERT INTO archive_relation_heads(edition_slug,document_key,document_id,source_hash) VALUES ('s7','archive',$1,$2)",
          [document.id, hash],
        );
        // Populate the actual 0082 cache/source shape before upgrading 0083.
        journal.entries = entries.filter((e: { idx: number }) => e.idx < 83);
        copyFileSync(
          "drizzle/0082_archive_relational_cutover.sql",
          join(folder, "0082_archive_relational_cutover.sql"),
        );
        writeFileSync(file, JSON.stringify(journal));
        await migrate(drizzle(pool), { migrationsFolder: folder });
        const oldSources = (
          await pool.query("SELECT * FROM historical_archive_sources")
        ).rows;
        const retainedHeader = { evidence: "Synthetic retained legacy header" };
        const retainedSummary = {
          slug: "s7",
          evidence: "Synthetic retained legacy summary",
        };
        const generation = (
          await pool.query(
            "INSERT INTO archive_read_versions(edition_slug,configuration_version,archive_hash,source_hash,projector_version,header,public_statistics) VALUES ('s7',0,$1,$1,2,$2,$3) RETURNING id",
            [
              hash,
              JSON.stringify(retainedHeader),
              JSON.stringify(retainedSummary),
            ],
          )
        ).rows[0].id;
        const retainedPlay = {
          fixtureId: "one",
          mpId: 999177,
          gameId: 1,
          stage: "Final",
          beatmapId: 10001,
          title: "Synthetic zero",
          slot: "NM1",
          at: "2020-01-01T00:00:00Z",
          osuId: 91003,
          teamId: "alpha",
          score: 0,
          rawScore: 0,
          scoreMultiplier: 1,
          scoringType: "score",
          accuracy: null,
          combo: null,
          passed: false,
          mods: [],
          hits: { great: null, ok: 0, meh: null, miss: 0 },
          relative: null,
        };
        await pool.query(
          "INSERT INTO archive_read_plays(generation_id,position,fixture_id,mp_id,game_id,osu_id,team_id,stage,title,slot,beatmap_id,score,raw_score,score_multiplier,played_at,scoring_type,mods,hit_ok,hit_miss,payload) VALUES ($1,0,'one',999177,1,91003,'alpha','Final','Synthetic zero','NM1',10001,0,0,1,'2020-01-01T00:00:00Z','score','{}',0,0,$2)",
          [generation, JSON.stringify(retainedPlay)],
        );
        const oldPlays = (await pool.query("SELECT * FROM archive_read_plays"))
          .rows;
        await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
        const [{ optional_fields, ...unchangedPlay }] = (
          await pool.query("SELECT * FROM archive_read_plays")
        ).rows;
        expect(unchangedPlay).toEqual(oldPlays[0]);
        expect(optional_fields).toEqual([
          "hits",
          "rawScore",
          "scoreMultiplier",
        ]);
        const [upgradedCache] = (
          await pool.query("SELECT * FROM archive_read_versions")
        ).rows;
        expect(upgradedCache).toMatchObject({
          header: retainedHeader,
          public_statistics: retainedSummary,
          public_summary_document_id: null,
          public_play_count: 1,
        });
        const [sourceIdentity] = (
          await pool.query(
            "SELECT h.*,encode(sha256(convert_to(s.configuration::text,'UTF8')),'hex') AS expected FROM historical_archive_sources h JOIN edition_state s ON s.slug=h.edition_slug",
          )
        ).rows;
        expect(sourceIdentity.source_hash).toBe(oldSources[0].source_hash);
        expect(sourceIdentity.configuration_hash).toBe(sourceIdentity.expected);
        expect(
          (await pool.query("SELECT * FROM archive_relation_documents")).rows,
        ).toEqual([document]);
        expect(
          (await pool.query("SELECT * FROM archive_relation_heads")).rows,
        ).toEqual([
          {
            edition_slug: "s7",
            document_key: "archive",
            document_id: document.id,
            source_hash: hash,
            archive_source_digest: null,
          },
        ]);
        await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
        expect(
          (await pool.query("SELECT * FROM historical_statistics")).rows,
        ).toEqual(saved);
        const initial = (
          await pool.query("SELECT * FROM historical_statistics_revisions")
        ).rows;
        expect(initial).toHaveLength(1);
        expect(initial[0].draft).toEqual(saved[0].draft);
        expect(initial[0].published).toEqual(saved[0].published);
        await pool.query("BEGIN");
        await pool.query(
          "UPDATE historical_statistics SET version=4,published=NULL,published_at=NULL",
        );
        await pool.query("ROLLBACK");
        expect(
          (await pool.query("SELECT * FROM historical_statistics_revisions"))
            .rows,
        ).toEqual(initial);
        await pool.query(
          "UPDATE historical_statistics SET version=4,published=NULL,published_at=NULL",
        );
        const retained = (
          await pool.query(
            "SELECT * FROM historical_statistics_revisions ORDER BY version",
          )
        ).rows;
        expect(retained).toHaveLength(2);
        expect(retained[0].published).toEqual(snapshot);
        expect(retained[1].published).toBeNull();
        await expect(
          pool.query("DELETE FROM historical_statistics_revisions"),
        ).rejects.toMatchObject({ code: "55000" });
        await expect(
          pool.query(
            "UPDATE historical_statistics_revisions SET fixture_id='changed'",
          ),
        ).rejects.toMatchObject({ code: "55000" });
        await pool.query("DELETE FROM historical_statistics");
        expect(
          (await pool.query("SELECT * FROM historical_statistics_revisions"))
            .rows,
        ).toHaveLength(2);
      } finally {
        await pool?.end();
        await admin.query(`DROP DATABASE IF EXISTS ${name}`);
        await admin.end();
        rmSync(folder, { recursive: true, force: true });
      }
    }, 60000);
  },
);
