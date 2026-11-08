import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
const adapterImports = "^next(?:/|$)|(?:^|/)(?:http|next-revalidation|(?:auth/)?(?:page|staff-request|user))(?:\\.[jt]sx?)?$";
const adapterImportMessage =
  "Use the framework-free error and service APIs. Keep request and cache adapters at the entry point.";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/{lib,db}/**/*.{ts,tsx}"],
    ignores: [
      // HTTP and browser adapters.
      "src/lib/http.ts",
      "src/lib/next-revalidation.ts",
      "src/lib/auth/{page,staff-request,user}.ts",
      "src/lib/remote-page.tsx",
      // Existing entry points tracked in docs/next-service-boundaries.md.
      "src/lib/{admin-backups,frontend-data,osu-profiles}.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: adapterImports, message: adapterImportMessage }] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/${adapterImports.replaceAll("/", "\\x2f")}/]`,
          message: adapterImportMessage,
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-remote/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
