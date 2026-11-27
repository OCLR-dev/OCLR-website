const layers = [
  "data-pick-feature",
  "data-pick-ratings",
  "data-pick-turn",
] as const;
const timing = { duration: 600, easing: "cubic-bezier(0.45, 0, 0.25, 1)" };

type Layer = (typeof layers)[number];
type LayerCopies = Map<Layer, HTMLElement>;

export function copyPickLayers(overlay: HTMLElement, hasPick: boolean) {
  const copies: LayerCopies = new Map();
  for (const attribute of layers) {
    if (!hasPick && attribute !== "data-pick-turn") continue;
    const element = overlay.querySelector<HTMLElement>(`[${attribute}]`);
    if (!element) continue;
    const copy = element.cloneNode(true) as HTMLElement;
    copy.removeAttribute(attribute);
    copy.setAttribute("data-outgoing-pick", "");
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    Object.assign(copy.style, {
      top: `${element.offsetTop}px`,
      left: `${element.offsetLeft}px`,
      width: `${element.offsetWidth}px`,
      height: `${element.offsetHeight}px`,
    });

    // Each radar owns an SVG fill gradient. The outgoing copy needs its own ID.
    const copiedIds = new Map<string, string>();
    for (const node of copy.querySelectorAll("[id]")) {
      const copiedId = `${node.id}-outgoing-pick`;
      copiedIds.set(node.id, copiedId);
      node.id = copiedId;
    }
    for (const node of copy.querySelectorAll("[fill]")) {
      const id = node.getAttribute("fill")?.match(/^url\(#(.+)\)$/)?.[1];
      const copiedId = id && copiedIds.get(id);
      if (copiedId) node.setAttribute("fill", `url(#${copiedId})`);
    }
    copies.set(attribute, copy);
  }
  return copies;
}

export function transitionPickLayers(
  overlay: HTMLElement,
  previous: LayerCopies | undefined,
) {
  const feature = overlay.querySelector<HTMLElement>("[data-pick-feature]");
  const outgoing = previous?.get("data-pick-feature");
  if (feature?.parentElement) {
    // Both clips share the same moving edge, keeping the handoff visible throughout.
    feature.animate(
      [{ clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)" }],
      { ...timing, id: "oclr-pick" },
    );
    moveFeatureContents(feature, "2rem", "0");
    if (outgoing) {
      feature.parentElement.append(outgoing);
      moveFeatureContents(outgoing, "0", "-2rem");
      removeAfterAnimation(
        outgoing,
        [{ clipPath: "inset(0 0% 0 0)" }, { clipPath: "inset(0 100% 0 0)" }],
        { ...timing, fill: "forwards", id: "oclr-outgoing-pick" },
      );
    }
  }

  const ratings = overlay.querySelector<HTMLElement>("[data-pick-ratings]");
  if (!ratings?.parentElement) return;
  const outgoingRatings = previous?.get("data-pick-ratings");
  ratings.animate([{ opacity: outgoingRatings ? 0 : 0.84 }, { opacity: 1 }], {
    ...timing,
    id: "oclr-pick-ratings",
  });
  if (!outgoingRatings) return;
  ratings.parentElement.append(outgoingRatings);
  removeAfterAnimation(outgoingRatings, [{ opacity: 1 }, { opacity: 0 }], {
    ...timing,
    fill: "forwards",
    id: "oclr-outgoing-pick",
  });
}

export function transitionTurnLayer(
  overlay: HTMLElement,
  previous: LayerCopies | undefined,
) {
  const turn = overlay.querySelector<HTMLElement>("[data-pick-turn]");
  if (!turn?.parentElement) return;
  turn.animate(
    [
      { transform: "translateY(0.75rem)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { ...timing, id: "oclr-turn" },
  );
  const outgoing = previous?.get("data-pick-turn");
  if (!outgoing) return;
  turn.parentElement.append(outgoing);
  removeAfterAnimation(
    outgoing,
    [
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(-0.75rem)", opacity: 0 },
    ],
    { ...timing, fill: "forwards", id: "oclr-outgoing-turn" },
  );
}

function moveFeatureContents(layer: HTMLElement, from: string, to: string) {
  for (const content of layer.children) {
    content.animate(
      [
        { transform: `translateX(${from})` },
        { transform: `translateX(${to})` },
      ],
      { ...timing, id: "oclr-pick-motion" },
    );
  }
}

function removeAfterAnimation(
  element: HTMLElement,
  frames: Keyframe[],
  timing: KeyframeAnimationOptions,
) {
  const remove = () => element.remove();
  void element.animate(frames, timing).finished.then(remove, remove);
}
