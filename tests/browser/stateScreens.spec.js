import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function open(page, setup = "", delay = 30) {
  const html = await readFile(
    new URL("../../dist/ui/index.html", import.meta.url),
    "utf8",
  );
  let fixture = await readFile(
    new URL("./fixture.js", import.meta.url),
    "utf8",
  );
  fixture = fixture
    .replace(
      'if (window.__pm2Fail) reply.error = "The server is disconnected";',
      'if (window.__pm2Fail) { reply.error = "pm2: not found"; reply.errorCode = "EXECUTABLE_NOT_FOUND"; }',
    )
    .replace("}, 30);", `}, ${delay});`);
  await page.setContent(
    html.replace("<head>", `<head><script>${fixture}\n${setup}</script>`),
  );
}

test("shared controls preserve flat names, ring selection and compact overview bounds", async ({ page }) => {
  for (const width of [320, 530, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await open(page);
    await expect(page.locator(".process-name").first()).toBeVisible();
    const layout = await page.evaluate(() => {
      const metrics = [...document.querySelectorAll(".metric")];
      const bounds = document.querySelector(".metrics").getBoundingClientRect();
      const selected = getComputedStyle(metrics[0]);
      const name = getComputedStyle(document.querySelector(".process-name"));
      return {
        fits: metrics.every(item => item.getBoundingClientRect().right <= bounds.right && item.getBoundingClientRect().left >= bounds.left),
        height: bounds.height,
        ring: selected.boxShadow,
        nameBackground: name.backgroundColor,
        nameBorder: name.borderTopWidth,
      };
    });
    expect(layout.fits).toBe(true);
    expect(layout.height).toBeLessThanOrEqual(60);
    expect(layout.ring).not.toBe("none");
    expect(layout.nameBackground).toBe("rgba(0, 0, 0, 0)");
    expect(layout.nameBorder).toBe("0px");
    await page.locator(".process-name").first().click();
    const details = await page.evaluate(() => {
      const tab = getComputedStyle(document.querySelector('.detail-tab[aria-selected="true"]'));
      const action = getComputedStyle(document.querySelector('.detail-actions button[data-action="delete"]'));
      return { tabBackground: tab.backgroundColor, tabTopBorder: tab.borderTopWidth, tabIndicator: tab.borderBottomWidth, actionBackground: action.backgroundColor, danger: action.color, text: getComputedStyle(document.body).color };
    });
    expect(details.tabBackground).toBe("rgba(0, 0, 0, 0)");
    expect(details.tabTopBorder).toBe("0px");
    expect(details.tabIndicator).toBe("2px");
    expect(details.actionBackground).toBe("rgba(0, 0, 0, 0)");
    expect(details.danger).not.toBe(details.text);
  }
});

test("unchanged rows stay mounted across refresh", async ({ page }) => {
  await open(page);
  await expect(page.locator("#total")).toHaveText("4");
  await page.evaluate(() => {
    window.savedRow = document.querySelector("#rows tr");
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#refresh")).toBeEnabled();
  expect(
    await page.evaluate(
      () => window.savedRow === document.querySelector("#rows tr"),
    ),
  ).toBe(true);
});

test("unavailable metrics are not presented as zero readings", async ({
  page,
}) => {
  await open(
    page,
    "processes[0].cpuAvailable = false; processes[0].memoryAvailable = false;",
  );
  await expect(page.locator("#total")).toHaveText("4");
  await expect(
    page.locator("#rows tr").first().locator(".cpu-cell"),
  ).toContainText("Unavailable");
  await expect(
    page.locator("#rows tr").first().locator(".memory-cell"),
  ).toContainText("Unavailable");
  await page.locator("#rows tr").first().locator(".process-name").click();
  await expect(page.locator("#detail-cpu")).toHaveText("Unavailable");
});

test("metric charts use sampled history and reset when a process restarts", async ({
  page,
}) => {
  await open(page, "window.historyProcesses = processes;");
  await expect(page.locator("#total")).toHaveText("4");
  await page.locator("#rows tr").first().locator(".process-name").click();
  await expect(page.locator("#history-cpu")).toContainText(
    "Collecting samples",
  );
  await page.evaluate(() => {
    window.historyProcesses[0].cpu = 40;
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#history-cpu polyline")).toHaveCount(1);
  await expect(page.locator("#history-cpu")).toContainText("40.0%");
  await page.evaluate(() => {
    window.historyProcesses[0].startedAt += 1000;
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#refresh")).toBeEnabled();
  await expect(page.locator("#history-cpu polyline")).toHaveCount(0);
  await expect(page.locator("#history-cpu")).toContainText(
    "Collecting samples",
  );
});

test("process shortcuts preserve typing, restore focus and highlight inert logs", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("#total")).toHaveText("4");
  const names = page.locator("#rows .process-name");
  await names.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(names.nth(1)).toBeFocused();
  await page.keyboard.press("l");
  await expect(page.locator("#detail-logs")).toBeVisible();
  await expect(page.locator('.log-line[data-level="warning"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#details")).toBeHidden();
  await expect(names.nth(1)).toBeFocused();
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  await page.keyboard.type("l/");
  await expect(page.locator("#search")).toHaveValue("l/");
  await page.locator("#search").fill("");
  await page
    .getByRole("button", { name: "scheduled-jobs", exact: true })
    .click();
  await expect(page.locator("#process-diagnostics")).toContainText("errored");
  await expect(page.locator("#process-diagnostics")).toContainText(
    "does not prove",
  );
});

test("large lists retain row identity, focus and scroll across unchanged refresh", async ({
  page,
}) => {
  await open(
    page,
    'const template = processes[0]; processes.splice(0, processes.length, ...Array.from({ length: 250 }, (_, id) => ({ ...template, id, name: `process-${String(id).padStart(3, "0")}` })));',
  );
  await expect(page.locator("#rows tr")).toHaveCount(250);
  await page.evaluate(() => {
    window.savedRows = [...document.querySelectorAll("#rows tr")];
    document.querySelector(".table-scroll").scrollTop = 500;
  });
  await page.locator("#refresh").click();
  await expect(page.locator("#refresh")).toBeEnabled();
  expect(
    await page.evaluate(() =>
      window.savedRows.every(
        (row, index) => row === document.querySelectorAll("#rows tr")[index],
      ),
    ),
  ).toBe(true);
  expect(
    await page.locator(".table-scroll").evaluate((node) => node.scrollTop),
  ).toBe(500);
  await page.locator("#rows .process-name").nth(200).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#rows .process-name").nth(201)).toBeFocused();
});

test("export sends only visible filtered lines and handles cancellation", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("#total")).toHaveText("4");
  await page.locator("#rows .process-name").first().click();
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  await expect(page.locator("#log-content .log-line")).toHaveCount(4);
  await page.locator("#log-search").fill("WARN");
  await page.locator("#export-logs").click();
  await expect(page.locator("#log-status")).toContainText("Export canceled");
  const content = await page.evaluate(
    () => window.__pm2Calls.find((call) => call.type === "export-logs").content,
  );
  expect(content).toContain("WARN");
  expect(content).not.toContain("Connected to database");
});

test("slow first load shows skeletons and recovers without a failure banner", async ({
  page,
}) => {
  await open(page, "", 6100);
  await expect(page.locator("#loading-skeleton")).toBeVisible();
  await expect(page.locator("#empty-description")).toContainText(
    "taking longer",
    { timeout: 6000 },
  );
  await expect(page.locator("#total")).toHaveText("4");
  await expect(page.locator("#empty")).toBeHidden();
  await expect(page.locator(".brand-mark svg")).toHaveAttribute(
    "viewBox",
    "0 0 32 32",
  );
  const iconSize = await page.locator(".brand-mark svg").boundingBox();
  expect(iconSize.width).toBe(22);
});

test("missing PM2 offers settings and retry, never install", async ({
  page,
}) => {
  await open(page, "window.__pm2Fail = true;");
  await expect(page.locator("#empty-title")).toHaveText("PM2 isn’t available");
  await page.locator("#empty-settings").click();
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#program")).toBeFocused();
  await page.evaluate(() => {
    window.__pm2Fail = false;
  });
  await page.locator("#empty-retry").click();
  await expect(page.locator("#total")).toHaveText("4");
});

test("empty and filtered states provide distinct recovery actions at narrow width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page, "window.__pm2Empty = true;");
  await expect(page.locator("#empty-title")).toHaveText(
    "No processes managed by PM2",
  );
  await page.evaluate(() => {
    window.__pm2Empty = false;
  });
  await page.locator("#empty-retry").click();
  await expect(page.locator("#total")).toHaveText("4");
  await page.locator("#search").fill("no-such-process");
  await expect(page.locator("#empty-title")).toHaveText(
    "No matching processes",
  );
  await page.locator("#empty-clear").click();
  await expect(page.locator("#empty")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("compact status, actions and mode share consistent alignment", async ({
  page,
}) => {
  for (const width of [320, 650]) {
    await page.setViewportSize({ width, height: 720 });
    await open(page);
    await expect(page.locator("#total")).toHaveText("4");
    for (const dense of [false, true]) {
      if (dense) await page.locator("#density").click();
      const rows = page.locator("#rows tr");
      for (let index = 0; index < (await rows.count()); index++) {
        const row = rows.nth(index);
        const badge = await row.locator(".status-pill").boundingBox();
        const action = await row.locator(".row-menu-trigger").boundingBox();
        const mode = await row.locator(".mode-cell").boundingBox();
        expect(
          Math.abs(badge.y + badge.height / 2 - action.y - action.height / 2),
        ).toBeLessThan(1);
        expect(
          Math.abs(badge.x + badge.width - mode.x - mode.width),
        ).toBeLessThan(1);
      }
    }
  }
});
