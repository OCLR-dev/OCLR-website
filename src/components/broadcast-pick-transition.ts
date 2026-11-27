const featuredLayers = ["data-pick-heading", "data-pick-player"] as const;
const layers = [...featuredLayers, "data-pick-ratings"] as const;

type Layer = (typeof layers)[number];
type LayerCopies = Map<Layer, HTMLElement>;

export function copyPickLayers(overlay: HTMLElement) {
  const copies: LayerCopies = new Map();
  for (const attribute of layers) {
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
  const selection = overlay.querySelector<HTMLElement>("[data-featured]");
  const wipeDuration = 420;
  const delay =
    selection && previous?.has("data-pick-player") ? wipeDuration : 0;
  if (selection && previous && delay) {
    wipePreviousPick(selection, previous, wipeDuration);
  }

  for (const attribute of featuredLayers) {
    const incoming = overlay.querySelector<HTMLElement>(`[${attribute}]`);
    incoming?.animate(
      [
        { transform: "translateX(100%)", opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      {
        delay,
        duration: 500,
        easing: "ease-out",
        fill: "backwards",
        id: "oclr-pick",
      },
    );
  }

  const ratings = overlay.querySelector<HTMLElement>("[data-pick-ratings]");
  if (!ratings?.parentElement) return;
  const outgoingRatings = previous?.get("data-pick-ratings");
  const timing = { delay, duration: 440, easing: "ease-in-out" };
  ratings.animate([{ opacity: outgoingRatings ? 0 : 0.84 }, { opacity: 1 }], {
    ...timing,
    fill: "backwards",
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

function wipePreviousPick(
  selection: HTMLElement,
  previous: LayerCopies,
  duration: number,
) {
  const outgoing = document.createElement("div");
  outgoing.setAttribute("data-outgoing-pick", "");
  outgoing.setAttribute("data-pick-clear", "");
  outgoing.setAttribute("aria-hidden", "true");
  for (const attribute of featuredLayers) {
    const layer = previous.get(attribute);
    if (layer) outgoing.append(layer);
  }
  const sweep = document.createElement("div");
  sweep.setAttribute("data-pick-wipe", "");
  sweep.setAttribute("aria-hidden", "true");
  selection.append(outgoing, sweep);

  // The clip follows the leading edge of the sweep in panel coordinates.
  const finishClearing = 0.8;
  const timing = { duration, easing: "ease-in-out", fill: "forwards" } as const;
  removeAfterAnimation(
    outgoing,
    [
      { clipPath: "inset(0 0 0 0)" },
      { clipPath: "inset(0 100% 0 0)", offset: finishClearing },
      { clipPath: "inset(0 100% 0 0)" },
    ],
    { ...timing, id: "oclr-outgoing-pick" },
  );
  removeAfterAnimation(
    sweep,
    [
      { transform: "translateX(100%)" },
      { transform: "translateX(0)", offset: finishClearing },
      { transform: "translateX(calc(-1 * var(--pick-wipe-width)))" },
    ],
    { ...timing, id: "oclr-pick-wipe" },
  );
}

function removeAfterAnimation(
  element: HTMLElement,
  frames: Keyframe[],
  timing: KeyframeAnimationOptions,
) {
  const remove = () => element.remove();
  void element.animate(frames, timing).finished.then(remove, remove);
}
