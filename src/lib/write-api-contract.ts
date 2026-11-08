import { z } from "zod";

export const browserWriteError = z.object({ error: z.string() });

export type WriteApiOperation = {
  id: string;
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  access: "browser" | "desktop";
  scope?: string;
  contractHeader?: string;
  summary: string;
  description: string;
  parameters?: Readonly<Record<string, z.ZodType>>;
  successStatus: number;
  successDescription: string;
  response: z.ZodType;
  errors: Readonly<Record<number, string>>;
  consumers: readonly string[];
  externalConsumers?: readonly string[];
} & (
  | {
      request: z.ZodType;
      maxBodyBytes: number;
      requestMediaType?: "multipart/form-data";
    }
  | { request?: never; maxBodyBytes?: never; requestMediaType?: never }
);
