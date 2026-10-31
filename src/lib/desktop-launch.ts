import { z } from "zod";

/** Navigation hint only; desktop reauthorizes the fixture before using it. */
export function desktopLaunchUrl(fixtureId: string): string | null {
  return z.uuid().safeParse(fixtureId).success
    ? `oclr-irc://connect?fixture=${fixtureId.toLowerCase()}`
    : null;
}

/** Ordinary local room navigation. The desktop validates the numeric target again. */
export function desktopRoomJoinUrl(roomId: unknown): string | null {
  return typeof roomId === "number" &&
    Number.isSafeInteger(roomId) &&
    roomId > 0
    ? `oclr-irc://join?room=${roomId}`
    : null;
}
