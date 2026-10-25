import { db } from "@/db";
import { remoteMode } from "./data-source";
import { readTournament, readTournaments } from "./tournaments";
// PostgreSQL is authoritative. No JSON fallback, process cache or automatic seed.
export async function getEditions() {
  if (remoteMode()) {
    const { frontendPrivateTournaments } = await import("./frontend-data");
    const { privateSavedTournament } = await import("./frontend-read-models");
    const editions = [];
    for (const summary of await frontendPrivateTournaments()) {
      const record = await privateSavedTournament(summary.slug);
      if (record) editions.push(record.edition);
    }
    return editions;
  }
  return (await readTournaments()).map((row) => row.edition);
}
/** Selectors need identities only; reuse the versioned summary collection remotely. */
export async function getEditionChoices() {
  if (remoteMode())
    return (
      await (await import("./frontend-data")).frontendPrivateTournaments()
    ).map(({ slug, name, published }) => ({ slug, name, published }));
  return (await getEditions()).map(({ slug, name, published }) => ({
    slug,
    name,
    published,
  }));
}
export async function getPublicEditions() {
  if (remoteMode()) {
    const { frontendTournaments } = await import("./frontend-data");
    const { publicEnrollment } = await import("./frontend-read-models");
    const records = [];
    for (const edition of await frontendTournaments()) {
      const record = await publicEnrollment(edition.slug);
      if (record) records.push(record.edition);
    }
    return records;
  }
  return (await readTournaments(true)).map((row) => row.edition);
}
export async function getEdition(slug: string) {
  if (remoteMode())
    return (
      await (
        await import("./frontend-read-models")
      ).privateSavedTournament(slug)
    )?.edition;
  if (!process.env.DATABASE_URL) return undefined;
  return (await readTournament(slug))?.edition;
}
export async function getPublicEdition(slug: string) {
  if (remoteMode())
    return (
      await (await import("./frontend-read-models")).publicEnrollment(slug)
    )?.edition;
  if (!process.env.DATABASE_URL) return undefined;
  return (await readTournament(slug, db(), true))?.edition;
}
