"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./previous-usernames.module.css";

// The loop leaves a readable gap before the first name repeats, and scrolls
// slowly enough that a name can be read and selected while the pointer rests
// on the viewport (where the animation pauses).
const LOOP_GAP = 32;
const PIXELS_PER_SECOND = 34;

/**
 * A single-line alias history. Short lists render inline; a list wider than the
 * capped viewport turns into a marquee that pauses on hover so the names stay
 * selectable.
 */
export function PreviousUsernames({
  names,
  label,
}: {
  names: readonly string[];
  label: string;
}) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const groupRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const namesText = names.join("\u0000");

  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;

    const measure = () => {
      const groupWidth = group.scrollWidth;
      const viewportWidth = viewport.clientWidth;
      const nextOverflowing = groupWidth > viewportWidth + 1;
      setOverflowing(nextOverflowing);
      setDistance(nextOverflowing ? groupWidth + LOOP_GAP : 0);
      setDuration(
        nextOverflowing
          ? Math.max(8, (groupWidth + LOOP_GAP) / PIXELS_PER_SECOND)
          : 0,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(group);
    return () => observer.disconnect();
  }, [namesText]);

  if (names.length === 0) return null;
  const content = names.join(", ");
  const style = {
    "--previous-names-distance": `${distance}px`,
    "--previous-names-duration": `${duration}s`,
    "--previous-names-gap": `${LOOP_GAP}px`,
  } as CSSProperties;

  return (
    <span
      className={styles.previousNames}
      data-overflowing={overflowing ? "true" : undefined}
    >
      <span className={styles.previousNamesLabel}>{label}:</span>
      <span className={styles.previousNamesViewport} ref={viewportRef}>
        <span className={styles.previousNamesTrack} style={style}>
          <span className={styles.previousNamesGroup} ref={groupRef}>
            {content}
          </span>
          {overflowing && (
            <span
              className={`${styles.previousNamesGroup} ${styles.previousNamesClone}`}
              aria-hidden="true"
            >
              {content}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
