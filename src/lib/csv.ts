export function csvCell(value: string | number) {
  let cell = String(value);
  if (
    typeof value === "string" &&
    (/^[\s\u0000-\u001f]*[=+\-@]/u.test(cell) || /^[\t\r\n]/.test(cell))
  )
    cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}
export function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
