import test from "node:test";
import assert from "node:assert/strict";
import { processDiagnostics, actionReport } from "../src/domain/diagnostics.js";
test("diagnostics distinguish lifetime restarts from an active crash loop", () => {
  const messages = processDiagnostics({
    status: "errored",
    restarts: 20,
    exitCode: 1,
    autorestart: false,
    cpuAvailable: false,
  });
  assert.equal(messages.length, 5);
  assert.match(messages[1], /does not prove/);
  assert.deepEqual(
    processDiagnostics({
      status: "online",
      restarts: 0,
      exitCode: 0,
      autorestart: true,
    }),
    [],
  );
});
test("batch results name each process without claiming its final health", () => {
  const report = actionReport(
    "restart",
    [
      { id: 1, ok: true },
      { id: 2, ok: false, error: "Not attempted" },
    ],
    new Map([
      [1, "api"],
      [2, "worker"],
    ]),
  );
  assert.match(report, /#1 api: Command completed/);
  assert.match(report, /#2 worker: Not attempted/);
  assert.match(report, /Refresh before retrying/);
});
