import { streamingShowcaseReplays } from "@/lib/streaming-showcase-read";

async function handle(
  request: Request,
  context: RouteContext<"/api/v1/streaming/tournaments/[edition]/showcase/pools/[poolId]/replays">,
) {
  const { edition, poolId } = await context.params;
  return streamingShowcaseReplays(request, edition, poolId);
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
