import { z } from "zod";

/** Navigation hint only; desktop reauthorizes the fixture before using it. */
export function desktopLaunchUrl(fixtureId: string): string | null {
  return z.uuid().safeParse(fixtureId).success
    ? `oclr-irc://connect?fixture=${fixtureId.toLowerCase()}`
    : null;
}
