import { z } from "zod";
import type readContracts from "./extended-read-contracts.json";

export const browserWriteError = z.object({ error: z.string() });

export type WriteResponseSchema =
  z.ZodType | { readResource: keyof typeof readContracts.resources };

type WriteOperationResponse =
  | null
  | WriteResponseSchema
  | { anyOf: readonly WriteResponseSchema[] }
  | { properties: Readonly<Record<string, WriteResponseSchema>> };

type HeaderSchemas = Readonly<Record<string, z.ZodType>>;

export type WriteApiOperation = {
  id: string;
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  access: "browser" | "desktop" | "public" | "same-origin";
  scope?: string;
  contractHeader?: string;
  actionField?: string;
  errorFormat?: "desktop";
  successHeaders?: HeaderSchemas;
  additionalSuccess?: Readonly<
    Record<
      number,
      {
        description: string;
        response: WriteOperationResponse;
        headers?: HeaderSchemas;
      }
    >
  >;
  summary: string;
  description: string;
  parameters?: Readonly<Record<string, z.ZodType>>;
  query?: Readonly<Record<string, z.ZodType>>;
  successStatus: number;
  successDescription: string;
  response: WriteOperationResponse;
  errors: Readonly<Record<number, string>>;
  errorResponses?: Readonly<Record<number, z.ZodType>>;
  errorHeaders?: Readonly<Record<number, HeaderSchemas>>;
  consumers: readonly string[];
  externalConsumers?: readonly string[];
} & (
  | {
      request: z.ZodType;
      maxBodyBytes: number;
      requestMediaType?:
        | "multipart/form-data"
        | "application/x-www-form-urlencoded"
        | "*/*";
      requestBodyRequired?: boolean;
      urlencodedRequest?: z.ZodType;
    }
  | {
      request?: never;
      maxBodyBytes?: never;
      requestMediaType?: never;
      urlencodedRequest?: never;
    }
);
