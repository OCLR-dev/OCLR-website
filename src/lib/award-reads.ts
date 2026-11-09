import { db } from "@/db";
import { calculateAwardWorkspace } from "./award-calculation";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { readTournament } from "./tournament-reads";

export type AwardWorkspace = ExplicitReadData<"awardWorkspace">;
type PublicAwards = ExplicitReadData<"publicAwards">;

async function databaseAwardWorkspace(
  actor: User,
  slug: string,
): Promise<AwardWorkspace> {
  await assertReadCapability(actor, "approve_results", slug);
  return db().transaction((tx) => calculateAwardWorkspace(slug, tx), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
export async function awardWorkspace(
  actor: User,
  slug: string,
): Promise<AwardWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<AwardWorkspace>("awardWorkspace", { slug });
  }
  return databaseAwardWorkspace(actor, slug);
}

async function databasePublicAwards(slug: string): Promise<PublicAwards> {
  if (!process.env.DATABASE_URL) return null;
  return db().transaction(
    async (tx) => {
      if (!(await readTournament(slug, tx, true))) return null;
      const data = await calculateAwardWorkspace(slug, tx);
      return data.releases
        .sort((a, b) => a.week - b.week)
        .map((release) => {
          const stale =
            release.fingerprint !==
            data.reports.find((r) => r.number === release.week)?.fingerprint;
          const report = release.report;
          return {
            week: release.week,
            revision: release.revision,
            publishedAt: release.publishedAt.toISOString(),
            stale,
            startsAt: report.startsAt,
            endsAt: report.endsAt,
            timeZone: report.timeZone,
            policy: report.policy,
            candidates: stale
              ? []
              : report.candidates.flatMap((c) => {
                  const identity = report.identities.find(
                    (p) => p.userId === c.userId && p.public,
                  );
                  return identity
                    ? [{ ...c, username: identity.username }]
                    : [];
                }),
            mvp: stale ? [] : report.mvp,
            mip: stale ? [] : report.mip,
            rookie: stale ? [] : report.rookie,
          };
        });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicAwards(slug: string): Promise<PublicAwards> {
  if (remoteMode()) {
    return frontendResource<PublicAwards>("publicAwards", { slug });
  }
  return databasePublicAwards(slug);
}
