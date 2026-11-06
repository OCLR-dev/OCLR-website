export type Scalar = "string" | "integer" | "number" | "boolean" | "mixed";
export type Node =
  | { type: "object"; properties: Record<string, Node> }
  | { type: "relation"; mode: "array" | "record"; entity: string }
  | { type: "scalar"; column: string; scalar: Scalar; array: boolean };
export type Entity = {
  key: string;
  parent?: string;
  fields: { column: string; type: Scalar; array: boolean }[];
  node: Node;
};
export type Layout = {
  kind: "archive" | "statistics" | "summary";
  root: string;
  entities: Entity[];
};
export type RelationRow = {
  id: number;
  parentId: number | null;
  position: number;
  recordKey: string | null;
  present: string[];
  nulls: string[];
} & Record<string, unknown>;
export type RelationData = Record<string, RelationRow[]>;

/** Domain objects have typed columns; only dictionaries of provider keys use typed value rows. */
export function encodeArchiveRelations(
  layout: Layout,
  input: unknown,
): RelationData {
  const data: RelationData = Object.fromEntries(
    layout.entities.map((e) => [e.key, []]),
  );
  const entities = new Map(layout.entities.map((e) => [e.key, e]));
  function row(
    key: string,
    value: unknown,
    parentId: number | null,
    position: number,
    recordKey: string | null,
  ) {
    const r: RelationRow = {
      id: data[key].length,
      parentId,
      position,
      recordKey,
      present: [],
      nulls: [],
    };
    data[key].push(r);
    function visit(node: Node, value: unknown, path: string[]) {
      if (value === undefined) return;
      const field = path.join(".");
      r.present.push(field);
      if (value === null) {
        r.nulls.push(field);
        return;
      }
      if (node.type === "scalar") {
        if (node.scalar === "mixed") {
          const kind = typeof value;
          if (!["string", "number", "boolean"].includes(kind))
            throw new Error("Invalid provider scalar");
          r[node.column + "_type"] = kind;
          r[node.column + "_" + kind] = value;
        } else r[node.column] = value;
      } else if (node.type === "object") {
        if (typeof value !== "object" || Array.isArray(value))
          throw new Error("Invalid historical object");
        const object = value as Record<string, unknown>;
        if (Object.keys(object).some((k) => !Object.hasOwn(node.properties, k)))
          throw new Error("Historical schema changed; regenerate relations");
        for (const [key, child] of Object.entries(node.properties))
          visit(child, object[key], [...path, key]);
      } else if (node.mode === "array") {
        if (!Array.isArray(value)) throw new Error("Invalid historical list");
        value.forEach((item, i) => row(node.entity, item, r.id, i, null));
      } else {
        if (typeof value !== "object" || Array.isArray(value))
          throw new Error("Invalid historical dictionary");
        Object.entries(value).forEach(([key, item], i) =>
          row(node.entity, item, r.id, i, key),
        );
      }
    }
    visit(entities.get(key)!.node, value, []);
  }
  row(layout.root, input, null, 0, null);
  return data;
}

export function decodeArchiveRelations(
  layout: Layout,
  data: RelationData,
): unknown {
  const entities = new Map(layout.entities.map((e) => [e.key, e]));
  const children = new Map<string, Map<number | null, RelationRow[]>>();
  for (const entity of layout.entities) {
    const groups = new Map<number | null, RelationRow[]>();
    for (const row of data[entity.key] ?? []) {
      const group = groups.get(row.parentId) ?? [];
      group.push(row);
      groups.set(row.parentId, group);
    }
    for (const rows of groups.values())
      rows.sort((a, b) => a.position - b.position);
    children.set(entity.key, groups);
  }
  let visited = 0;
  function decode(key: string, r: RelationRow): unknown {
    visited++;
    const present = new Set(r.present),
      nulls = new Set(r.nulls);
    function visit(node: Node, path: string[]): unknown {
      const field = path.join(".");
      if (!present.has(field)) return undefined;
      if (nulls.has(field)) return null;
      if (node.type === "scalar") {
        const value =
          node.scalar === "mixed"
            ? r[node.column + "_" + r[node.column + "_type"]]
            : r[node.column];
        if (value === null || value === undefined)
          throw new Error("Incomplete historical scalar");
        return value;
      }
      if (node.type === "object")
        return Object.fromEntries(
          Object.entries(node.properties).flatMap(([key, child]) => {
            const value = visit(child, [...path, key]);
            return value === undefined ? [] : [[key, value]];
          }),
        );
      const rows = children.get(node.entity)!.get(r.id) ?? [];
      if (rows.some((child, i) => child.position !== i))
        throw new Error("Incomplete historical relation");
      return node.mode === "array"
        ? rows.map((child) => decode(node.entity, child))
        : Object.fromEntries(
            rows.map((child) => {
              if (child.recordKey === null)
                throw new Error("Missing provider key");
              return [child.recordKey, decode(node.entity, child)];
            }),
          );
    }
    return visit(entities.get(key)!.node, []);
  }
  const roots = data[layout.root] ?? [];
  if (roots.length !== 1 || roots[0].id !== 0 || roots[0].parentId !== null)
    throw new Error("Missing historical root");
  const value = decode(layout.root, roots[0]);
  if (visited !== Object.values(data).reduce((n, rows) => n + rows.length, 0))
    throw new Error("Unlinked historical relation");
  return value;
}
