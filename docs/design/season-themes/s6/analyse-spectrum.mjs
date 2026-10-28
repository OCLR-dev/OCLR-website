// Reproduce the static decoration from an actual music excerpt, without playback.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) throw new Error("Pass the local MDN outfoxing.mp3 sample path.");
const bytes = await readFile(input);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (
  sha256 !== "7f00803ccfb5be334f83e570aa58a1f7860e1fed9a5d8cec07b12d0e480c9fe7"
)
  throw new Error("The music sample does not match the recorded source.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
let analysis;
try {
  const page = await browser.newPage();
  analysis = await page.evaluate(async (base64) => {
    const encoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const decoder = new OfflineAudioContext(2, 1, 44100);
    const audio = await decoder.decodeAudioData(encoded.buffer);
    const sampleRate = audio.sampleRate;
    const offset = 12;
    const times = [0.8, 0.9, 1, 1.1, 1.2];
    const fftSize = 8192;
    const ctx = new OfflineAudioContext(
      2,
      Math.ceil(sampleRate * 1.5),
      sampleRate,
    );
    const source = ctx.createBufferSource();
    source.buffer = audio;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser).connect(ctx.destination);
    source.start(0, offset);
    const pauses = times.map((t) => ctx.suspend(t));
    const rendering = ctx.startRendering();
    const frames = [];
    const capturedAt = [];
    for (const pause of pauses) {
      await pause;
      const bins = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(bins);
      frames.push(Array.from(bins, (n) => (Number.isFinite(n) ? n : -150)));
      capturedAt.push(offset + ctx.currentTime);
      await ctx.resume();
    }
    await rendering;
    const edges = Array.from(
      { length: 33 },
      (_, i) => 40 * (16000 / 40) ** (i / 32),
    );
    const floorDb = -80,
      ceilingDb = -20,
      maxSegments = 24;
    const bands = edges.slice(0, -1).map((lo, i) => {
      const first = Math.max(1, Math.ceil((lo * fftSize) / sampleRate));
      const last = Math.min(
        analyser.frequencyBinCount,
        Math.max(first + 1, Math.ceil((edges[i + 1] * fftSize) / sampleRate)),
      );
      let totalPower = 0;
      for (const frame of frames)
        for (let k = first; k < last; k++) totalPower += 10 ** (frame[k] / 10);
      const db = 10 * Math.log10(totalPower / frames.length);
      const level = Math.round(
        Math.max(0, Math.min(1, (db - floorDb) / (ceilingDb - floorDb))) *
          maxSegments,
      );
      return { lowHz: lo, highHz: edges[i + 1], db, level };
    });
    return {
      sampleRate,
      duration: audio.duration,
      fftSize,
      capturedAt,
      aggregation:
        "Sum FFT-bin power within each logarithmic band; mean across five frames",
      floorDb,
      ceilingDb,
      maxSegments,
      bands,
    };
  }, bytes.toString("base64"));
} finally {
  await browser.close();
}
if (
  analysis.bands.length !== 32 ||
  analysis.bands.some((b) => !Number.isFinite(b.db))
)
  throw new Error("Invalid spectrum analysis.");
const out = fileURLToPath(new URL(".", import.meta.url));
await writeFile(
  out + "spectrum-data.json",
  JSON.stringify(
    {
      date: "2026-10-28",
      source: {
        title: "Outfoxing the Fox",
        artist: "Kevin MacLeod",
        url: "https://raw.githubusercontent.com/mdn/webaudio-examples/main/audio-basics/outfoxing.mp3",
        credit:
          "https://github.com/mdn/webaudio-examples/blob/main/audio-basics/index.html",
        sha256,
      },
      ...analysis,
    },
    null,
    2,
  ) + "\n",
);
const columns = analysis.bands
  .map((_, i) => `<rect x="${17 + i * 9}" y="10" width="6.5" height="146"/>`)
  .join("\n");
const segments = analysis.bands
  .map((band, i) =>
    Array.from(
      { length: band.level },
      (_, level) =>
        `<rect x="${17 + i * 9}" y="${151 - level * 6}" width="6.5" height="4.5" rx=".35"/>`,
    ).join("\n"),
  )
  .join("\n");
await writeFile(
  out + "music-spectrum.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" fill="none">
<defs>
<linearGradient id="spectrum" x1="17" y1="90" x2="303" y2="90" gradientUnits="userSpaceOnUse"><stop stop-color="#f04f6b"/><stop offset=".5" stop-color="#ae61d5"/><stop offset="1" stop-color="#3f76f2"/></linearGradient>
<linearGradient id="trail" x1="0" y1="10" x2="0" y2="156" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
<mask id="trail-fade"><rect width="320" height="180" fill="url(#trail)"/></mask>
<filter id="bloom" x="0" y="0" width="320" height="180" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1" result="soft"/><feComponentTransfer in="soft" result="glow"><feFuncA type="linear" slope=".16"/></feComponentTransfer><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g fill="url(#spectrum)" mask="url(#trail-fade)">
${columns}
</g>
<g fill="url(#spectrum)" filter="url(#bloom)">
${segments}
</g>
</svg>
`,
);
console.log(
  JSON.stringify({
    bands: analysis.bands.length,
    levels: analysis.bands.map((b) => b.level),
    capturedAt: analysis.capturedAt,
  }),
);
