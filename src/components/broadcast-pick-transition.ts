import {
  paintRadar,
  radarFrame,
  type RadarFrame,
} from "./broadcast-radar-motion";

const revealEase = "cubic-bezier(0.16, 1, 0.3, 1)";
const radarEase = [0.22, 1, 0.36, 1] as const;
const featureParts = [
  ["portrait", 80, 380, "scale(0.94)"],
  ["heading", 80, 350, "translateY(8px)"],
  ["name", 120, 400, "translateY(12px)"],
  ["appearance", 150, 340, "translateY(8px)"],
  ["stats", 105, 300, "translateY(6px)"],
  ["team", 170, 350, "translateY(12px)"],
] as const;

const savedLayers = [
  "data-pick-feature",
  "data-turn-team",
  "data-turn-round",
  "data-turn-digit",
] as const;

type NumberFrame = { number: number | null; text: string };
type Layer = (typeof savedLayers)[number];
type HistoryRow = { top: number; copy: HTMLElement };
type Scene = {
  layers: Map<Layer, HTMLElement>;
  history: Map<string, HistoryRow>;
};

function copyLayer(element: HTMLElement) {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.setAttribute("data-outgoing-pick", "");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  Object.assign(copy.style, {
    top: `${element.offsetTop}px`,
    left: `${element.offsetLeft}px`,
    width: `${element.offsetWidth}px`,
    height: `${element.offsetHeight}px`,
  });
  return copy;
}

export function captureBroadcastScene(overlay: HTMLElement): Scene {
  const layers = new Map<Layer, HTMLElement>();
  for (const attribute of savedLayers) {
    const element = overlay.querySelector<HTMLElement>(`[${attribute}]`);
    if (!element) continue;
    const copy = copyLayer(element);
    copy.removeAttribute(attribute);
    layers.set(attribute, copy);
  }
  const history = new Map<string, HistoryRow>();
  overlay
    .querySelectorAll<HTMLElement>("[data-history-pick]")
    .forEach((row) => {
      const copy = copyLayer(row);
      copy.removeAttribute("data-history-pick");
      history.set(row.dataset.historyPick!, { top: row.offsetTop, copy });
    });
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

function freezeLayer(source: HTMLElement, target: HTMLElement) {
  const style = getComputedStyle(source);
  target.style.opacity = style.opacity;
  target.style.transform = style.transform;
}

function retainVisibleLayers(root: HTMLElement, scene: Scene | undefined) {
  if (!scene) return;
  for (const attribute of savedLayers) {
    const target = scene.layers.get(attribute);
    const current = root.querySelector<HTMLElement>(`[${attribute}]`);
    if (!target || !current) continue;
    const alreadyLeaving = root.querySelector<HTMLElement>(
      `[data-leaving-layer="${attribute}"]`,
    );
    if (
      alreadyLeaving &&
      Number(getComputedStyle(alreadyLeaving).opacity) >
        Number(getComputedStyle(current).opacity) *
          (attribute === "data-pick-feature" ? 0.35 : 1)
    ) {
      const copy = alreadyLeaving.cloneNode(true) as HTMLElement;
      freezeLayer(alreadyLeaving, copy);
      scene.layers.set(attribute, copy);
      continue;
    }
    freezeLayer(current, target);
    if (attribute !== "data-pick-feature") continue;
    for (const [part] of featureParts) {
      const selector = `[data-feature-part="${part}"]`;
      const live = current.querySelector<HTMLElement>(selector);
      const copy = target.querySelector<HTMLElement>(selector);
      if (live && copy) freezeLayer(live, copy);
    }
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
    (element) => ({
      paint: paintRadar(element),
      id: element.dataset.motionRadar!,
      target: radarFrame(
        JSON.parse(element.dataset.radii!) as (number | null)[],
      ),
    }),
  );
}

function roll(
  root: HTMLElement,
  scene: Scene | undefined,
  attribute: "data-turn-team" | "data-turn-round" | "data-turn-digit",
  distance: string,
) {
  const incoming = root.querySelector<HTMLElement>(`[${attribute}]`);
  const outgoing = scene?.layers.get(attribute);
  if (incoming?.textContent === outgoing?.textContent) return;
  // The duration includes the brief overlap, without overlapping the text baselines.
  animate(
    incoming,
    "turn",
    [
      { transform: `translateY(${distance})`, opacity: 0 },
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
        { transform: `translateY(-${distance})`, opacity: 0 },
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
  const numbers = new Map<string, NumberFrame>();
  const radars = new Map<string, RadarFrame>();

  function stop(root: HTMLElement) {
    cancelAnimationFrame(request);
    request = 0;
    deadline = 0;
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
    locale: string,
    sameTier: boolean,
    sameTeam: boolean,
  ) {
    if (performance.now() < deadline) retainVisibleLayers(root, scene);
    const historyOffsets = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-history-pick]").forEach((row) => {
      const id = row.dataset.historyPick!;
      const before = scene?.history.get(id);
      if (before) historyOffsets.set(id, before.top + currentShift(row));
    });

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
            { opacity: Number(previousFeature.style.opacity || 1) },
            { opacity: 0 },
          ],
          120,
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
      [{ opacity: 0 }, { opacity: 0.9, offset: 0.12 }, { opacity: 0 }],
      800,
      0,
      "ease-out",
    );
    animate(
      root.querySelector("[data-star-sweep]"),
      "sweep",
      [
        { opacity: 0, transform: "translateX(-95%) skewX(-20deg)" },
        { opacity: 0.62, offset: 0.24 },
        { opacity: 0, transform: "translateX(150%) skewX(-20deg)" },
      ],
      450,
      0,
      "ease-out",
    );
    for (const [part, delay] of [
      ["portrait", 80],
      ["team", 170],
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

    const currentRows = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-history-pick]").forEach((row) => {
      const id = row.dataset.historyPick!;
      currentRows.add(id);
      const before = historyOffsets.get(id);
      if (before === undefined) {
        animate(
          row,
          "history",
          [
            { transform: "translateY(-10px)", opacity: 0 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          420,
          140,
          "ease-out",
        );
        animate(
          row.querySelector("[data-history-glow]"),
          "history-glow",
          [{ opacity: 0.75 }, { opacity: 0 }],
          660,
          140,
          "ease-out",
        );
      } else {
        const delta = before - row.offsetTop;
        if (delta)
          animate(
            row,
            "history-move",
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            380,
            140,
            "ease-out",
          );
      }
    });
    const list = root.querySelector("[data-history] ol");
    for (const [id, { copy }] of scene?.history ?? []) {
      if (currentRows.has(id) || !list) continue;
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
          380,
          140,
          "ease-out",
        ),
      );
    }

    if (sameTeam) {
      animate(
        root.querySelector("[data-turn-team-glow]"),
        "turn-team-pulse",
        [{ opacity: 0 }, { opacity: 0.65, offset: 0.25 }, { opacity: 0 }],
        320,
        220,
      );
    } else roll(root, scene, "data-turn-team", "14px");
    roll(root, scene, "data-turn-round", "10px");
    roll(root, scene, "data-turn-digit", "100%");
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
        { transform: "translateY(-4px)", offset: 0.3 },
        { transform: "translateY(0)" },
      ],
      280,
      520,
    );

    const numberJobs = readNumbers(root).map((job) => ({
      ...job,
      from: numbers.get(job.id) ?? { number: null, text: "—" },
      format: new Intl.NumberFormat(
        job.id === "pp" || job.id === "rank" ? "en-US" : locale,
        {
          minimumFractionDigits: job.id === "etx" ? 2 : 0,
          maximumFractionDigits: job.id === "pp" || job.id === "rank" ? 0 : 2,
        },
      ),
    }));
    const radarJobs = readRadars(root).map((job) => ({
      ...job,
      from: radars.get(job.id) ?? radarFrame(job.target.radii.map(() => null)),
    }));
    for (const { element } of numberJobs)
      element.style.removeProperty("opacity");
    const start = performance.now();
    deadline = start + 800;
    function paint(now: number) {
      const elapsed = now - start;
      for (const { id, element, from, target, format } of numberJobs) {
        let frame = target;
        const progress = fraction(elapsed, 130, 380);
        if (progress < 1 && from.number !== null && target.number !== null) {
          const number = interpolate(
            from.number,
            target.number,
            ease(progress, radarEase),
          );
          frame = {
            number,
            text: `${id === "rank" ? "#" : ""}${format.format(number)}`,
          };
        } else if (
          from.number !== target.number &&
          (from.number === null || target.number === null)
        ) {
          frame = elapsed < 190 ? from : target;
          const fade =
            elapsed < 190
              ? 1 - fraction(elapsed, 130, 60)
              : fraction(elapsed, 190, 95);
          element.style.opacity = fade === 1 ? "" : String(fade);
        }
        if (element.textContent !== frame.text)
          element.textContent = frame.text;
        numbers.set(id, frame);
      }
      for (const { id, from, target, paint } of radarJobs) {
        const progress = ease(
          fraction(elapsed, id === "etx" ? 100 : 160, 500),
          radarEase,
        );
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
      request = elapsed < 660 ? requestAnimationFrame(paint) : 0;
    }
    paint(start);
  }

  return {
    reveal,
    stop,
    sync,
    get running() {
      return performance.now() < deadline;
    },
  };
}
