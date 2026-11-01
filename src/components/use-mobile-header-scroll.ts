"use client";

import { useEffect, useState, type RefObject } from "react";

/** Direction thresholds keep small scroll corrections from flickering the bar. */
export function useMobileHeaderScroll(
  root: RefObject<HTMLElement | null>,
  locked: boolean,
  route: string,
) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const header = root.current;
    if (!header) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    // Safari can report negative/top or beyond-bottom positions while bouncing.
    const position = () =>
      Math.max(
        0,
        Math.min(
          window.scrollY,
          Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          ),
        ),
      );
    let previous = position();
    let direction = 0;
    let distance = 0;
    let frame = 0;
    const reveal = () => {
      setHidden(false);
      previous = position();
      direction = 0;
      distance = 0;
    };
    const update = () => {
      frame = 0;
      const current = position();
      if (
        !mobile.matches ||
        locked ||
        current <= 96 ||
        header.querySelector(
          ':focus-visible, [aria-haspopup="menu"][aria-expanded="true"]',
        )
      ) {
        reveal();
        return;
      }
      const delta = current - previous;
      previous = current;
      if (!delta) return;
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) {
        direction = nextDirection;
        distance = 0;
      }
      distance += Math.abs(delta);
      if (direction > 0 && distance >= 40) setHidden(true);
      if (direction < 0 && distance >= 12) setHidden(false);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Mobile browser chrome/keyboard resizes must not reveal a hidden header.
    const resize = () => {
      previous = position();
      distance = 0;
      direction = 0;
    };
    reveal();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("pageshow", reveal);
    mobile.addEventListener("change", reveal);
    header.addEventListener("focusin", reveal);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pageshow", reveal);
      mobile.removeEventListener("change", reveal);
      header.removeEventListener("focusin", reveal);
    };
  }, [root, locked, route]);
  return hidden;
}
