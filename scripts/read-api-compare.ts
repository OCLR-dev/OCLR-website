import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const [ref] = process.argv.slice(2);
if (!ref) throw new Error("Pass a baseline Git ref to compare.");
const baseline = execFileSync(
  "git",
  ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
  { encoding: "utf8" },
).trim();

type Json = null | boolean | number | string | Json[] | JsonObject;
type JsonObject = { [key: string]: Json };
const object = (value: Json): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function load<T>(file: string): [T, T] {
  return [
    JSON.parse(
      execFileSync("git", ["show", `${baseline}:${file}`], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    ),
    JSON.parse(readFileSync(file, "utf8")),
  ];
}

function resolve(document: JsonObject, ref: string): Json {
  let result: Json = document;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!object(result) || !Object.hasOwn(result, key))
      throw new Error(`Missing schema reference ${ref}`);
    result = result[key];
  }
  return result;
}

function normalize(document: JsonObject) {
  const resolved = new Map<string, Json>();
  const resolving = new Set<string>();
  const literal = (branch: Json) =>
    object(branch) &&
    Object.keys(branch).length === 2 &&
    Object.hasOwn(branch, "type") &&
    Object.hasOwn(branch, "const") &&
    branch.const !== null;
  function visit(value: Json): Json {
    if (Array.isArray(value)) return value.map(visit);
    if (!object(value)) return value;
    const ref = value.$ref;
    if (
      typeof ref === "string" &&
      ref.startsWith("#/") &&
      Object.keys(value).length === 1
    ) {
      if (!resolved.has(ref)) {
        if (resolving.has(ref))
          throw new Error(`Recursive schema reference ${ref}`);
        resolving.add(ref);
        resolved.set(ref, visit(resolve(document, ref)));
        resolving.delete(ref);
      }
      return resolved.get(ref)!;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        if (key === "required" && Array.isArray(child))
          return [key, [...child].sort()];
        if (key === "anyOf" && Array.isArray(child)) {
          // Identical alternatives match and revive values in the same way.
          const branches: Json[] = [];
          for (const branch of child.map(visit)) {
            if (!branches.some((other) => isDeepStrictEqual(branch, other)))
              branches.push(branch);
          }
          // Reorder consecutive literal choices without moving null or other branches.
          const first = branches.findIndex(literal);
          const last = branches.findLastIndex(literal);
          if (first >= 0 && last > first) {
            const choices = branches.slice(first, last + 1);
            if (choices.every(literal))
              branches.splice(
                first,
                choices.length,
                ...choices.sort((a, b) =>
                  JSON.stringify(a).localeCompare(JSON.stringify(b)),
                ),
              );
          }
          return [key, branches];
        }
        return [key, visit(child)];
      }),
    );
  }
  return visit;
}

const differences: string[] = [];
function compare(
  before: JsonObject,
  after: JsonObject,
  normalizeBefore: (value: Json) => Json,
  normalizeAfter: (value: Json) => Json,
  label: string,
) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
    if (
      !isDeepStrictEqual(
        normalizeBefore(before[key]),
        normalizeAfter(after[key]),
      )
    )
      differences.push(`${label} ${key}`);
}

type Runtime = JsonObject & { resources: JsonObject };
const [oldRuntime, currentRuntime] = load<Runtime>(
  "src/lib/extended-read-contracts.json",
);
compare(
  oldRuntime.resources,
  currentRuntime.resources,
  normalize(oldRuntime),
  normalize(currentRuntime),
  "Runtime resource",
);

type OpenApi = JsonObject & {
  paths: JsonObject;
  components: JsonObject & { schemas: JsonObject };
};
const [oldApi, currentApi] = load<OpenApi>("docs/read-api.openapi.json");
const old = normalize(oldApi);
const current = normalize(currentApi);
compare(oldApi.paths, currentApi.paths, old, current, "OpenAPI path");
const namedSchemas = (schemas: JsonObject) =>
  Object.fromEntries(
    Object.entries(schemas).filter(([key]) => !/^Read[0-9a-f]{12}$/.test(key)),
  );
compare(
  namedSchemas(oldApi.components.schemas),
  namedSchemas(currentApi.components.schemas),
  old,
  current,
  "OpenAPI schema",
);
const metadata = ({
  paths,
  components: { schemas, ...components },
  ...rest
}: OpenApi) => {
  void paths;
  void schemas;
  return { ...rest, components };
};
if (!isDeepStrictEqual(metadata(oldApi), metadata(currentApi)))
  differences.push("OpenAPI metadata");
if (differences.length)
  throw new Error(`Read contract differences:\n${differences.join("\n")}`);

console.log(
  `${Object.keys(currentRuntime.resources).length} runtime resources and ${Object.keys(currentApi.paths).length} OpenAPI paths match ${baseline.slice(0, 8)}.`,
);
