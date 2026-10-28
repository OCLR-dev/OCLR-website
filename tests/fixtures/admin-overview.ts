import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { seedSession } from "../e2e/session";
import { seedEditions, type Edition } from "./editions";
import { edition } from "./edition";
import { historicalArchive } from "./historical-archive";
import { assertTestDatabase } from "../database";

export function overviewEditions(): Edition[] {
  return Array.from({ length: 29 }, (_, index) => {
    const n = index + 1;
    const slug = `overview-${String(n).padStart(2, "0")}`;
    const status = (["completed", "live", "upcoming"] as const)[index % 3];
    return {
      ...structuredClone(edition),
      slug,
      season: String(n),
      status,
      name:
        n === 25
          ? "Synthetic Current League with a long tournament name for responsive layout 中文賽事名稱測試 25"
          : `Synthetic ${n <= 17 ? "Legacy" : "Current"} League ${n}`,
      published: n % 2 === 1,
      registration:
        status === "completed" ? null : structuredClone(edition.registration),
      ...(n === 1
        ? {
            archive: {
              ...structuredClone(historicalArchive),
              editionSlug: slug,
            },
          }
        : {}),
    };
  });
}

export async function seedAdminOverview() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  const admin = await seedSession(60001);
  const scoped = await seedSession(397101);
  const developer = await seedSession(397102);
  await db().execute(sql`TRUNCATE edition_state CASCADE`);
  await seedEditions(overviewEditions());
  await db()
    .insert(staffRoles)
    .values([
      { userId: 397102, role: "developer", grantedBy: 60001 },
      ...overviewEditions()
        .slice(0, 15)
        .map((row) => ({
          userId: 397101,
          role: "mappooler" as const,
          editionSlug: row.slug,
          grantedBy: 60001,
        })),
    ]);
  return { admin, scoped, developer };
}
