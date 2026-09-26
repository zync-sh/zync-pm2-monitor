import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("dist/manifest.json", root), "utf8"),
);
const entries = {};
for (const file of [
  "manifest.json",
  "worker.js",
  "ui/index.html",
  "LICENSE",
  "icons/process-manager.svg",
]) {
  entries[file] = [
    new Uint8Array(await readFile(new URL(`dist/${file}`, root))),
    { mtime: new Date("2026-01-01T00:00:00Z") },
  ];
}
const zip = zipSync(entries, { level: 9 });
const filename = `pm2-monitor-${manifest.version}.zip`;
await writeFile(new URL(`dist/${filename}`, root), zip);
const sha256 = createHash("sha256").update(zip).digest("hex");
await writeFile(
  new URL(`dist/${filename}.sha256`, root),
  `${sha256}  ${filename}\n`,
);
console.log(
  `Packaged dist/${filename} (${zip.length.toLocaleString()} bytes)\nSHA-256 ${sha256}\nUnsigned local test package; not a marketplace release.`,
);
