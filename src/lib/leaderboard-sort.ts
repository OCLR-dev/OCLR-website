/** Split `total` controls into `rowCount` rows, earlier rows taking extras. */
export function balancedRowSizes(total: number, rowCount: number): number[] {
  if (total <= 0) return [];
  const rows = Math.max(1, Math.min(total, rowCount));
  const base = Math.floor(total / rows);
  const extra = total % rows;
  return Array.from({ length: rows }, (_, index) =>
    index < extra ? base + 1 : base,
  );
}

/**
 * Fit the controls into the fewest balanced rows the width allows. Counts stay
 * within one control of each other, so 16 controls over 3 rows read as
 * 6 + 5 + 5 instead of 6 + 6 + 4, and a final row never holds a lone control.
 */
export function fitSortRows(
  widths: number[],
  gap: number,
  available: number,
): number[] {
  for (let rows = 1; rows <= widths.length; rows += 1) {
    const sizes = balancedRowSizes(widths.length, rows);
    let index = 0;
    let fits = true;
    for (const size of sizes) {
      let rowWidth = gap * Math.max(0, size - 1);
      for (let column = 0; column < size; column += 1) {
        rowWidth += widths[index];
        index += 1;
      }
      if (rowWidth > available + 0.5) {
        fits = false;
        break;
      }
    }
    if (fits) return sizes;
  }
  return new Array(widths.length).fill(1);
}
