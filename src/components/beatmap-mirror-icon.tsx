import type { BeatmapMirror } from "@/lib/mappool-download";
import { GitHubMark } from "./github-mark";

export function BeatmapMirrorIcon({ mirror }: { mirror: BeatmapMirror }) {
  if (mirror.icon === "github") return <GitHubMark size={18} />;
  if (!mirror.icon)
    return (
      <span className="beatmap-mirror-initial" aria-hidden="true">
        {mirror.name[0]?.toUpperCase()}
      </span>
    );

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {mirror.icon === "beatconnect" && (
        // Redrawn from beatconnect.io/apple-touch-icon.png.
        <>
          <path fill="#6812cc" d="m12 3 11 11-11 10L1 14Z" />
          <path
            fill="#fff"
            stroke="#6812cc"
            strokeWidth=".65"
            d="m12 .6 10.6 10.6L12 21.8 1.4 11.2Z"
          />
          <path
            fill="#6812cc"
            fillRule="evenodd"
            d="m12 3.4 7.8 7.8-7.8 7.8-7.8-7.8Zm0 4.2-3.6 3.6 3.6 3.6 3.6-3.6Z"
          />
          <path fill="#6812cc" d="m12 9.9 1.3 1.3-1.3 1.3-1.3-1.3Z" />
        </>
      )}
      {mirror.icon === "catboy" && (
        // Redrawn from the Mino mascot at catboy.best/static/img/mino.png.
        <>
          <path
            fill="none"
            stroke="#3898cb"
            strokeLinecap="round"
            strokeWidth="2.3"
            d="M8 15c-3 3-8 1-6-3l2-3c1.5-2-1.5-3.5-2-2"
          />
          <path
            fill="#f9fdff"
            stroke="#6544c9"
            strokeLinejoin="round"
            strokeWidth="1.4"
            d="M7.5 8C6 6 6 4 6 2c1.5 1.4 3 2.2 4.1 2.8a7 7 0 0 1 5.5 0L21 2.9c.2 2.8-.7 4.2-2.2 5.5.6 2.2-.3 3.3 1.1 5.1 1.9 1.8 2.5 2.8 2.2 4.4-.4 1.7-2.4 1.8-4.2 1.6-2.4-.1-2.3 2.6-5.5 2.6-2 0-2.1-1.8-3.4-1.6-2.8.5-3-1.8-2.3-4.5.6-2.5-.6-4.7.8-8Z"
          />
          <path
            fill="#a6c6dc"
            d="M8 11.5c1.7 3 6 3.4 8 1 .7 2.1 2.6 3.5 3.6 5.7-1.1.9-3.8-.9-5.6 2-1.4 2.2-3.3.8-4-.5-1-.3-2.2.7-2.7-.5-.7-1.7 1-5.4.7-7.7Z"
          />
          <circle cx="10.5" cy="9.8" r="1.25" fill="#4744cf" />
          <circle cx="15.7" cy="9.8" r="1.25" fill="#7a3dce" />
          <path
            fill="none"
            stroke="#5845c9"
            strokeLinecap="round"
            strokeWidth=".75"
            d="M10.9 12.3c.6 1 1.4 1 2 .5.5.5 1.3.5 1.9-.5"
          />
        </>
      )}
    </svg>
  );
}
