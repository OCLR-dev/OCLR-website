import type { Appearance } from "./preferences";

export type SpinnerArtwork = Readonly<{
  /** Repository-owned asset under public/, e.g. /branding/spinners/mascot.gif. */
  src: string;
  width: number;
  height: number;
  /** GIF/APNG extensions are detected; set true for other animated formats. */
  animated?: boolean;
  /** Optional still image for visitors who prefer reduced motion. */
  reducedMotionSrc?: string;
}>;

/** Opt-in artwork per resolved appearance. Unconfigured themes keep the ring. */
export const spinnerArtwork: Readonly<
  Partial<Record<Appearance, SpinnerArtwork>>
> = {};
