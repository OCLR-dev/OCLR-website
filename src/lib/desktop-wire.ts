import { z } from "zod";

export const desktopApiVersion = "1";
export const desktopContractVersion = "1.1.0";
export const desktopPollAfterSeconds = 3;

export const desktopMetadataSchema = z.object({
  apiVersion: z.literal(desktopApiVersion),
  contractVersion: z.literal(desktopContractVersion),
  requestId: z.uuid(),
  serverTime: z.iso.datetime(),
  pollAfterSeconds: z.literal(desktopPollAfterSeconds),
});

export const desktopErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.uuid(),
    retryable: z.boolean(),
  }),
});
