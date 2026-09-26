import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile(
  new URL("../dist/ui/index.html", import.meta.url),
  "utf8",
);
const fixture = await readFile(
  new URL("../tests/browser/fixture.js", import.meta.url),
  "utf8",
);
const page = html.replace("<head>", `<head><script>${fixture}</script>`);
const port = Number(process.env.PM2_PREVIEW_PORT || 4178);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid PM2_PREVIEW_PORT");
createServer((request, response) => {
  if (request.url !== "/") {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(page);
}).listen(port, "127.0.0.1", () =>
  console.log(`PM2 UI preview (simulated server): http://127.0.0.1:${port}`),
);
