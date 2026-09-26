import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

test("AI panel resize captures drags across a plugin frame and cleans up on blur and unmount", async ({
  page,
}) => {
  const hostDirectory = fileURLToPath(
    new URL("../../../zync", import.meta.url),
  );
  test.skip(
    !existsSync(`${hostDirectory}/src/components/ai/useAiSidebarResize.ts`),
    "Requires sibling Zync checkout",
  );
  const bundle = await build({
    stdin: {
      resolveDir: hostDirectory,
      contents: `
        import React from 'react'; import { createRoot } from 'react-dom/client';
        import { useAiSidebarResize } from './src/components/ai/useAiSidebarResize';
        function Harness() {
          const resize = useAiSidebarResize();
          return React.createElement('div', { style:{ display:'flex', height:600 } },
            React.createElement('iframe', { sandbox:'allow-scripts', srcDoc:'<button>Plugin</button>', style:{ flex:1, minWidth:0, border:0 } }),
            React.createElement('aside', { id:'ai', ref:resize.sidebarOuterRef, style:{ width:resize.width, flexShrink:0, position:'relative' } },
              React.createElement('div', { ref:resize.sidebarInnerRef, style:{ width:resize.width } }, 'AI panel'),
              React.createElement('div', { id:'ai-resize', ...resize.resizeHandlers, style:{ position:'absolute', top:0, bottom:0, left:0, width:8, touchAction:'none' } })));
        } window.testRoot = createRoot(document.getElementById('root')); window.testRoot.render(React.createElement(Harness));`,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.setContent('<style>body{margin:0}</style><div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const handle = page.locator("#ai-resize");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 2, 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 180, 200, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator("#ai")
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBe(482);
  expect(await page.evaluate(() => document.body.style.cursor)).toBe("");
  await page.frameLocator("iframe").getByRole("button").click();
  const next = await handle.boundingBox();
  await page.mouse.move(next.x + 2, 200);
  await page.mouse.down();
  await page.mouse.move(next.x - 40, 200);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect
    .poll(() => page.evaluate(() => document.body.style.cursor))
    .toBe("");
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator("#ai")
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBe(524);
  const last = await handle.boundingBox();
  await page.mouse.move(last.x + 2, 200);
  await page.mouse.down();
  await page.evaluate(() => window.testRoot.unmount());
  await expect
    .poll(() => page.evaluate(() => document.body.style.cursor))
    .toBe("");
  await page.mouse.up();
});

test("host sidebar hook captures drags across plugin frames and its list scrolls without focus", async ({
  page,
}) => {
  const hostDirectory = fileURLToPath(
    new URL("../../../zync", import.meta.url),
  );
  test.skip(
    !existsSync(
      `${hostDirectory}/src/components/layout/sidebar/useSidebarResize.ts`,
    ),
    "Optional host integration check requires the sibling Zync checkout",
  );
  const bundle = await build({
    stdin: {
      resolveDir: hostDirectory,
      contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import { useSidebarResize } from './src/components/layout/sidebar/useSidebarResize';
      function Harness() {
        const resize = useSidebarResize(288, width => window.savedWidth = width);
        return React.createElement('div', { style: { display:'flex', height:600 } },
          React.createElement('aside', { style:{ width:resize.width, position:'relative', display:'flex', flexDirection:'column', minHeight:0, flexShrink:0 } },
            React.createElement('div', { id:'host-list', style:{ flex:1, minHeight:0, overflowY:'auto' } }, Array.from({length:80}, (_, i) => React.createElement('div', { key:i, style:{ height:30 } }, 'Host '+i))),
            React.createElement('div', { id:'resize', ...resize.handlers, role:'separator', tabIndex:0, style:{ position:'absolute', right:0, top:0, bottom:0, width:8, touchAction:'none' } })),
          React.createElement('iframe', { sandbox:'allow-scripts', srcDoc:'<button>Plugin</button>', style:{ flex:1, border:0 } }));
      } createRoot(document.getElementById('root')).render(React.createElement(Harness));`,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.setContent('<style>body{margin:0}</style><div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.locator("#resize")).toBeVisible();
  await page.mouse.move(284, 200);
  await page.mouse.down();
  await page.mouse.move(450, 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.savedWidth)).toBe(450);
  await page.frameLocator("iframe").getByRole("button").click();
  await page.mouse.move(100, 250);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => page.locator("#host-list").evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  await page.locator("#resize").focus();
  await page.keyboard.press("Home");
  await expect.poll(() => page.evaluate(() => window.savedWidth)).toBe(200);
  expect(await page.evaluate(() => document.body.style.cursor)).toBe("");
});
