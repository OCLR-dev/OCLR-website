/** Reuse the homepage lettering, cropped to OCLR without the subtitle/bar. */
export function OclrLogo() {
  return (
    <svg
      className="oclr-wordmark"
      viewBox="48 104 980 304"
      width="132"
      height="41"
      overflow="hidden"
      aria-hidden="true"
      focusable="false"
    >
      <image
        href="/branding/home-s11/oclr-layer.svg"
        x="40"
        y="0"
        width="1200"
        height="490"
      />
    </svg>
  );
}
