import assets from "./country-flag-assets.json";

/** Only pinned local Twemoji flags are supported, including EU, UN and XK.
 * Never derive an asset URL from unchecked profile data. */
export function countryFlagData(
  code: string | null | undefined,
  locale: string,
) {
  const input = code?.trim();
  if (!input || !/^[a-z]{2}$/i.test(input)) return null;
  const normalized = input.toUpperCase();
  if (!Object.hasOwn(assets, normalized)) return null;
  const asset = assets[normalized as keyof typeof assets];
  let name = normalized;
  try {
    name =
      new Intl.DisplayNames([locale, "en"], {
        type: "region",
        fallback: "none",
      }).of(normalized) ?? normalized;
  } catch {
    // A malformed locale must not break identity rendering.
    name =
      new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ??
      normalized;
  }
  return {
    code: normalized,
    name,
    src: `/flags/twemoji/${asset.file}`,
    width: asset.width,
    height: asset.height,
  };
}
