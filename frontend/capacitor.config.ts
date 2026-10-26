import type { CapacitorConfig } from '@capacitor/cli';

/**
 * - Capacitor configuration
 * The shell loads Next's static export, so `webDir` must point at `out/`
 * (what `output: "export"` writes), not at `public/` - that only holds
 * static assets and the design-spec markdown.
 *
 * Run `bun run build:mobile` before `cap sync`: Capacitor copies `webDir`
 * as-is and does not build the web app itself.
 */
const config: CapacitorConfig = {
  appId: "com.bankingsystem.app",
  appName: "Banking System",
  webDir: "out",
  android: {
    // the app is served over https inside the shell, matching the web build
    allowMixedContent: false,
  },
};

export default config;
