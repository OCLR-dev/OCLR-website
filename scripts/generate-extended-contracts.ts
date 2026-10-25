import { createHash } from "node:crypto";
import { format } from "prettier";
import ts from "typescript";
import fs from "node:fs";
import definitions from "./extended-read-resources.json" with { type: "json" };
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const program = ts.createProgram(parsed.fileNames, {
  ...parsed.options,
  noUncheckedIndexedAccess: true,
});
const checker = program.getTypeChecker();
type Schema = Record<string, unknown>;
const unsupported = new Set<string>();
function schema(type: ts.Type, depth = 0): Schema {
  if (depth > 65)
    throw Error("Recursive read DTO: " + checker.typeToString(type));
  if (type.flags & ts.TypeFlags.Any) {
    unsupported.add("any");
    return {};
  }
  if (type.flags & ts.TypeFlags.Unknown) return {};
  if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void))
    return { type: "null", "x-oclr-undefined": true };
  if (type.flags & ts.TypeFlags.Null) return { type: "null" };
  if (type.isStringLiteral() || type.isNumberLiteral())
    return { type: typeof type.value, const: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral)
    return { type: "boolean", const: checker.typeToString(type) === "true" };
  if (type.flags & ts.TypeFlags.StringLike) return { type: "string" };
  if (type.flags & ts.TypeFlags.NumberLike) return { type: "number" };
  if (type.flags & ts.TypeFlags.BooleanLike) return { type: "boolean" };
  if (type.flags & ts.TypeFlags.Never) return { not: {} };
  if (type.isUnion())
    return { anyOf: type.types.map((t) => schema(t, depth + 1)) };
  if (type.getSymbol()?.getName() === "Date")
    return { type: "string", format: "date-time", "x-oclr-date": true };
  if (checker.isArrayType(type))
    return {
      type: "array",
      items: schema(
        checker.getTypeArguments(type as ts.TypeReference)[0],
        depth + 1,
      ),
    };
  if (checker.isTupleType(type)) {
    const items = checker.getTypeArguments(type as ts.TypeReference);
    return {
      type: "array",
      prefixItems: items.map((t) => schema(t, depth + 1)),
      items: false,
      minItems: items.length,
      maxItems: items.length,
    };
  }
  if (
    ["Map", "Set", "Buffer", "Promise"].includes(
      type.getSymbol()?.getName() ?? "",
    )
  )
    throw Error("Unsupported wire type " + checker.typeToString(type));
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  for (const p of checker.getPropertiesOfType(type)) {
    if (p.getName().startsWith("__@")) continue;
    const declaration = p.valueDeclaration ?? p.declarations?.[0];
    const propertyType = declaration
      ? checker.getTypeOfSymbolAtLocation(p, declaration)
      : checker.getTypeOfSymbol(p);
    if (propertyType.getCallSignatures().length)
      throw Error("Function in DTO " + p.getName());
    properties[p.getName()] = schema(propertyType, depth + 1);
    if (
      !(p.flags & ts.SymbolFlags.Optional) &&
      !(
        propertyType.isUnion() &&
        propertyType.types.some((t) => t.flags & ts.TypeFlags.Undefined)
      )
    )
      required.push(p.getName());
  }
  const index =
    checker.getIndexTypeOfType(type, ts.IndexKind.String) ??
    checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  return {
    type: "object",
    properties,
    required,
    additionalProperties: index ? schema(index, depth + 1) : false,
  };
}
const result: Record<string, Schema> = {};
for (const resource of definitions) {
  const file = program.getSourceFile("src/lib/" + resource.module + ".ts")!;
  const name =
    "model" in resource
      ? resource.model
      : resource.fn === "staffAccess"
        ? "staffAccess"
        : "database" + resource.fn[0].toUpperCase() + resource.fn.slice(1);
  const fn = file.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  ) as ts.FunctionDeclaration;
  if (!fn) throw Error("Missing " + name);
  const signature = checker.getSignatureFromDeclaration(fn)!;
  const type = checker.getAwaitedType(
    checker.getReturnTypeOfSignature(signature),
  )!;
  result[resource.id] = schema(type);
}
if (unsupported.size) throw Error("Untyped DTO: " + [...unsupported]);
// Stable structural definitions keep identical query models shared across resources.
const counts = new Map<string, number>();
function count(value: unknown) {
  if (!value || typeof value !== "object") return;
  const key = JSON.stringify(value);
  if (
    !Array.isArray(value) &&
    key.length > 200 &&
    (("type" in value && typeof value.type === "string") ||
      ("anyOf" in value && Array.isArray(value.anyOf)) ||
      ("not" in value &&
        !Array.isArray(value.not) &&
        typeof value.not === "object"))
  )
    counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const child of Object.values(value)) count(child);
}
for (const value of Object.values(result)) count(value);
const defs: Record<string, unknown> = {};
function compact(value: unknown, root = false): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => compact(v));
  const key = JSON.stringify(value);
  if (
    !root &&
    (counts.get(key) ?? 0) > 1 &&
    (("type" in value && typeof value.type === "string") ||
      ("anyOf" in value && Array.isArray(value.anyOf)) ||
      ("not" in value &&
        !Array.isArray(value.not) &&
        typeof value.not === "object"))
  ) {
    const id =
      "Read" + createHash("sha256").update(key).digest("hex").slice(0, 12);
    if (!(id in defs)) {
      defs[id] = null;
      defs[id] = compact(value, true);
    }
    return { $ref: "#/$defs/" + id };
  }
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, compact(v)]),
  );
}
const resources = Object.fromEntries(
  Object.entries(result).map(([k, v]) => [k, compact(v)]),
);
const document = {
  $defs: Object.fromEntries(
    Object.entries(defs).sort(([a], [b]) => a.localeCompare(b)),
  ),
  resources,
};
const output = await format(JSON.stringify(document), { parser: "json" });
const target = "src/lib/extended-read-contracts.json";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== output)
    throw Error("Extended read contracts drifted; regenerate.");
} else fs.writeFileSync(target, output);
console.log(`${definitions.length} read contracts checked.`);
