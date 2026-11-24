/** Liru by JerrYamada, CC BY 4.0. Monochrome redrawing for the chat interface. */
export function LiruChatIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M24 9c-5-1-7-4-5-7 0 4 3 4 5 5 2-4 6-5 10-3-4 0-6 2-7 5" />
        <path d="M24 9C13 8 8 16 7 23c-.5 4-3 6-5 7 3 1 5 1 7 0l-2 5 5-2c-1 5 1 8 4 11l1-7c4 5 12 6 17 1l1 6c4-3 5-8 4-12l5 2-2-5 4 1c-4-3-5-5-6-9-2-8-8-12-16-12Z" />
        <path d="M13 31c1-8 4-13 8-16-2 4-2 8-2 10 3-2 6-5 8-9 1 3 1 6-1 11 4-2 6-4 7-8 2 4 3 8 2 13" />
        <path d="M13 31c1 5 5 9 11 9s10-3 12-9M16 29h5m6 0h6" />
      </g>
      <g fill="currentColor">
        <path d="M16.5 29h4v3a2 2 0 0 1-4 0zm11 0h4v3a2 2 0 0 1-4 0z" />
        <path d="M22 35q2 1.6 4 0-.8 3.6-4 0Z" />
      </g>
    </svg>
  );
}
