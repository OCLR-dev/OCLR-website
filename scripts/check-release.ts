import { appUrl } from "../src/lib/http";
import { authReady, oauthConfig, privacyContact } from "../src/lib/auth/config";
import { getAnnouncements } from "../src/lib/announcements";
import { getBrackets } from "../src/lib/brackets";
import { db, closeDb } from "../src/db";
import { sql } from "drizzle-orm";
import { assertEditionConfigurationsReady } from "./release-editions-check";
try {
  if (!authReady())
    throw new Error(
      "Required origin, database, osu! credentials or approved privacy configuration is missing.",
    );
  if (!appUrl().startsWith("https://"))
    throw new Error("Release requires HTTPS.");
  oauthConfig();
  const ids = (process.env.ADMIN_OSU_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    ids.some(
      (id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)),
    )
  )
    throw new Error("Configure valid verified bootstrap Admin osu! IDs.");
  const globalAdmins = await db().execute(
    sql`SELECT 1 FROM staff_roles WHERE role = 'admin' AND edition_slug IS NULL AND revoked_at IS NULL LIMIT 1`,
  );
  if (!ids.length && !globalAdmins.rows.length)
    throw new Error("Provision a verified global Admin before release.");
  await db().execute(
    sql`SELECT configuration, configuration_version, registration_paused_at FROM edition_state LIMIT 0`,
  );
  await assertEditionConfigurationsReady();
  getBrackets();
  getAnnouncements();
  const contact = privacyContact()!; // authReady() already validated the explicit contact.
  if (!ids.some((id) => Number(id) === contact.osuId)) {
    const admin = await db().execute(sql`SELECT 1 FROM staff_roles
      WHERE user_id = ${contact.osuId} AND role = 'admin'
      AND edition_slug IS NULL AND revoked_at IS NULL LIMIT 1`);
    if (!admin.rows.length)
      throw new Error(
        "The designated privacy contact must be a verified global Admin.",
      );
  }
  await db().execute(sql`SELECT 1 FROM users LIMIT 0`);
  await db().execute(
    sql`SELECT token_hash, session_hash, user_id, origin, scopes, expires_at, revoked_at FROM developer_api_tokens LIMIT 0`,
  );
  await db().execute(
    sql`SELECT actor_id, access_id, action, detail FROM developer_api_events LIMIT 0`,
  );
  await db().execute(
    sql`SELECT osu_id, mode, profile, attempted_at, retry_at, refresh_token, error_status FROM user_profile_cache LIMIT 0`,
  );
  await db().execute(
    sql`SELECT eligibility_acknowledged, eligibility_verification FROM registrations LIMIT 0`,
  );
  await db().execute(sql`SELECT before, after FROM staff_role_events LIMIT 0`);
  await db().execute(sql`SELECT about_published FROM staff_roles LIMIT 0`);
  await db().execute(
    sql`SELECT default_appearance, revision FROM site_settings LIMIT 0`,
  );
  await db().execute(
    sql`SELECT actor_id, before_appearance, after_appearance, revision FROM site_setting_events LIMIT 0`,
  );
  await db().execute(
    sql`SELECT operation, attempt FROM registration_events LIMIT 0`,
  );
  await db().execute(sql`SELECT attempt FROM registrations LIMIT 0`);
  await db().execute(
    sql`SELECT snapshot, configuration_version FROM registration_attempts LIMIT 0`,
  );
  await db().execute(
    sql`SELECT 1 FROM captains, teams, memberships, draft_sessions, draft_picks, edition_events LIMIT 0`,
  );
  await db().execute(
    sql`SELECT 1 FROM staff_role_events, tournament_stages, tournament_rounds, mappools, mappool_entries, mappool_events LIMIT 0`,
  );
  await db().execute(
    sql`SELECT 1 FROM fixtures, fixture_referees, fixture_commentators, match_imports, match_games, match_results, result_revisions, result_audit_events, result_game_claims LIMIT 0`,
  );
  await db().execute(sql`SELECT assignment_revision FROM fixtures LIMIT 0`);
  await db().execute(
    sql`SELECT 1 FROM award_settings, weekly_award_releases LIMIT 0`,
  );
  await db().execute(sql`SELECT avatar_key FROM teams LIMIT 0`);
  const plannedColumns = await db().execute(
    sql`SELECT count(*)::integer AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fixtures' AND column_name IN ('home_team_id', 'away_team_id') AND is_nullable = 'YES'`,
  );
  if (plannedColumns.rows[0]?.count !== 2)
    throw new Error(
      "Apply the planned-fixture participant migration before release.",
    );
  await db().execute(sql`SELECT latest_import_id FROM match_results LIMIT 0`);
  await db().execute(
    sql`SELECT draft, published, version FROM historical_statistics LIMIT 0`,
  );
  await db().execute(
    sql`SELECT request_key, request_hash FROM result_audit_events LIMIT 0`,
  );
  await db().execute(
    sql`SELECT group_configuration, groups_published_at FROM tournament_stages LIMIT 0`,
  );
  console.log(
    "Configuration and database preflight passed. Live OAuth, deployment and organizer approval must still be verified.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Release preflight failed.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
