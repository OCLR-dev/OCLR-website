/** Generate the versioned contract from the same schemas and operation registry as runtime. */
import { writeFileSync } from "node:fs";
import { format } from "prettier";
import { readApiSpecification } from "../src/lib/read-api-openapi";
writeFileSync(
  "docs/read-api.openapi.json",
  await format(JSON.stringify(readApiSpecification()), {
    parser: "json",
    tabWidth: 2,
  }),
);
console.log("Read API specification synchronized.");
