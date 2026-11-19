import { streamingShowcaseReplayFile } from "@/lib/streaming-showcase-read";

async function handle(
  request: Request,
  context: RouteContext<"/api/v1/streaming/tournaments/[edition]/showcase/pools/[poolId]/replays/[replayId]">,
) {
  const { edition, poolId, replayId } = await context.params;
  return streamingShowcaseReplayFile(request, edition, poolId, replayId);
}

export {
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
