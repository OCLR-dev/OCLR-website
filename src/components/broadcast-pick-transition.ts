import {
  paintRadar,
  radarFrame,
  type RadarFrame,
} from "./broadcast-radar-motion";

const revealEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const radarEase = [0.22, 1, 0.36, 1] as const;
const statRollDelay = 140;
const statRollStagger = 30;
const statRollDuration = 320;
const rollIn = [
  { transform: "translateY(100%)", opacity: 0 },
  { transform: "translateY(0)", opacity: 1 },
];
const radarDelay = { etx: 220, sip: 300 };
const radarDuration = 680;
const historyDelay = 140;
const historyGlowDuration = 950;
const revealDuration = historyDelay + historyGlowDuration;
const finalPickDisplayDuration = 3500;
export const finalPickHold = revealDuration + finalPickDisplayDuration;
const featureParts = [
  ["portrait", 110, 460, "translateX(28px) scale(0.88)"],
  ["heading", 110, 400, "translateY(18px)"],
  ["name", 160, 480, "translateX(36px)"],
  ["appearance", 200, 400, "translateX(24px)"],
  ["team", 240, 460, "translateX(28px)"],
] as const;

const savedLayers = [
  "data-pick-feature",
  "data-turn-team",
  "data-turn-round",
  "data-turn-digit",
] as const;

const closingLayers = [
  [
    "[data-featured]",
    "[data-pick-feature]",
    0,
    260,
    "translateY(-16px) scale(0.985)",
  ],
  [
    "[data-stream-chat]",
    '[data-liru-position="header"]',
    0,
    200,
    "translateY(-10px) scale(0.86)",
  ],
  ["[data-ratings]", "[data-rating-display]", 60, 280, "scale(0.92)"],
  ["[data-turn-card]", "[data-turn-heading]", 140, 220, "translateY(-10px)"],
  ["[data-turn-card]", "[data-turn-info]", 140, 220, "translateY(-10px)"],
] as const;

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

export function captureClosingScene(overlay: HTMLElement) {
  // Position each copy against its card, whose layout stays fixed during the
  // transition. Read all boxes and in-flight styles before building copies.
  const measured = closingLayers.flatMap(
    ([card, selector, delay, duration, exit]) => {
      const container = overlay.querySelector<HTMLElement>(card);
      const element = container?.querySelector<HTMLElement>(selector);
      if (!container || !element) return [];
      const { left, top } = container.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const animated = new Set(
        element
          .getAnimations({ subtree: true })
          .map(({ effect }) =>
            effect instanceof KeyframeEffect ? effect.target : null,
          ),
      );
      const styles = Array.from(element.querySelectorAll("*")).flatMap(
        (child, index) => {
          if (!animated.has(child)) return [];
          const { opacity, transform, color } = getComputedStyle(child);
          return [{ index, opacity, transform, color }];
        },
      );
      return [
        {
          container,
          delay,
          duration,
          exit,
          styles,
          layer: {
            element,
            left: box.left - left - container.clientLeft + container.scrollLeft,
            top: box.top - top - container.clientTop + container.scrollTop,
            width: box.width,
            height: box.height,
          },
        },
      ];
    },
  );
  return measured.map(({ layer, styles, ...entry }) => {
    const copy = copyLayer(layer);
    copy.dataset.outgoingClosing = "";
    const children = copy.querySelectorAll<HTMLElement | SVGElement>("*");
    for (const { index, ...style } of styles)
      Object.assign(children[index].style, {
        ...style,
        animation: "none",
        transition: "none",
      });
    for (const attribute of savedLayers) {
      copy.removeAttribute(attribute);
      copy
        .querySelectorAll(`[${attribute}]`)
        .forEach((node) => node.removeAttribute(attribute));
    }
    copy.querySelector("#broadcast-ratings-heading")?.removeAttribute("id");
    return { ...entry, copy };
  });
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
  animate(incoming, "turn", rollIn, 330, 350);
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
    radars.clear();
    for (const { id, target, paint } of readRadars(root)) {
      paint(target);
      radars.set(id, target);
    }
  }

  function revealClosing(
    root: HTMLElement,
    outgoing: ReturnType<typeof captureClosingScene>,
  ) {
    for (const { container, copy, delay, duration, exit } of outgoing) {
      container.append(copy);
      const ring = copy.querySelector("[data-picking-status]");
      animate(
        ring,
        "closing-ring",
        [{ transform: "scale(1)" }, { transform: "scale(0.5)" }],
        duration,
        delay,
      );
      removeAfter(
        copy,
        animate(
          copy,
          "closing-out",
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: exit },
          ],
          duration,
          delay,
        ),
      );
    }

    const title = root.querySelector("[data-closing-title]");
    animate(
      title,
      "closing-title",
      [
        { transform: "translateY(22px) scale(0.96)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      580,
      220,
    );
    title?.animate([{ color: "#ffffff" }, { color: "#e9b8fc" }], {
      id: "oclr-closing-title-settle",
      duration: 180,
      delay: 800,
      easing: "ease-out",
    });
    animate(
      root.querySelector('[data-liru-position="selection"]'),
      "closing-liru",
      [
        { transform: "translateY(24px) scale(0.92)", opacity: 0 },
        { transform: "translateY(-4px) scale(1.02)", opacity: 1, offset: 0.65 },
        { transform: "none", opacity: 1 },
      ],
      580,
      280,
    );
    animate(
      root.querySelector("[data-closing-message]"),
      "closing-message",
      [
        { transform: "translateY(18px)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      640,
      340,
    );
    animate(
      root.querySelector("[data-ratings-glow]"),
      "closing-ratings-glow",
      [{ opacity: 0 }, { opacity: 0.42, offset: 0.28 }, { opacity: 0 }],
      640,
      340,
    );
    animate(
      root.querySelector("[data-border-glow]"),
      "closing-border",
      [{ opacity: 0.66 }, { opacity: 0.75, offset: 0.15 }, { opacity: 0 }],
      1100,
      100,
    );
    animate(
      root.querySelector("[data-star-sweep]"),
      "closing-sweep",
      [
        {
          transform: "translateX(-95%) skewX(-20deg) scaleX(1.18)",
          opacity: 0,
        },
        { opacity: 0.6, offset: 0.29 },
        {
          transform: "translateX(150%) skewX(-20deg) scaleX(1.18)",
          opacity: 0,
        },
      ],
      760,
      180,
    );
    for (const selector of ["[data-turn-label]", "[data-turn-team]"])
      animate(root.querySelector(selector), "closing-turn", rollIn, 460, 300);
    animate(
      root.querySelector("[data-turn-digit]"),
      "closing-order",
      [
        { color: "#f4f3fc" },
        { color: "#ffffff", offset: 0.23 },
        { color: "#f4f3fc" },
      ],
      380,
      360,
    );
  }

  function reveal(
    root: HTMLElement,
    scene: Scene | undefined,
    nextScene: Scene | undefined,
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
    const previousStats = scene?.layers
      .get("data-pick-feature")
      ?.querySelectorAll<HTMLElement>("[data-motion-number]");
    if (interrupted) retainVisibleLayers(root, scene);

    const previousFeature = scene?.layers.get("data-pick-feature");
    const visibleFeature = root.querySelector<HTMLElement>(
      "[data-pick-feature]",
    );
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
    visibleFeature
      ?.querySelectorAll<HTMLElement>("[data-motion-number]")
      .forEach((value, index) => {
        const previous = previousStats?.[index]?.textContent ?? "—";
        if (value.textContent === "—" && previous === "—") return;
        const delay = statRollDelay + index * statRollStagger;
        animate(value, "stat-roll", rollIn, statRollDuration, delay);
        value.animate([{ color: "#ffffff" }, { color: "#f4f3fc" }], {
          id: "oclr-stat-settle",
          duration: 110,
          delay: delay + statRollDuration,
          easing: "ease-out",
        });
      });
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
      ...radarJobs.map(({ changing, delay }) =>
        changing ? delay + radarDuration : 0,
      ),
    );
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
    revealClosing,
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
