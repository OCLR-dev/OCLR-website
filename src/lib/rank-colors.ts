const STAT_STOPS = {
  red: "#d32f2f",
  yellow: "#fedc45",
  green: "#31b16c",
} as const;

const WHITE = "#ffffff";

function linearChannel(channel: number) {
  return (channel / 255) ** 2.2;
}

function gammaChannel(value: number) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return Math.round(clamped ** (1 / 2.2) * 255);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Mix two sRGB colours in linear light so the mid-tones stay even. */
export function mixColor(from: string, to: string, t: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const channels = start.map((channel, index) =>
    gammaChannel(
      linearChannel(channel) * (1 - t) + linearChannel(end[index]) * t,
    ),
  );
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export type ColorStops = { min: string; mid: string; max: string };

export const PERFORMANCE_STOPS: ColorStops = {
  min: STAT_STOPS.red,
  mid: STAT_STOPS.yellow,
  max: STAT_STOPS.green,
};

export const WIN_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, STAT_STOPS.green, 0.5),
  max: STAT_STOPS.green,
};

export const LOSS_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, STAT_STOPS.red, 0.5),
  max: STAT_STOPS.red,
};

export const APPEARANCE_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, "#00b7ee", 0.5),
  max: "#00b7ee",
};

export const GRAY_STOPS: ColorStops = {
  min: WHITE,
  mid: mixColor(WHITE, "#aaaaaa", 0.5),
  max: "#aaaaaa",
};

/** The podium metals, matching the trophy marks used on player profiles. */
export const TROPHY_STOPS = {
  champion: {
    min: WHITE,
    mid: mixColor(WHITE, "#f3c33f", 0.5),
    max: "#f3c33f",
  },
  runnerUp: {
    min: WHITE,
    mid: mixColor(WHITE, "#c8d2dc", 0.5),
    max: "#c8d2dc",
  },
  third: {
    min: WHITE,
    mid: mixColor(WHITE, "#c9834a", 0.5),
    max: "#c9834a",
  },
} satisfies Record<"champion" | "runnerUp" | "third", ColorStops>;

export const BAND_COUNT = 10;
const MID_BAND = 5;

/**
 * Turn a 0-1 rank position into one of ten solid colour bands. The minimum,
 * middle and maximum values land on bands 1, 5 and 10; the lower band owns a
 * shared boundary.
 */
export function bandColor(stops: ColorStops, position: number): string {
  const clamped = Math.min(Math.max(position, 0), 1);
  const band = Math.max(
    1,
    Math.min(BAND_COUNT, Math.ceil(clamped * BAND_COUNT)),
  );
  if (band <= MID_BAND) {
    return mixColor(stops.min, stops.mid, (band - 1) / (MID_BAND - 1));
  }
  return mixColor(
    stops.mid,
    stops.max,
    (band - MID_BAND) / (BAND_COUNT - MID_BAND),
  );
}
