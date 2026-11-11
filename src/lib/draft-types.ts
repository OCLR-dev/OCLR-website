import type { z } from "zod";
import type {
  broadcastDraftReadContract,
  captainBoardReadContract,
  draftBoardReadContract,
  draftIdentityReadContract,
  draftTeamReadContract,
} from "./draft-read-contracts";

export type DraftIdentity = z.infer<typeof draftIdentityReadContract>;
export type DraftTeam = z.infer<typeof draftTeamReadContract>;
export type DraftBoard = z.infer<typeof draftBoardReadContract>;
export type BroadcastBoard = z.infer<typeof broadcastDraftReadContract>;
export type DraftState = DraftBoard["state"];
export type CaptainBoard = z.infer<typeof captainBoardReadContract>;
