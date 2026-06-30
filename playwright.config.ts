import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  forbidOnly: isCI,
  // Two retries on CI to absorb redirect/network jitter without depending on
  // arbitrary delays; locally we still fail fast on the first run.
  retries: isCI ? 2 : 0,
  // On CI emit BOTH the HTML report (for artifact upload + offline triage)
  // and `line` (for live workflow logs). Locally keep `list` for readability.
  reporter: isCI
    ? [
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["line"],
      ]
    : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // Always capture artifacts on failure to make CI regressions (notably the
    // shortcuts + aria-live specs) diagnosable without re-running locally.
    screenshot: { mode: "only-on-failure", fullPage: false },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
});
