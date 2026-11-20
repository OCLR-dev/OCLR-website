/** Additive v1 saved-read contract; full-site adapters require at least 1.2.0. */
export const readContractVersion = "1.45.0";
export const readContractHeader = "X-OCLR-Read-Contract";
export function profileRatingsParameter(value: string | null | undefined) {
  const version = /^1\.(\d+)\.(\d+)$/.exec(value ?? "");
  if (!version) return undefined;
  const minor = Number(version[1]);
  if (minor >= 43) return "2";
  if (minor >= 39) return "1";
}
export function supportsProfileRatings(value: string | null | undefined) {
  return profileRatingsParameter(value) !== undefined;
}
export function supportsFullSiteRead(value: string | null) {
  const version = /^1\.(\d+)\.(\d+)$/.exec(value ?? "");
  return !!version && Number(version[1]) >= 2;
}
