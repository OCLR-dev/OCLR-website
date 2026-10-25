/** Dates use explicit JSON Schema metadata, never guessed by string shape. */
type Schema = {
  $ref?: string;
  $defs?: Record<string, Schema>;
  type?: string;
  format?: string;
  "x-oclr-date"?: boolean;
  "x-oclr-undefined"?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  prefixItems?: Schema[];
  additionalProperties?: Schema | boolean;
  anyOf?: Schema[];
  const?: unknown;
};
export function reviveReadValue(
  value: unknown,
  definition: unknown,
  rootDefinition?: unknown,
): unknown {
  const schema = definition as Schema;
  const root = (rootDefinition ?? definition) as Schema;
  if (!schema || typeof schema !== "object") return value;
  if (schema.$ref)
    return reviveReadValue(
      value,
      root.$defs?.[schema.$ref.split("/").at(-1)!],
      root,
    );
  if (schema.anyOf) {
    const candidates = schema.anyOf.map((s) =>
      s.$ref ? (root.$defs?.[s.$ref.split("/").at(-1)!] ?? s) : s,
    );
    const branch = candidates.find((s) =>
      s.const !== undefined
        ? s.const === value
        : s.type ===
          (value === null
            ? "null"
            : Array.isArray(value)
              ? "array"
              : typeof value),
    );
    return branch ? reviveReadValue(value, branch, root) : value;
  }
  if (value === null) return schema["x-oclr-undefined"] ? undefined : null;
  if (schema["x-oclr-date"] && typeof value === "string")
    return new Date(value);
  if (Array.isArray(value))
    return value.map((v, index) =>
      reviveReadValue(v, schema.prefixItems?.[index] ?? schema.items, root),
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        reviveReadValue(
          v,
          schema.properties?.[k] ?? schema.additionalProperties,
          root,
        ),
      ]),
    );
  return value;
}
