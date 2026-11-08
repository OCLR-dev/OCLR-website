import { HttpError } from "./http-error";

import {
  MANUAL_BATCH_LIMIT,
  MANUAL_BATCH_TEXT_LIMIT,
} from "./request-body-limits";
export {
  MANUAL_BATCH_LIMIT,
  MANUAL_BATCH_TEXT_LIMIT,
} from "./request-body-limits";
export type ManualInputType = "id" | "username";
export function parseManualLines(text: string, inputType: ManualInputType) {
  if (!text.trim() || text.length > MANUAL_BATCH_TEXT_LIMIT)
    throw new HttpError(
      400,
      "Paste between 1 and 20 non-empty lines (maximum 8192 characters).",
    );
  const rows = text.split(/\r?\n/).flatMap((raw, index) => {
    if (!raw.trim()) return [];
    const value = raw.trim();
    const prefix = /^(id|name):\s*(.*)$/i.exec(value);
    return [
      {
        line: index + 1,
        raw,
        input: prefix ? prefix[2] : value,
        inputType: prefix
          ? ((prefix[1].toLowerCase() === "id"
              ? "id"
              : "username") as ManualInputType)
          : value.startsWith("https://")
            ? ("id" as const)
            : inputType,
      },
    ];
  });
  if (!rows.length || rows.length > MANUAL_BATCH_LIMIT)
    throw new HttpError(
      400,
      "Paste between 1 and 20 non-empty lines (maximum 8192 characters).",
    );
  return rows;
}
