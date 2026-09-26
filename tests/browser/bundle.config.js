import { defineConfig } from "@playwright/test";

// These tests load the actual bundle directly, independent of a preview server.
export default defineConfig({
  testDir: ".",
  testMatch: [
    "stateScreens.spec.js",
    "logView.spec.js",
    "sidebarResize.spec.js",
  ],
  use: {
    viewport: { width: 1280, height: 860 },
    screenshot: "only-on-failure",
  },
});
