import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { HttpError } from "./http-error";
import type { BeatmapSnapshot } from "./mappool-model";
import { parseCandidateRows } from "./mappool-workbench-model";
import { selectionWorkspace } from "./mappool-workbench-reads";
import {
  candidatePreviewInput,
  type CandidatePreview,
} from "./mappool-write-contracts";
import { fetchBeatmaps } from "./osu-beatmaps";

export async function previewCandidates(
  actor: User,
  slug: string,
  input: unknown,
): Promise<CandidatePreview> {
  // Preview spends provider budget, so it requires the same live write grant.
  await assertCapability(actor, "select_mappools", slug);
  const parsed = candidatePreviewInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Enter between 1 and 50 map rows.");
  const data = await selectionWorkspace(actor, slug);
  if (data.archived)
    throw new HttpError(
      409,
      "Historical archives are read-only in the selection workbench.",
    );
  let rows;
  try {
    rows = parseCandidateRows(
      parsed.data.text,
      data.candidates
        .filter((c) => c.category === parsed.data.category)
        .map((c) => c.beatmapId),
    );
  } catch {
    throw new HttpError(400, "Enter between 1 and 50 map rows.");
  }
  const ids = rows.filter((r) => r.status === "ready").map((r) => r.beatmapId!);
  const snapshots = ids.length
    ? await fetchBeatmaps(ids)
    : new Map<number, BeatmapSnapshot | HttpError>();
  return {
    rows: rows.map((r) => {
      const result = snapshots.get(r.beatmapId!);
      return {
        ...r,
        status:
          r.status === "ready" && (!result || result instanceof HttpError)
            ? "failed"
            : r.status,
        snapshot: result && !(result instanceof HttpError) ? result : null,
        error: result instanceof HttpError ? result.message : null,
      };
    }),
  };
}
