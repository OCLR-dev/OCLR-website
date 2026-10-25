import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import type { User } from "./auth/sessions";
import { readCapabilityScope } from "./auth/staff";
import { HttpError } from "./http";
export const auditModules = [
  "site",
  "tournament",
  "registrations",
  "captains",
  "teams",
  "draft",
  "mappools",
  "staff",
  "fixtures",
  "results",
  "developer_api",
] as const;
const filtersSchema = z
  .object({
    edition: z
      .string()
      .regex(/^[a-z0-9-]*$/)
      .max(80)
      .default(""),
    actor: z
      .string()
      .regex(/^(?:[1-9]\d*)?$/)
      .refine((v) => !v || Number.isSafeInteger(Number(v)))
      .default(""),
    action: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9_ -]*$/)
      .default(""),
    module: z.enum(["", ...auditModules]).default(""),
    from: z.union([z.literal(""), z.iso.date()]).default(""),
    to: z.union([z.literal(""), z.iso.date()]).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "End date must follow start date",
  );
/** Bounded, redacted projection only. The original events remain untouched. */
export function safeAuditDetails(value: unknown) {
  let remaining = 16000;
  function visit(v: unknown, depth: number): unknown {
    if (remaining <= 0 || depth > 8) return "[truncated]";
    if (typeof v === "string") {
      const text = v.slice(0, Math.min(remaining, 1000));
      remaining -= text.length;
      return text.length < v.length ? text + "…" : text;
    }
    if (Array.isArray(v))
      return v.slice(0, 40).map((item) => visit(item, depth + 1));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .slice(0, 60)
          .map(([key, item]) => {
            remaining -= key.length;
            return [
              key,
              /answer|token|secret|cookie|authorization|password|email|contact/i.test(
                key,
              )
                ? "[redacted]"
                : visit(item, depth + 1),
            ];
          }),
      );
    return v;
  }
  return visit(value, 0);
}
export function auditChanges(before: unknown, after: unknown) {
  const changes: { field: string; before: string; after: string }[] = [];
  const display = (v: unknown): string =>
    v === undefined
      ? "—"
      : v === null
        ? "Not set"
        : typeof v === "object"
          ? Array.isArray(v)
            ? `${v.length} item(s)`
            : "Updated"
          : String(v).slice(0, 160);
  function diff(a: unknown, b: unknown, path: string, depth: number) {
    if (changes.length >= 20 || JSON.stringify(a) === JSON.stringify(b)) return;
    if (depth < 5 && (Array.isArray(a) || Array.isArray(b))) {
      const left = Array.isArray(a) ? a : [],
        right = Array.isArray(b) ? b : [];
      const identity = (item: unknown, index: number) =>
        item && typeof item === "object" && "id" in item
          ? String(item.id)
          : String(index + 1);
      const oldItems = new Map(
        left.map((item, index) => [identity(item, index), item]),
      );
      const newItems = new Map(
        right.map((item, index) => [identity(item, index), item]),
      );
      for (const key of new Set([...oldItems.keys(), ...newItems.keys()]))
        diff(
          oldItems.get(key),
          newItems.get(key),
          `${path} / ${key}`,
          depth + 1,
        );
    } else if (
      depth < 5 &&
      (a == null || (typeof a === "object" && !Array.isArray(a))) &&
      (b == null || (typeof b === "object" && !Array.isArray(b))) &&
      (a != null || b != null)
    ) {
      const left = (a ?? {}) as Record<string, unknown>,
        right = (b ?? {}) as Record<string, unknown>;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        diff(left[key], right[key], path ? `${path} / ${key}` : key, depth + 1);
    } else
      changes.push({
        field: path || "Record",
        before: display(a),
        after: display(b),
      });
  }
  diff(before, after, "", 0);
  return changes;
}
const projection = sql`
  SELECT 'edition' AS source, id, edition_slug,
    COALESCE(actor_id, CASE WHEN kind LIKE 'competition_fixture_%' AND detail->>'historicalActorOsuId' ~ '^[1-9][0-9]{0,15}$' THEN (detail->>'historicalActorOsuId')::bigint END) AS actor_id, kind AS action,
    CASE WHEN kind LIKE 'captain_%' THEN 'captains' WHEN kind LIKE 'team_%' THEN 'teams' WHEN kind LIKE 'draft_%' THEN 'draft' WHEN kind LIKE 'registration_%' THEN 'registrations' WHEN kind LIKE 'competition_%' THEN 'fixtures' ELSE 'tournament' END AS module,
    COALESCE(detail->'entity'->>'type', 'edition') AS entity_type, COALESCE(detail->'entity'->>'id', edition_slug) AS entity_id,
    detail->'before' AS before, detail->'after' AS after, (detail - 'before' - 'after') || jsonb_build_object('reason', reason) AS details, created_at
  FROM edition_events
  UNION ALL
  SELECT 'registration', e.id, r.edition_slug, e.actor_id, 'registration_' || COALESCE(e.operation, e.to_status::text), 'registrations', 'registration', r.id::text,
    jsonb_build_object('status', e.from_status), jsonb_build_object('status', e.to_status), jsonb_build_object('reason', e.reason, 'attempt', e.attempt, 'registrationSource', COALESCE(past.snapshot->>'source', r.source), 'osuId', r.user_id, 'configurationVersion', COALESCE(past.snapshot->'configurationVersion', to_jsonb(r.configuration_version))), e.created_at
  FROM registration_events e JOIN registrations r ON r.id=e.registration_id LEFT JOIN registration_attempts past ON past.registration_id=r.id AND past.attempt=e.attempt
  UNION ALL
  SELECT 'mappool', id, edition_slug, actor_id, action, 'mappools', CASE WHEN pool_id IS NULL THEN 'round' ELSE 'mappool' END,
    COALESCE(pool_id::text, after->>'id', edition_slug), before, after, jsonb_build_object('reason', reason), created_at FROM mappool_events
  UNION ALL
  SELECT 'staff', id, edition_slug, actor_id, 'staff_' || action, 'staff', 'staff assignment', grant_id::text,
    before, after, jsonb_build_object('targetOsuId', target_id, 'role', role, 'reason', reason), created_at FROM staff_role_events
  UNION ALL
  SELECT 'result', e.id, f.edition_slug, e.actor_id, e.action, CASE WHEN e.action LIKE 'fixture_%' THEN 'fixtures' ELSE 'results' END, 'fixture', f.id::text,
    e.detail->'before', e.detail->'after', (e.detail - 'before' - 'after') || jsonb_build_object('reason', e.reason), e.created_at
  FROM result_audit_events e JOIN fixtures f ON f.id=e.fixture_id
  UNION ALL
  SELECT 'site', id, NULL::text, actor_id, 'site_appearance_changed', 'site', 'site settings', '1',
    jsonb_build_object('defaultAppearance', before_appearance, 'revision', revision - 1),
    jsonb_build_object('defaultAppearance', after_appearance, 'revision', revision),
    '{}'::jsonb, created_at FROM site_setting_events
  UNION ALL
  SELECT 'developer_api', id, NULL::text, actor_id, 'developer_api_' || action, 'developer_api', 'developer API access', access_id::text,
    detail->'before', detail->'after', '{}'::jsonb, created_at FROM developer_api_events
  UNION ALL
  SELECT 'contributors', id, NULL::text, actor_id, 'contributors_updated', 'site', 'contributors', '1',
    jsonb_build_object('entries', before, 'revision', revision - 1),
    jsonb_build_object('entries', after, 'revision', revision), '{}'::jsonb, created_at FROM contributor_events`;
type AuditRow = {
  source: string;
  id: string;
  edition_slug: string | null;
  actor_id: string | number | null;
  username: string | null;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  details: unknown;
  created_at: Date | string;
};
export async function auditLog(actor: User, input: unknown) {
  const scopes = await readCapabilityScope(actor, "manage_staff");
  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Check the audit filters and UTC date range.");
  const filters = parsed.data;
  if (filters.edition && scopes && !scopes.includes(filters.edition))
    throw new HttpError(403, "This tournament is outside your audit scope.");
  const conditions: SQL[] = [sql`TRUE`];
  if (scopes)
    conditions.push(
      sql`e.edition_slug IN (${sql.join(
        scopes.map((scope) => sql`${scope}`),
        sql`,`,
      )})`,
    );
  if (filters.edition) conditions.push(sql`e.edition_slug=${filters.edition}`);
  if (filters.actor) conditions.push(sql`e.actor_id=${Number(filters.actor)}`);
  if (filters.action)
    conditions.push(sql`e.action=${filters.action.replaceAll(" ", "_")}`);
  if (filters.module) conditions.push(sql`e.module=${filters.module}`);
  if (filters.from)
    conditions.push(
      sql`e.created_at >= ${filters.from + "T00:00:00Z"}::timestamptz`,
    );
  if (filters.to)
    conditions.push(
      sql`e.created_at < ${filters.to + "T00:00:00Z"}::timestamptz + interval '1 day'`,
    );
  const where = sql.join(conditions, sql` AND `);
  return db().transaction(
    async (tx) => {
      const totals = await tx.execute(
        sql`WITH events AS (${projection}) SELECT count(*)::int AS count FROM events e WHERE ${where}`,
      );
      const result = await tx.execute(
        sql`WITH events AS (${projection}) SELECT e.*, u.username FROM events e LEFT JOIN users u ON u.osu_id=e.actor_id WHERE ${where} ORDER BY e.created_at DESC, e.source, e.id DESC LIMIT 25 OFFSET ${(filters.page - 1) * 25}`,
      );
      const rows = (result.rows as unknown as AuditRow[]).map((row) => ({
        id: `${row.source}:${row.id}`,
        edition: row.edition_slug,
        actorId: row.actor_id == null ? null : Number(row.actor_id),
        username: row.username,
        action: row.action,
        module: row.module,
        entityType: row.entity_type,
        entityId: row.entity_id,
        timestamp: new Date(row.created_at).toISOString(),
        before: safeAuditDetails(row.before),
        after: safeAuditDetails(row.after),
        details: safeAuditDetails(row.details),
      }));
      return { rows, total: Number(totals.rows[0].count), filters };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
