/** Split a number into the large integer part and the smaller fraction. */
export function formatStat(value: number | null, digits: number, suffix = "") {
  if (value === null || !Number.isFinite(value)) {
    return { text: "—", integer: "—", fraction: "" };
  }
  const [integer, fraction = ""] = value.toFixed(digits).split(".");
  if (digits === 0) {
    const text = `${integer}${suffix}`;
    return { text, integer: text, fraction: "" };
  }
  const trimmed = fraction.replace(/0+$/, "");
  if (!trimmed) {
    return { text: `${integer}${suffix}`, integer, fraction: suffix };
  }
  return {
    text: `${integer}.${trimmed}${suffix}`,
    integer,
    fraction: `.${trimmed}${suffix}`,
  };
}
