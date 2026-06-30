// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Resolve the release name from env (Lovable / CI sets one of these).
const release =
  process.env.VITE_SENTRY_RELEASE ||
  process.env.SENTRY_RELEASE ||
  process.env.GITHUB_SHA ||
  process.env.LOVABLE_DEPLOYMENT_ID;

// Only wire the Sentry Vite plugin when the upload secrets exist — keeps
// local builds and PR previews fast and silent. Required env for uploads:
//   SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
// Optional: VITE_SENTRY_RELEASE (otherwise we derive from CI vars above).
const sentryEnabled =
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Generate hidden sourcemaps so the bundle stays clean for users but
    // Sentry can still symbolicate stack traces after the plugin uploads them.
    build: { sourcemap: "hidden" },
    // Make the release name visible to the client at runtime (sentry.ts reads
    // import.meta.env.VITE_SENTRY_RELEASE during Sentry.init).
    define: release ? { "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release) } : {},
    plugins: sentryEnabled
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG!,
            project: process.env.SENTRY_PROJECT!,
            authToken: process.env.SENTRY_AUTH_TOKEN!,
            release: release ? { name: release } : undefined,
            sourcemaps: { filesToDeleteAfterUpload: ["**/*.map"] },
            telemetry: false,
          }),
        ]
      : [],
  },
});
