import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
const adapterImports = "^next(?:/|$)|(?:^|/)(?:http|next-frontend-request|next-revalidation|(?:auth/)?(?:backup-request|page|staff-request|user))(?:\\.[jt]sx?)?$";
const cacheImport = "^next/cache(?:\\.js)?$";
const cacheImportMessage =
  "Use next-revalidation.ts to invalidate paths after a command commits.";
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
      "src/lib/{next-frontend-request,next-revalidation}.ts",
      "src/lib/auth/{backup-request,page,staff-request,user}.ts",
      "src/lib/remote-page.tsx",
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
  {
    files: ["src/app/**/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: cacheImport, message: cacheImportMessage }] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/${cacheImport.replaceAll("/", "\\x2f")}/]`,
          message: cacheImportMessage,
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
