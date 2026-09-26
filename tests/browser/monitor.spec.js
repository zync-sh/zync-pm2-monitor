import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("bundled UI works inside the actual opaque-origin sandbox policy", async ({
  page,
}) => {
  const html = await readFile(
    new URL("../../dist/ui/index.html", import.meta.url),
    "utf8",
  );
  const fixture = await readFile(
    new URL("./fixture.js", import.meta.url),
    "utf8",
  );
  const content = html.replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><script>${fixture}</script>`,
  );
  await page.setContent(
    '<iframe title="Isolated PM2" sandbox="allow-scripts" style="width:100%;height:800px"></iframe>',
  );
  await page.locator("iframe").evaluate((frame, srcdoc) => {
    frame.srcdoc = srcdoc;
  }, content);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#total")).toHaveText("4");
  await frame
    .getByRole("button", { name: "api-production", exact: true })
    .click();
  await frame.getByRole("tab", { name: "Logs" }).click();
  await frame.locator("#load-logs").click();
  await expect(frame.locator("#log-content")).toContainText(
    "Connected to database",
  );
});

test("hostile names stay text, and hidden panes stop scheduling reads", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pm2Processes[0].name = '<img src=x onerror="window.__xss=true">';
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#rows")).toContainText("<img src=x");
  await expect(page.locator("#rows img")).toHaveCount(0);
  await page.clock.install();
  await page.evaluate(() => {
    document.body.style.display = "none";
  });
  await page.waitForTimeout(100);
  const count = await page.evaluate(() => window.__pm2Calls.length);
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => window.__pm2Calls.length)).toBe(count);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#total")).toHaveText("4");
});
test("themed tooltips replace native titles and stay inside narrow panes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 680 });
  await expect(page.locator("[title]")).toHaveCount(0);
  await page.locator("#pause").hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("Pause auto-refresh");
  const bounds = await tooltip.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await page.locator("#pause").focus();
  await expect(tooltip).toBeVisible();
  await page.locator("#pause").click();
  await expect(tooltip).toBeHidden();
});
test("dense rows and compact actions retain safety and keyboard navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 650, height: 680 });
  const row = page.locator("#rows tr").first();
  const height = (await row.boundingBox()).height;
  await page.locator("#density").click();
  expect((await row.boundingBox()).height).toBeLessThan(height);
  const trigger = page.getByRole("button", {
    name: "Actions for background-worker #1",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("menuitem", { name: "Reload", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Stop", exact: true }).click();
  await expect(page.locator("#notice")).toContainText("canceled");
  expect(
    await page.evaluate(() =>
      window.__pm2Calls
        .find((call) => call.type === "action")
        .targets.map((target) => target.id),
    ),
  ).toEqual([1]);
  await page.setViewportSize({ width: 320, height: 680 });
  await trigger.click();
  const bounds = await page.getByRole("menu").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
});
test("search icon is centered across pane widths", async ({ page }) => {
  for (const width of [320, 650, 1280]) {
    await page.setViewportSize({ width, height: 680 });
    const icon = await page.locator(".search svg").boundingBox();
    const input = await page.locator("#search").boundingBox();
    expect(icon).not.toBeNull();
    expect(input).not.toBeNull();
    expect(
      Math.abs(icon.y + icon.height / 2 - input.y - input.height / 2),
    ).toBeLessThanOrEqual(1);
  }
});
test("compact process rows show readable metrics without divider-like meter tracks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 650, height: 680 });
  const row = page.locator("#rows tr").first();
  await expect(row.locator(".compact-metrics")).toBeVisible();
  await expect(row.locator(".compact-metrics")).toContainText("CPU");
  await expect(row.locator(".compact-metrics")).toContainText("Uptime");
  await expect(row.locator(".meter-track").first()).toBeHidden();
  await page.screenshot({ path: "test-results/pm2-compact-metrics.png" });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 860 });
  await expect(row.locator(".compact-metrics")).toBeHidden();
  await expect(row.locator(".meter-track").first()).toBeVisible();
});
test("themed dropdowns support keyboard selection, metric sync and narrow panes", async ({
  page,
}) => {
  const filter = page.getByRole("button", {
    name: "Filter by status",
    exact: true,
  });
  await filter.click();
  await expect(
    page.getByRole("listbox", { name: "Filter by status" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#rows tr")).toHaveCount(2);
  await expect(filter).toHaveText("Online");
  await page.locator(".metric[data-filter=all]").click();
  await expect(filter).toHaveText("All statuses");
  await page.setViewportSize({ width: 320, height: 560 });
  await filter.click();
  const bounds = await page
    .getByRole("listbox", { name: "Filter by status" })
    .boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(filter).toBeFocused();
});
test("overview, filtering, details, logs and responsive layout", async ({
  page,
}) => {
  await expect(page.locator("#online")).toHaveText("2");
  await page
    .getByRole("button", { name: "api-production", exact: true })
    .click();
  await expect(page.locator("#detail-name")).toHaveText("api-production");
  await page.getByRole("tab", { name: "Logs" }).click();
  await expect(page.locator("#log-content")).toContainText(
    "Connected to database",
  );
  await page.getByRole("searchbox", { name: "Filter log lines" }).fill("WARN");
  await expect(page.locator("#log-content")).not.toContainText("database");
  await page.screenshot({
    path: "test-results/pm2-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Search processes" })
    .fill("staging");
  await expect(page.locator("#rows tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/pm2-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("pane widths switch between list/detail and theme colors follow Zync", async ({
  page,
}) => {
  await expect(page.locator(".process-side")).toBeVisible();
  await page.getByRole("button", { name: "web-staging", exact: true }).click();
  await expect(
    page.locator("#detail-actions [data-action=start]"),
  ).toBeEnabled();
  await expect(
    page.locator("#detail-actions [data-action=restart]"),
  ).toBeEnabled();
  await page.setViewportSize({ width: 700, height: 680 });
  await expect(page.locator(".process-side")).toBeHidden();
  await expect(page.locator("#details")).toBeVisible();
  await page.getByRole("tab", { name: "Environment" }).click();
  await expect(page.locator("#detail-environment")).toContainText(
    "credentials",
  );
  await page.locator("#close-details").click();
  await expect(page.locator(".process-side")).toBeVisible();
  await page.evaluate(() => {
    window.postMessage(
      {
        type: "zync:theme:update",
        payload: {
          mode: "light",
          colors: {
            background: "#f8fafc",
            surface: "#ffffff",
            text: "#17202a",
            border: "#dce1e7",
            muted: "#56616d",
            primary: "#235bc3",
          },
        },
      },
      "*",
    );
  });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(248, 250, 252)",
  );
});
test("selected actions stay scoped; fork reload disabled and cancel keeps rows", async ({
  page,
}) => {
  await page
    .getByRole("checkbox", { name: "Select background-worker #1" })
    .check();
  await expect(page.locator("#bulk [data-action=reload]")).toBeDisabled();
  await page.locator("#bulk [data-action=stop]").click();
  await expect(page.locator("#notice")).toContainText("Action canceled");
  const action = await page.evaluate(() =>
    window.__pm2Calls.find((call) => call.type === "action"),
  );
  expect(action.targets.map((target) => target.id)).toEqual([1]);
  expect(action.connectionToken).toBe("preview-server");
  await expect(page.locator("#rows tr")).toHaveCount(4);
});
test("connection failure retains stale data and disables mutations; refresh recovers", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__pm2Fail = true;
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#health")).toContainText("stale");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#rows tr")).toHaveCount(4);
  await page.evaluate(() => {
    window.__pm2Fail = false;
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#health")).toHaveAttribute("data-state", "live");
});
test("pause prevents polling; manual refresh remains available", async ({
  page,
}) => {
  await page.clock.install();
  await page.locator("#pause").click();
  const count = await page.evaluate(() => window.__pm2Calls.length);
  await page.clock.fastForward(65000);
  expect(await page.evaluate(() => window.__pm2Calls.length)).toBe(count);
  await page.locator("#refresh").click();
  await page.clock.fastForward(100);
  expect(await page.evaluate(() => window.__pm2Calls.length)).toBe(count + 1);
});
test("empty, no matches, light theme and independent pane state", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/");
  await page.locator("#search").fill("does-not-exist");
  await expect(page.locator("#empty-title")).toHaveText(
    "No matching processes",
  );
  await expect(other.locator("#rows tr")).toHaveCount(4);
  await page.locator("#search").fill("");
  await page.evaluate(() => {
    window.__pm2Empty = true;
    window.postMessage(
      {
        type: "zync:theme:update",
        payload: {
          mode: "light",
          colors: {
            background: "#f8fafc",
            surface: "#ffffff",
            text: "#17202a",
            border: "#dce1e7",
            muted: "#56616d",
            primary: "#235bc3",
          },
        },
      },
      "*",
    );
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#empty-title")).toHaveText(
    "No processes managed by PM2",
  );
  await page.screenshot({
    path: "test-results/pm2-light-empty.png",
    fullPage: true,
  });
});
