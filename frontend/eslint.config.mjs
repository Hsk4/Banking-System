import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Gradle output under android/: `build/` above only matches the project
    // root, so these come back in on the frontend branch, which has no
    // root .gitignore to ignore them
    // Built web assets copied into the Capacitor project - not source
    "android/app/src/main/assets/public/**",
    "android/**/build/**",
    "android/.gradle/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
