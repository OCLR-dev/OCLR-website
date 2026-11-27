import {
  paintRadar,
  radarFrame,
  type RadarFrame,
} from "./broadcast-radar-motion";

const revealEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const radarEase = [0.22, 1, 0.36, 1] as const;
const numberDelay = 220;
const numberDuration = 520;
const radarDelay = { etx: 220, sip: 300 };
const radarDuration = 680;
const historyDelay = 140;
const historyGlowDuration = 950;
const revealDuration = historyDelay + historyGlowDuration;
const featureParts = [
  ["portrait", 110, 460, "translateX(28px) scale(0.88)"],
  ["heading", 110, 400, "translateY(18px)"],
  ["name", 160, 480, "translateX(36px)"],
  ["appearance", 200, 400, "translateX(24px)"],
  ["stats", 140, 220, "translateY(12px)"],
  ["team", 240, 460, "translateX(28px)"],
] as const;

const savedLayers = [
  "data-pick-feature",
  "data-turn-team",
  "data-turn-round",
  "data-turn-digit",
] as const;

type NumberFrame = { number: number | null; text: string };
type Layer = (typeof savedLayers)[number];
type HistoryRow = { top: number; element: HTMLElement; copy: HTMLElement };
type Scene = {
  layers: Map<Layer, HTMLElement>;
  history: Map<string, HistoryRow>;
};

function readLayer(element: HTMLElement) {
  return {
    element,
    top: element.offsetTop,
    left: element.offsetLeft,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

function copyLayer({
  element,
  top,
  left,
  width,
  height,
}: ReturnType<typeof readLayer>) {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.setAttribute("data-outgoing-pick", "");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  Object.assign(copy.style, {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  return copy;
}

export function captureBroadcastScene(overlay: HTMLElement): Scene {
  const measuredLayers = savedLayers.flatMap((attribute) => {
    const element = overlay.querySelector<HTMLElement>(`[${attribute}]`);
    return element ? [[attribute, readLayer(element)] as const] : [];
  });
  const measuredRows = Array.from(
    overlay.querySelectorAll<HTMLElement>("[data-history-pick]"),
    readLayer,
  );
  const layers = new Map<Layer, HTMLElement>();
  for (const [attribute, measure] of measuredLayers) {
    const copy = copyLayer(measure);
    copy.removeAttribute(attribute);
    layers.set(attribute, copy);
  }
  const history = new Map<string, HistoryRow>();
  for (const measure of measuredRows) {
    const { element, top } = measure;
    const copy = copyLayer(measure);
    copy.removeAttribute("data-history-pick");
    history.set(element.dataset.historyPick!, { top, element, copy });
  }
  return { layers, history };
}

function animate(
  el: Element | null | undefined,
  id: string,
  frames: Keyframe[],
  duration: number,
  delay = 0,
  easing = revealEase,
) {
  return el?.animate(frames, {
    id: `oclr-${id}`,
    duration,
    delay,
    easing,
    fill: "backwards",
  });
}

function removeAfter(element: HTMLElement, animation: Animation | undefined) {
  animation?.effect?.updateTiming({ fill: "both" });
  const remove = () => element.remove();
  void animation?.finished.then(remove, remove);
}

function currentShift(element: Element) {
  const transform = getComputedStyle(element).transform;
  return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
}

function visibleStyle(source: HTMLElement) {
  const { opacity, transform } = getComputedStyle(source);
  return { opacity, transform };
}

function retainVisibleLayers(root: HTMLElement, scene: Scene | undefined) {
  if (!scene) return;
  const updates: {
    target: HTMLElement;
    style: ReturnType<typeof visibleStyle>;
  }[] = [];
  const replacements: {
    attribute: Layer;
    source: HTMLElement;
    style: ReturnType<typeof visibleStyle>;
  }[] = [];
  for (const attribute of savedLayers) {
    const target = scene.layers.get(attribute);
    const current = root.querySelector<HTMLElement>(`[${attribute}]`);
    if (!target || !current) continue;
    const alreadyLeaving = root.querySelector<HTMLElement>(
      `[data-leaving-layer="${attribute}"]`,
    );
    const currentStyle = visibleStyle(current);
    const leavingStyle = alreadyLeaving && visibleStyle(alreadyLeaving);
    if (
      alreadyLeaving &&
      leavingStyle &&
      Number(leavingStyle.opacity) >
        Number(currentStyle.opacity) *
          (attribute === "data-pick-feature" ? 0.35 : 1)
    ) {
      replacements.push({
        attribute,
        source: alreadyLeaving,
        style: leavingStyle,
      });
      continue;
    }
    updates.push({ target, style: currentStyle });
    if (attribute !== "data-pick-feature") continue;
    for (const [part] of featureParts) {
      const selector = `[data-feature-part="${part}"]`;
      const live = current.querySelector<HTMLElement>(selector);
      const copy = target.querySelector<HTMLElement>(selector);
      if (live && copy)
        updates.push({ target: copy, style: visibleStyle(live) });
    }
  }
  for (const { target, style } of updates) Object.assign(target.style, style);
  for (const { attribute, source, style } of replacements) {
    const copy = source.cloneNode(true) as HTMLElement;
    Object.assign(copy.style, style);
    scene.layers.set(attribute, copy);
  }
}

function interpolate(from: number, to: number, fraction: number) {
  return from + (to - from) * fraction;
}

function ease(
  ratio: number,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
) {
  if (ratio === 0 || ratio === 1) return ratio;
  const curve = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0,
    high = 1;
  for (let step = 0; step < 12; step++) {
    const mid = (low + high) / 2;
    if (curve(mid, x1, x2) < ratio) low = mid;
    else high = mid;
  }
  return curve((low + high) / 2, y1, y2);
}

function fraction(elapsed: number, delay: number, duration: number) {
  return Math.min(1, Math.max(0, (elapsed - delay) / duration));
}

function readNumbers(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "[data-pick-feature] [data-motion-number]",
    ),
    (element) => ({
      element,
      glow: element.parentElement?.querySelector("[data-number-glow]"),
      id: element.dataset.motionNumber!,
      target: {
        number:
          element.dataset.value === undefined
            ? null
            : Number(element.dataset.value),
        text: element.dataset.valueText!,
      },
    }),
  );
}

function readRadars(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<SVGGElement>("[data-motion-radar]"),
    (element) => {
      const id = element.dataset.motionRadar as keyof typeof radarDelay;
      return {
        paint: paintRadar(element),
        glow: element.parentElement?.querySelector("[data-radar-glow]"),
        id,
        delay: radarDelay[id],
        target: radarFrame(
          JSON.parse(element.dataset.radii!) as (number | null)[],
        ),
      };
    },
  );
}

function roll(
  root: HTMLElement,
  scene: Scene | undefined,
  attribute: "data-turn-team" | "data-turn-round" | "data-turn-digit",
) {
  const incoming = root.querySelector<HTMLElement>(`[${attribute}]`);
  const outgoing = scene?.layers.get(attribute);
  if (incoming?.textContent === outgoing?.textContent) return;
  // The duration includes the brief overlap, without overlapping the text baselines.
  animate(
    incoming,
    "turn",
    [
      { transform: "translateY(100%)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    330,
    350,
  );
  if (!outgoing || !incoming?.parentElement) return;
  outgoing.dataset.leavingLayer = attribute;
  incoming.parentElement.append(outgoing);
  removeAfter(
    outgoing,
    animate(
      outgoing,
      "outgoing-turn",
      [
        {
          transform: outgoing.style.transform || "translateY(0)",
          opacity: Number(outgoing.style.opacity || 1),
        },
        { transform: "translateY(-100%)", opacity: 0 },
      ],
      155,
      220,
      "ease-in",
    ),
  );
}

export function createBroadcastMotion() {
  let request = 0;
  let deadline = 0;
  let refreshAfterInterpolation = false;
  const numbers = new Map<string, NumberFrame>();
  const radars = new Map<string, RadarFrame>();
  const isRunning = () => request !== 0 || performance.now() < deadline;

  function stop(root: HTMLElement) {
    cancelAnimationFrame(request);
    request = 0;
    deadline = 0;
    refreshAfterInterpolation = false;
    for (const animation of root.getAnimations({ subtree: true })) {
      if (animation.id.startsWith("oclr-")) animation.cancel();
    }
    root
      .querySelectorAll("[data-outgoing-pick]")
      .forEach((node) => node.remove());
  }

  function sync(root: HTMLElement) {
    numbers.clear();
    for (const { id, element, target } of readNumbers(root)) {
      if (element.textContent !== target.text)
        element.textContent = target.text;
      element.style.removeProperty("opacity");
      numbers.set(id, target);
    }
    radars.clear();
    for (const { id, target, paint } of readRadars(root)) {
      paint(target);
      radars.set(id, target);
    }
  }

  function reveal(
    root: HTMLElement,
    scene: Scene | undefined,
    nextScene: Scene | undefined,
    locale: string,
    sameTier: boolean,
    sameTeam: boolean,
  ) {
    const currentRows = nextScene?.history;
    const interrupted = isRunning();
    const historyOffsets = new Map<string, number>();
    for (const [id, { element }] of currentRows ?? []) {
      const before = scene?.history.get(id);
      if (before)
        historyOffsets.set(
          id,
          before.top + (interrupted ? currentShift(element) : 0),
        );
    }
    if (interrupted) retainVisibleLayers(root, scene);

    const previousFeature = scene?.layers.get("data-pick-feature");
    const visibleFeature = root.querySelector<HTMLElement>(
      "[data-pick-feature]",
    );
    for (const { id } of readNumbers(root)) {
      const live = previousFeature?.querySelector(
        `[data-motion-number="${id}"]`,
      );
      const display = numbers.get(id);
      if (live && display) live.textContent = display.text;
    }
    stop(root);

    if (previousFeature && visibleFeature?.parentElement) {
      if (sameTier)
        previousFeature.querySelector("[data-draft-tier]")?.remove();
      previousFeature.dataset.leavingLayer = "data-pick-feature";
      visibleFeature.parentElement.append(previousFeature);
      removeAfter(
        previousFeature,
        animate(
          previousFeature,
          "outgoing-pick",
          [
            {
              transform: previousFeature.style.transform || "none",
              opacity: Number(previousFeature.style.opacity || 1),
            },
            { transform: "translateX(-36px) scale(0.985)", opacity: 0 },
          ],
          180,
          0,
          "ease-in",
        ),
      );
    }
    for (const [part, delay, duration, from] of featureParts) {
      animate(
        root.querySelector(`[data-feature-part="${part}"]`),
        "pick",
        [
          { opacity: 0, transform: from },
          { opacity: 1, transform: "none" },
        ],
        duration,
        delay,
      );
    }
    if (!sameTier) {
      animate(
        root.querySelector("[data-feature-tier] > [data-draft-tier]"),
        "tier",
        [
          { opacity: 0, transform: "scale(0.93)" },
          { opacity: 1, transform: "scale(1.06)", offset: 0.58 },
          { opacity: 1, transform: "scale(1)" },
        ],
        340,
        105,
        "ease-out",
      );
    }
    animate(
      root.querySelector("[data-border-glow]"),
      "border",
      [{ opacity: 0.92 }, { opacity: 1, offset: 0.08 }, { opacity: 0 }],
      900,
      0,
      "ease-out",
    );
    animate(
      root.querySelector("[data-star-sweep]"),
      "sweep",
      [
        { opacity: 0, transform: "translateX(-95%) skewX(-20deg)" },
        { opacity: 0.95, offset: 0.26 },
        { opacity: 0, transform: "translateX(150%) skewX(-20deg)" },
      ],
      580,
      0,
      "ease-out",
    );
    for (const [part, delay] of [
      ["portrait", 110],
      ["team", 240],
      ["tier", 150],
    ] as const) {
      if (part === "tier" && sameTier) continue;
      animate(
        root.querySelector(`[data-part-glow="${part}"]`),
        "glow",
        [{ opacity: 0 }, { opacity: 0.72, offset: 0.28 }, { opacity: 0 }],
        380,
        delay,
        "ease-out",
      );
    }

    for (const [id, { element: row, top }] of currentRows ?? []) {
      const before = historyOffsets.get(id);
      if (before === undefined) {
        animate(
          row,
          "history",
          [
            { transform: "translateY(-26px)", opacity: 0 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          420,
          historyDelay,
          "ease-out",
        );
        animate(
          row.querySelector("[data-history-glow]"),
          "history-glow",
          [{ opacity: 1 }, { opacity: 0 }],
          historyGlowDuration,
          historyDelay,
          "ease-out",
        );
      } else {
        const delta = before - top;
        if (delta)
          animate(
            row,
            "history-move",
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            460,
            historyDelay,
            "ease-out",
          );
      }
    }
    const list = root.querySelector("[data-history] ol");
    for (const [id, { copy }] of scene?.history ?? []) {
      if (currentRows?.has(id) || !list) continue;
      list.append(copy);
      removeAfter(
        copy,
        animate(
          copy,
          "history-exit",
          [
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(14px)" },
          ],
          460,
          historyDelay,
          "ease-out",
        ),
      );
    }

    if (sameTeam) {
      animate(
        root.querySelector("[data-turn-team-glow]"),
        "turn-team-pulse",
        [
          { opacity: 0, transform: "translateX(-70%)" },
          { opacity: 0.95, transform: "translateX(0)", offset: 0.4 },
          { opacity: 0, transform: "translateX(95%)" },
        ],
        460,
        220,
      );
    } else roll(root, scene, "data-turn-team");
    roll(root, scene, "data-turn-round");
    roll(root, scene, "data-turn-digit");
    animate(
      root.querySelector("[data-picking-pulse]"),
      "turn-ring",
      [
        { transform: "scale(1)", opacity: 0 },
        { transform: "scale(1.45)", opacity: 0.65, offset: 0.35 },
        { transform: "scale(1.8)", opacity: 0 },
      ],
      300,
      220,
      "ease-out",
    );
    animate(
      root.querySelector('[data-liru-position="header"]'),
      "mascot",
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-12px)", offset: 0.32 },
        { transform: "translateY(2px)", offset: 0.68 },
        { transform: "translateY(0)" },
      ],
      380,
      700,
    );

    const numberJobs = readNumbers(root).map((job) => ({
      ...job,
      from: numbers.get(job.id) ?? { number: null, text: "—" },
      progress: -1,
      format: new Intl.NumberFormat(
        job.id === "pp" || job.id === "rank" ? "en-US" : locale,
        {
          minimumFractionDigits: job.id === "etx" ? 2 : 0,
          maximumFractionDigits: job.id === "pp" || job.id === "rank" ? 0 : 2,
        },
      ),
    }));
    const radarJobs = readRadars(root).map((job) => {
      const { target } = job;
      const from =
        radars.get(job.id) ?? radarFrame(target.radii.map(() => null));
      const changing =
        from.fill !== target.fill ||
        from.radii.some(
          (value, index) =>
            value !== target.radii[index] ||
            from.visibility[index] !== target.visibility[index],
        );
      return { ...job, from, changing, progress: -1 };
    });
    const interpolationDuration = Math.max(
      0,
      ...numberJobs.map(({ from, target }) =>
        from.number === target.number
          ? 0
          : numberDelay +
            (from.number !== null && target.number !== null
              ? numberDuration
              : 155),
      ),
      ...radarJobs.map(({ changing, delay }) =>
        changing ? delay + radarDuration : 0,
      ),
    );
    for (const { element, glow, from, target } of numberJobs) {
      element.style.removeProperty("opacity");
      if (from.number === target.number) continue;
      animate(
        glow,
        "number-glow",
        [
          { opacity: 0 },
          { opacity: 0.9, offset: 0.17 },
          { opacity: 0.65, offset: 0.65 },
          { opacity: 0 },
        ],
        numberDuration,
        numberDelay,
      );
    }
    for (const { glow, changing, delay } of radarJobs) {
      if (!changing) continue;
      animate(
        glow,
        "radar-glow",
        [
          { opacity: 0 },
          { opacity: 0.92, offset: 0.24 },
          { opacity: 0.55, offset: 0.62 },
          { opacity: 0 },
        ],
        radarDuration,
        delay,
      );
    }
    function paint(elapsed: number) {
      const rolling = fraction(elapsed, numberDelay, numberDuration);
      const easedNumber = ease(rolling, radarEase);
      for (const job of numberJobs) {
        const { id, element, glow, from, target, format } = job;
        const fromNumber = from.number;
        const targetNumber = target.number;
        const numeric = fromNumber !== null && targetNumber !== null;
        const progress =
          from.number === target.number
            ? 1
            : numeric
              ? rolling
              : fraction(elapsed, numberDelay, 155);
        if (progress === job.progress) continue;
        job.progress = progress;
        let frame = target;
        if (numeric && progress < 1) {
          const number = interpolate(fromNumber, targetNumber, easedNumber);
          frame = {
            number,
            text: `${id === "rank" ? "#" : ""}${format.format(number)}`,
          };
        } else if (
          from.number !== target.number &&
          (from.number === null || target.number === null)
        ) {
          const switchAt = numberDelay + 60;
          frame = elapsed < switchAt ? from : target;
          const fade =
            elapsed < switchAt
              ? 1 - fraction(elapsed, numberDelay, 60)
              : fraction(elapsed, switchAt, 95);
          element.style.opacity = fade === 1 ? "" : String(fade);
        }
        if (element.textContent !== frame.text)
          element.textContent = frame.text;
        const highlight = frame.number === null ? "" : frame.text;
        if (glow && glow.textContent !== highlight)
          glow.textContent = highlight;
        numbers.set(id, frame);
      }
      for (const job of radarJobs) {
        const { id, from, target, paint, delay, changing } = job;
        if (!changing) continue;
        const fractionComplete = fraction(elapsed, delay, radarDuration);
        if (fractionComplete === job.progress) continue;
        job.progress = fractionComplete;
        const progress = ease(fractionComplete, radarEase);
        const frame = {
          radii: target.radii.map((value, axis) =>
            interpolate(from.radii[axis], value, progress),
          ),
          visibility: target.visibility.map((value, axis) =>
            interpolate(from.visibility[axis], value, progress),
          ),
          fill: interpolate(from.fill, target.fill, progress),
        };
        paint(frame);
        radars.set(id, frame);
      }
    }
    paint(0);
    let start: number | undefined;
    function tick(now: number) {
      if (start === undefined) {
        start = now;
        deadline = start + revealDuration;
      }
      const elapsed = now - start;
      paint(elapsed);
      if (elapsed < interpolationDuration) {
        request = requestAnimationFrame(tick);
      } else {
        request = 0;
        if (refreshAfterInterpolation) {
          refreshAfterInterpolation = false;
          sync(root);
        }
      }
    }
    request = requestAnimationFrame(tick);
  }

  return {
    reveal,
    stop,
    sync,
    refresh(root: HTMLElement) {
      if (request) refreshAfterInterpolation = true;
      else sync(root);
    },
    get running() {
      return isRunning();
    },
  };
}
