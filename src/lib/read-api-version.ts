/** Additive v1 saved-read contract; full-site adapters require at least 1.2.0. */
export const readContractVersion = "1.42.0";
export const readContractHeader = "X-OCLR-Read-Contract";
export function supportsProfileRatings(value: string | null | undefined) {
  const version = /^1\.(\d+)\.(\d+)$/.exec(value ?? "");
  return !!version && Number(version[1]) >= 39;
}
export function supportsFullSiteRead(value: string | null) {
  const version = /^1\.(\d+)\.(\d+)$/.exec(value ?? "");
  return !!version && Number(version[1]) >= 2;
}
