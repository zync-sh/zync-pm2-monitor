import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("logs stay readable, inert and scrollable in a narrow pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 720 });
  const html = await readFile(
    new URL("../../dist/ui/index.html", import.meta.url),
    "utf8",
  );
  const fixture = await readFile(
    new URL("./fixture.js", import.meta.url),
    "utf8",
  );
  await page.setContent(
    html.replace("<head>", `<head><script>${fixture}</script>`),
  );
  await expect(page.locator("#total")).toHaveText("4");
  await page.evaluate(() => {
    window.__pm2Logs = Array.from({ length: 100 }, (_, i) =>
      i === 0
        ? '<img src=x onerror="alert(1)">'
        : `INFO line ${i} ${i === 50 ? "long-token".repeat(100) : "server output"}`,
    ).join("\n");
  });
  await page
    .getByRole("button", { name: "api-production", exact: true })
    .click();
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  const backButton = await page.locator("#close-details").boundingBox();
  const chevron = await page.locator("#close-details svg").boundingBox();
  expect(
    Math.abs(
      backButton.x + backButton.width / 2 - chevron.x - chevron.width / 2,
    ),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      backButton.y + backButton.height / 2 - chevron.y - chevron.height / 2,
    ),
  ).toBeLessThan(1);
  await expect(page.locator(".log-line")).toHaveCount(100);
  const second = await page.locator(".log-line").nth(1).boundingBox();
  const third = await page.locator(".log-line").nth(2).boundingBox();
  expect(Math.abs(third.y - second.y - second.height)).toBeLessThan(1);
  await expect(page.locator("#log-content img")).toHaveCount(0);
  await page.locator("#log-content").evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.locator("#load-logs").click();
  await expect(page.locator("#load-logs")).toBeEnabled();
  expect(
    await page.locator("#log-content").evaluate((node) => node.scrollTop),
  ).toBe(0);
  await page.locator("#jump-logs").click();
  expect(
    await page.locator("#log-content").evaluate((node) => node.scrollTop > 0),
  ).toBe(true);
  await page.locator("#log-wrap").uncheck();
  expect(
    await page
      .locator("#log-content")
      .evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#log-search").fill("line 50");
  await expect(page.locator(".log-line")).toHaveCount(1);
  await expect(page.locator(".log-line")).toHaveAttribute("data-line", "51");
  expect(await page.locator("#log-content").textContent()).not.toMatch(/^51/);
  await page.locator("#log-wrap").check();
  await page.screenshot({ path: "test-results/pm2-log-view.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  const listFooter = await page.locator(".list-footer").boundingBox();
  const logFooter = await page.locator(".log-footer").boundingBox();
  expect(Math.abs(listFooter.y - logFooter.y)).toBeLessThan(1);
  expect(Math.abs(listFooter.height - logFooter.height)).toBeLessThan(1);
});
