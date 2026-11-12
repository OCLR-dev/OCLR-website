import { HttpError } from "./http-error";

function invalidCsv(): never {
  throw new HttpError(
    400,
    "Upload a valid CSV export for the selected rating source.",
  );
}

function csvRows(contents: string) {
  const text = contents.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === "," || char === "\r" || char === "\n") {
      row.push(field);
      field = "";
      closed = false;
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && text[index + 1] === "\n") index++;
      }
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (closed || char === '"') invalidCsv();
      field += char;
    }
  }
  if (quoted) invalidCsv();
  if (row.length || field || closed) rows.push([...row, field]);
  return rows;
}

function flag(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["", "0", "false"].includes(normalized)) return false;
  if (["1", "true"].includes(normalized)) return true;
  return invalidCsv();
}

export function parsePlayerRatingCsv(contents: string, source: "sip" | "etx") {
  const [first, ...rows] = csvRows(contents);
  if (!first) invalidCsv();
  const header = first.map((cell) => cell.trim().toLowerCase());
  if (new Set(header).size !== header.length) invalidCsv();
  const identityIndex = header.indexOf(
    source === "sip" ? "username" : "osuuserid",
  );
  const valueIndex = header.indexOf(source === "sip" ? "rating" : "duelrating");
  if (identityIndex < 0 || valueIndex < 0 || rows.length > 50_000) invalidCsv();
  const flagIndex = (key: string) =>
    header.includes(key) ? header.indexOf(key) : header.indexOf(`duel${key}`);
  const provisionalIndex = flagIndex("provisional");
  const outdatedIndex = flagIndex("outdated");
  return rows.flatMap((row, index) => {
    if (row.every((cell) => !cell.trim())) return [];
    if (row.length !== header.length) invalidCsv();
    const identity = row[identityIndex].trim().toLowerCase();
    if (
      !identity ||
      (source === "etx" &&
        (!/^[1-9]\d*$/.test(identity) ||
          !Number.isSafeInteger(Number(identity))))
    )
      invalidCsv();
    const raw = row[valueIndex].trim();
    const value = raw === "" || /^nan$/i.test(raw) ? null : Number(raw);
    if (
      value !== null &&
      (!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw) ||
        !Number.isFinite(value) ||
        (source === "etx" && value < 0))
    )
      invalidCsv();
    return [
      {
        identity,
        value,
        row: index + 2,
        provisional: source === "etx" && flag(row[provisionalIndex] ?? ""),
        outdated: source === "etx" && flag(row[outdatedIndex] ?? ""),
      },
    ];
  });
}
