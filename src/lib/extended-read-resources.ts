/** Fixed, saved-only domain read resources. No arbitrary service dispatch or provider proxy. */
import definitions from "../../scripts/extended-read-resources.json" with { type: "json" };
import contracts from "./extended-read-contracts.json" with { type: "json" };
import { z } from "zod";
export const extendedResources = definitions;
const documents: Record<string, unknown> = contracts.resources;
export const extendedSchemas: Record<string, z.ZodType> = Object.fromEntries(
  Object.entries(documents).map(([name, schema]) => [
    name,
    z.fromJSONSchema({
      ...(schema as object),
      $defs: contracts.$defs,
    } as unknown as z.core.JSONSchema.JSONSchema),
  ]),
);
