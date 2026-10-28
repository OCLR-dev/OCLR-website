/** WCAG relative luminance for an opaque six-digit sRGB colour. */
export function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** Black or white, whichever gives the greater text contrast. */
export function contrastInk(background: string) {
  const luminance = relativeLuminance(background);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? "#000000"
    : "#ffffff";
}
