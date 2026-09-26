import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validatePackageDirectory } from "@zync-sh/plugin-sdk/validate";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}dist`;
await mkdir(`${output}/ui`, { recursive: true });
await build({
  entryPoints: [`${root}src/worker/index.js`],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: `${output}/worker.js`,
});
const ui = await build({
  entryPoints: [`${root}src/ui/index.js`],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
});
const html = await readFile(`${root}src/ui/index.html`, "utf8");
const icon = await readFile(`${root}src/icons/process-manager.svg`, "utf8");
await mkdir(`${output}/icons`, { recursive: true });
await copyFile(
  `${root}src/icons/process-manager.svg`,
  `${output}/icons/process-manager.svg`,
);
const sharedCss = await readFile(
  fileURLToPath(import.meta.resolve("@zync-sh/plugin-ui/styles.css")),
  "utf8",
);
const css =
  sharedCss +
  "\n" +
  (
    await Promise.all(
      ["base", "overview", "process-list", "details", "responsive"].map(
        (name) => readFile(`${root}src/ui/styles/${name}.css`, "utf8"),
      ),
    )
  ).join("\n");
await writeFile(
  `${output}/ui/index.html`,
  html
    .replaceAll("<!-- PROCESS ICON -->", icon)
    .replace("<!-- STYLES -->", `<style>${css}</style>`)
    .replace(
      "<!-- SCRIPT -->",
      `<script>${ui.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
    ),
);
await copyFile(`${root}manifest.json`, `${output}/manifest.json`);
await copyFile(`${root}LICENSE`, `${output}/LICENSE`);
// The published SDK accepts an explicit host API target. The new SSH method
// requires host API 2.1, so older Zync versions must reject this package.
const validation = validatePackageDirectory(output, {
  pluginApiVersion: "2.1.0",
});
if (!validation.valid) throw new Error(JSON.stringify(validation.issues));
console.log(`Built and validated ${output}`);
