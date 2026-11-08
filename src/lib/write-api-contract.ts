import { z } from "zod";
import type readContracts from "./extended-read-contracts.json";

export const browserWriteError = z.object({ error: z.string() });

export type WriteResponseSchema =
  z.ZodType | { readResource: keyof typeof readContracts.resources };

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
  response:
    | WriteResponseSchema
    | { anyOf: readonly WriteResponseSchema[] }
    | { properties: Readonly<Record<string, WriteResponseSchema>> };
  errors: Readonly<Record<number, string>>;
  errorResponses?: Readonly<Record<number, z.ZodType>>;
  consumers: readonly string[];
  externalConsumers?: readonly string[];
} & (
  | {
      request: z.ZodType;
      maxBodyBytes: number;
      requestMediaType?: "multipart/form-data";
      urlencodedRequest?: z.ZodType;
    }
  | {
      request?: never;
      maxBodyBytes?: never;
      requestMediaType?: never;
      urlencodedRequest?: never;
    }
);
