import { useId, type Ref } from "react";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";

export const galleryCardSize = { width: 1024, height: 1536 };
export const galleryCardPortrait = { x: 124, y: 132, width: 776, height: 1164 };

const finishes = {
  UR: {
    metal: ["#ffd7a2", "#a3e7fc", "#9964cf", "#fabfff", "#8095e9", "#ffe1b3"],
    ink: "#fff0fb",
    dark: "#1b122f",
    field: "#7452a2",
    line: "#ebc5fb",
    glow: "#df9cff",
  },
  SSR: {
    metal: ["#fff4bd", "#ba7a30", "#f2b958", "#fff1b8", "#926031", "#eac680"],
    ink: "#fff2cb",
    dark: "#281821",
    field: "#855a3d",
    line: "#f2ce86",
    glow: "#f2b95b",
  },
  SR: {
    metal: ["#ebf8ff", "#769ab8", "#557f9e", "#c5eafb", "#496a89", "#9cbed1"],
    ink: "#edf6ff",
    dark: "#112439",
    field: "#3d6f97",
    line: "#b4d7ed",
    glow: "#8bbff5",
  },
  R: {
    metal: ["#e0ebd6", "#7b8f7e", "#677e74", "#a9bfa9", "#657b70", "#a6b6a5"],
    ink: "#edf0e6",
    dark: "#182922",
    field: "#4d6d5e",
    line: "#c1cfb8",
    glow: "#87b399",
  },
};

const corners = [
  "translate(50 50)",
  "translate(974 50) scale(-1 1)",
  "translate(50 1486) scale(1 -1)",
  "translate(974 1486) scale(-1 -1)",
];

const stars = [
  [138, 270, 16],
  [842, 238, 22],
  [731, 357, 11],
  [233, 421, 9],
  [172, 669, 20],
  [862, 572, 14],
  [835, 916, 21],
  [153, 1049, 17],
  [785, 1140, 12],
  [270, 1181, 13],
];

export function WikiGalleryCard({
  figure,
  cardRef,
}: {
  figure: WikiGalleryFigure;
  cardRef: Ref<SVGSVGElement>;
}) {
  const id = useId();
  const { rarity, caption } = figure;
  const finish = finishes[rarity];
  const ornate = rarity === "UR" || rarity === "SSR";
  // Allocate space for wide glyphs in Chinese as well as longer English names.
  const titleUnits = Array.from(caption).reduce(
    (width, char) => width + (/[^\u0000-\u00ff]/.test(char) ? 1 : 0.68),
    0,
  );
  const fontSize = Math.min(54, 864 / Math.max(1, titleUnits));

  return (
    <svg
      ref={cardRef}
      className="wiki-gallery-card"
      data-rarity={rarity}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1536"
      width={galleryCardSize.width}
      height={galleryCardSize.height}
      role="img"
      aria-label={figure.alt}
      style={{ color: finish.glow }}
      fontFamily="system-ui, sans-serif"
    >
      <defs>
        <linearGradient id={`${id}-metal`} x2="80%" y2="100%">
          {finish.metal.map((color, index) => (
            <stop
              key={index}
              offset={index / (finish.metal.length - 1)}
              stopColor={color}
            />
          ))}
        </linearGradient>
        <radialGradient id={`${id}-field`} cy="46%" r="60%">
          <stop stopColor={finish.field} />
          <stop offset="1" stopColor={finish.dark} />
        </radialGradient>
        <pattern
          id={`${id}-weave`}
          width="54"
          height="54"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M27 0 54 27 27 54 0 27Z"
            fill="none"
            stroke={finish.line}
            strokeWidth="1.4"
            opacity=".2"
          />
          <circle cx="27" cy="27" r="2" fill={finish.line} opacity=".22" />
        </pattern>
      </defs>
      <rect width="1024" height="1536" rx="50" fill={`url(#${id}-metal)`} />
      <rect
        x="18"
        y="18"
        width="988"
        height="1500"
        rx="38"
        fill={finish.dark}
      />
      <rect
        x="30"
        y="30"
        width="964"
        height="1476"
        rx="29"
        fill={`url(#${id}-field)`}
      />
      {rarity !== "R" && (
        <rect
          x="42"
          y="42"
          width="940"
          height="1452"
          rx="24"
          fill={`url(#${id}-weave)`}
        />
      )}

      <g fill="none" stroke={finish.line}>
        <rect
          x="36"
          y="36"
          width="952"
          height="1464"
          rx="27"
          opacity=".72"
          strokeWidth="2"
        />
        {ornate && (
          <rect x="46" y="46" width="932" height="1444" rx="24" opacity=".48" />
        )}
        {corners.map((transform) => (
          <g key={transform} transform={transform}>
            <path d="M0 58V0h58M10 45V10h35" strokeWidth="2.5" />
            <path d="M22 15l7 7-7 7-7-7Z" fill={finish.line} stroke="none" />
            {ornate && (
              <path
                d="M2 112c0-52 24-74 49-67 17 5 16 28 0 28-9 0-12-9-6-14M112 2C60 2 38 26 45 51c5 17 28 16 28 0 0-9-9-12-14-6M6 83c19-3 34-15 35-34M83 6C80 25 68 40 49 41"
                strokeWidth="3"
              />
            )}
          </g>
        ))}
        {rarity === "SSR" && (
          <>
            <path
              d="M168 1116V529c0-182 140-315 344-385 204 70 344 203 344 385v587l-54 54H222Z"
              strokeWidth="5"
              opacity=".57"
            />
            <path
              d="M192 1106V529c0-163 133-291 320-359 187 68 320 196 320 359v577l-40 40H232Z"
              strokeWidth="2"
              opacity=".65"
            />
          </>
        )}
        {rarity === "UR" && (
          <>
            <ellipse
              cx="512"
              cy="701"
              rx="362"
              ry="472"
              transform="rotate(-21 512 701)"
              strokeWidth="5"
              opacity=".75"
            />
            <ellipse
              cx="512"
              cy="701"
              rx="341"
              ry="477"
              transform="rotate(24 512 701)"
              strokeWidth="2"
              opacity=".62"
            />
            <circle
              cx="512"
              cy="701"
              r="369"
              strokeWidth="2"
              strokeDasharray="3 13"
              opacity=".8"
            />
          </>
        )}
      </g>

      {ornate && (
        <g fill={finish.ink}>
          {(rarity === "UR" ? stars : stars.filter((_, i) => i % 2 === 0)).map(
            ([x, y, size]) => (
              <path
                key={x}
                transform={`translate(${x} ${y}) scale(${size / 12})`}
                d="M0-12 2.8-2.8 12 0 2.8 2.8 0 12-2.8 2.8-12 0-2.8-2.8Z"
              />
            ),
          )}
        </g>
      )}

      <path
        d="M400 67h224l19 27-19 27H400l-19-27Z"
        fill={ornate ? `url(#${id}-metal)` : finish.dark}
        stroke={finish.line}
        strokeWidth="2"
      />
      <text
        x="514"
        y="108"
        fill={ornate ? "#25182f" : finish.ink}
        fontSize="39"
        letterSpacing="5"
        fontWeight="800"
        textAnchor="middle"
      >
        {rarity}
      </text>
      <path
        d="M83 1331h335l15-10h158l15 10h335M108 1462h340l16 11h96l16-11h340"
        fill="none"
        stroke={finish.line}
        strokeWidth="2"
        opacity=".75"
      />
      {ornate && <path d="M512 1308l12 13-12 13-12-13Z" fill={finish.line} />}
      <text
        x="512"
        y="1419"
        fill={finish.ink}
        fontSize={fontSize}
        fontWeight="700"
        textAnchor="middle"
      >
        {caption}
      </text>
      <image {...galleryCardPortrait} href={figure.previewSrc} />
    </svg>
  );
}
