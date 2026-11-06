/** Merges osu! profile aliases with roster names, dropping the current name. */
export function previousUsernames(
  provided: readonly string[],
  roster: readonly string[],
  current: string,
): string[] {
  const currentKey = current.toLowerCase();
  return [...new Set([...provided, ...roster])].filter(
    (name) => name.toLowerCase() !== currentKey,
  );
}
