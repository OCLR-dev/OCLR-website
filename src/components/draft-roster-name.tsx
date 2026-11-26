"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./draft-roster-name.module.css";

export function DraftRosterName({
  osuId,
  username,
}: {
  osuId: number;
  username: string;
}) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const name = nameRef.current;
    if (!viewport || !name) return;

    const measure = () => {
      setOverflow(Math.max(0, name.offsetWidth - viewport.clientWidth));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(name);
    measure();
    return () => observer.disconnect();
  }, [username]);

  return (
    <a
      className="context-link"
      href={`https://osu.ppy.sh/users/${osuId}`}
      title={username}
    >
      <span className={styles.viewport} ref={viewportRef}>
        <span
          className={styles.name}
          ref={nameRef}
          data-overflow={overflow > 1 || undefined}
          style={
            {
              "--name-offset": `-${overflow}px`,
              "--name-duration": `${Math.max(2.5, overflow / 28 + 1)}s`,
            } as CSSProperties
          }
        >
          {username}
        </span>
      </span>
    </a>
  );
}
