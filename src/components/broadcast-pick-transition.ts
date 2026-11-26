const layers = [
  ["data-pick-heading", "oclr-pick"],
  ["data-pick-player", "oclr-pick"],
  ["data-pick-ratings", "oclr-pick-ratings"],
] as const;

type Layer = (typeof layers)[number][0];
type LayerCopies = Map<Layer, HTMLElement>;

export function copyPickLayers(overlay: HTMLElement) {
  const copies: LayerCopies = new Map();
  for (const [attribute] of layers) {
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

export function crossfadePickLayers(
  overlay: HTMLElement,
  previous: LayerCopies | undefined,
) {
  const timing: KeyframeAnimationOptions = {
    duration: 440,
    easing: "ease-in-out",
  };
  for (const [attribute, id] of layers) {
    const incoming = overlay.querySelector<HTMLElement>(`[${attribute}]`);
    if (!incoming?.parentElement) continue;
    const outgoing = previous?.get(attribute);
    incoming.animate([{ opacity: outgoing ? 0 : 0.84 }, { opacity: 1 }], {
      ...timing,
      id,
    });
    if (!outgoing) continue;
    incoming.parentElement.append(outgoing);
    const fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...timing,
      fill: "forwards",
      id: "oclr-outgoing-pick",
    });
    const remove = () => outgoing.remove();
    void fade.finished.then(remove, remove);
  }
}
