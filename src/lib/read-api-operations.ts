import { z } from "zod";
import {
  developerApiScopes,
  type DeveloperApiScope,
} from "./developer-api-model";
import { extendedResources, extendedSchemas } from "./extended-read-resources";
import {
  paginationSchema,
  privateTournamentSchema,
  privateTournamentSummarySchema,
  publicPlayerProfileSchema,
  publicPlayerSchema,
  publicTournamentSchema,
  publicTournamentSummarySchema,
  savedProfileSchema,
  siteSchema,
} from "./read-api-contract";
export const apiIdentitySchema = z
  .object({
    user: z
      .object({ osuId: z.number().int().positive(), username: z.string() })
      .strict(),
    access: z
      .object({
        kind: z.literal("developer-read"),
        scopes: z.array(z.enum(developerApiScopes)),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();
export const readSchemas: Record<string, z.ZodType> = {
  ...extendedSchemas,
  Site: siteSchema,
  PublicTournament: publicTournamentSchema,
  PublicTournamentSummary: publicTournamentSummarySchema,
  PublicTournaments: z.array(publicTournamentSummarySchema),
  PrivateTournament: privateTournamentSchema,
  PrivateTournaments: z.array(privateTournamentSummarySchema),
  PublicPlayer: publicPlayerSchema,
  PublicPlayers: z.array(publicPlayerSchema),
  PublicPlayerProfile: publicPlayerProfileSchema,
  SavedProfile: savedProfileSchema,
  Pagination: paginationSchema,
  ApiIdentity: apiIdentitySchema,
};
export type ReadOperation = {
  id: string;
  path: string;
  schema: keyof typeof readSchemas;
  public: boolean;
  scope: DeveloperApiScope;
  query: readonly string[];
  issues: number[];
  description: string;
  binary?: boolean;
  additionalScopes?: readonly DeveloperApiScope[];
};
const collection = ["q", "page", "pageSize", "version"] as const;
export const readOperations: readonly ReadOperation[] = [
  {
    id: "getTeamAvatar",
    path: "/media/teams/{id}/avatar",
    schema: "Site",
    public: true,
    scope: "tournaments:read",
    query: [],
    issues: [269, 271, 272],
    description:
      "Bounded WebP; unpublished identities additionally require private scope and live staff read authorization.",
    binary: true,
  },
  {
    id: "downloadReplay",
    path: "/staff/tournaments/{edition}/mappool-entries/{id}/replays/{replayId}/file",
    schema: "Site",
    public: false,
    scope: "tournaments:private:read",
    query: [],
    issues: [269, 271, 272],
    description:
      "Authorized saved replay download, at most 8 MiB; no storage path or provider proxy.",
    binary: true,
  },
  ...extendedResources.map((resource) => ({
    id: resource.id,
    path: resource.path,
    schema: resource.id,
    public: resource.public,
    scope: resource.scope as DeveloperApiScope,
    additionalScopes:
      "additionalScopes" in resource
        ? (resource.additionalScopes as DeveloperApiScope[])
        : [],
    query: resource.query,
    issues: [
      269,
      271,
      272,
      186,
      ...("issues" in resource ? (resource.issues as number[]) : []),
    ],
    description:
      "Saved-only domain projection for the existing site. Subject-bound resources use the actual token identity; no initialization, provider request or mutation.",
  })),
  {
    id: "getApiIdentity",
    path: "/me",
    schema: "ApiIdentity",
    public: false,
    scope: "identity:read",
    query: [],
    issues: [268, 269],
    description:
      "Current token identity and effective read scopes; browser cookies are never used.",
  },
  {
    id: "getPublicSite",
    path: "/site",
    schema: "Site",
    public: true,
    scope: "tournaments:read",
    query: [],
    issues: [269, 143],
    description:
      "Whitelisted public site context. Appearance and locale are independent of authorization.",
  },
  {
    id: "listPublicTournaments",
    path: "/tournaments",
    schema: "PublicTournaments",
    public: true,
    scope: "tournaments:read",
    query: collection,
    issues: [269, 29],
    description:
      "Published tournament summaries in season-descending order, then slug.",
  },
  {
    id: "getPublicTournament",
    path: "/tournaments/{edition}",
    schema: "PublicTournament",
    public: true,
    scope: "tournaments:read",
    query: [],
    issues: [269, 270, 29, 265],
    description:
      "Published configuration and SSR overview projection, with explicit database/archive/preview provenance.",
  },
  {
    id: "listPublicPlayers",
    path: "/tournaments/{edition}/players",
    schema: "PublicPlayers",
    public: true,
    scope: "tournaments:read",
    query: collection,
    issues: [269, 71, 245, 266, 204, 149],
    description:
      "Complete accepted directory plus independently released coach identities; bounded transport pages never change the complete SSR list. Historical order is preserved.",
  },
  {
    id: "getPublicPlayer",
    path: "/tournaments/{edition}/players/{osuId}",
    schema: "PublicPlayerProfile",
    public: true,
    scope: "tournaments:read",
    query: ["mode"],
    issues: [269, 26, 71, 141],
    description:
      "Edition-scoped public identity and saved-only profile. Historical statistics remain unrecorded; no present-day cache overlays historical data.",
  },
  {
    id: "listStaffTournaments",
    path: "/staff/tournaments",
    schema: "PrivateTournaments",
    public: false,
    scope: "tournaments:private:read",
    query: collection,
    issues: [269, 186, 29],
    description:
      "Private edition summaries for the current explicitly authorized Developer; no write capabilities.",
  },
  {
    id: "getStaffTournament",
    path: "/staff/tournaments/{edition}",
    schema: "PrivateTournament",
    public: false,
    scope: "tournaments:private:read",
    query: [],
    issues: [269, 186, 29],
    description:
      "Whitelisted saved edition configuration and archive counts; no application answers, credentials or audit internals.",
  },
  {
    id: "getSavedProfile",
    path: "/staff/profiles/{osuId}",
    schema: "SavedProfile",
    public: false,
    scope: "profiles:read",
    query: ["mode"],
    issues: [269, 26, 40, 186],
    description:
      "Saved normalized provider profile only. Missing/unavailable snapshots return PROFILE_SNAPSHOT_NOT_FOUND; no fetch, cache claim or refresh.",
  },
];
