import { defineConfig } from "@playwright/test";
const previewUrl = `http://127.0.0.1:${Number(process.env.PM2_PREVIEW_PORT || 4178)}`;
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "*.spec.js",
  use: {
    baseURL: previewUrl,
    viewport: { width: 1280, height: 860 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/preview.mjs",
    url: previewUrl,
    reuseExistingServer: false,
  },
});
