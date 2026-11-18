import {
  liruGachaActionSchema,
  liruGachaPath,
  liruGachaStatusSchema,
} from "./liru-gacha-model";
import type { WriteApiOperation } from "./write-api-contract";

export const updateLiruGachaWrite = {
  id: "updateLiruGacha",
  access: "browser",
  path: liruGachaPath,
  method: "POST",
  parameters: {},
  maxBodyBytes: 1024,
  consumers: ["src/components/liru-gacha.tsx"],
  summary: "Check in or spend today's Liru ten-pull",
  description:
    "Use the day returned by GET on the same path. Each account can check in once per UTC+8 calendar day and spend that day's reward once. Repeating an action for the current day returns the existing state and any saved result. On the last card an R roll is upgraded to SR.",
  request: liruGachaActionSchema,
  successStatus: 200,
  successDescription: "The account's saved check-in and draw result for today.",
  response: liruGachaStatusSchema,
  errors: {
    400: "Invalid request.",
    401: "An active browser session is required.",
    403: "Origin or authentication channel rejected.",
    409: "The day changed or the daily check-in is required.",
    413: "The request is too large.",
    415: "Send JSON data.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
} as const satisfies WriteApiOperation;
