import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createPm2Service } from "../../src/worker/service.js";
import { parseProcesses, processIdentity } from "../../src/domain/processes.js";

const run = promisify(execFile);
const runtime = process.argv[2];
if (
  !/^\/home\/gajen\/\.cache\/zync-pm2-smoke\.[a-zA-Z0-9]+$/.test(runtime ?? "")
)
  throw new Error("Pass the isolated runtime printed by prepare.sh");
const toWsl = (value) =>
  `/mnt/${value[0].toLowerCase()}${value.slice(2).replaceAll("\\", "/")}`;
const executor = toWsl(fileURLToPath(new URL("./execute.sh", import.meta.url)));
const script = toWsl(fileURLToPath(new URL("./fixture.cjs", import.meta.url)));
async function pm2(args) {
  try {
    const result = await run(
      "wsl.exe",
      ["-d", "Ubuntu", "-u", "gajen", "--", "sh", executor, runtime, ...args],
      { timeout: 25000, maxBuffer: 2 * 1024 * 1024 },
    );
    return { ...result, exitCode: 0, connectionToken: "isolated-wsl-fixture" };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return {
      stdout: error.stdout,
      stderr: error.stderr,
      exitCode: error.code,
      connectionToken: "isolated-wsl-fixture",
    };
  }
}
const replies = [];
const service = createPm2Service({
  panel: {
    postMessage: async (_pane, reply) => {
      replies.push(reply);
    },
  },
  ui: { confirm: async () => true },
  sshCommand: {
    execute: async (_pane, request) => {
      assert.ok(
        !request.expectedConnectionToken ||
          request.expectedConnectionToken === "isolated-wsl-fixture",
      );
      return pm2(request.args);
    },
  },
});
async function request(type, extra = {}) {
  replies.length = 0;
  await service({
    paneInstanceId: "test-pane",
    message: {
      requestId: "smoke",
      type,
      program: "pm2",
      connectionToken: "isolated-wsl-fixture",
      ...extra,
    },
  });
  assert.ok(!replies.at(-1).error, replies.at(-1).error);
  return {
    ...replies.at(-1).result,
    processes: replies.flatMap((reply) => reply.chunk ?? []),
  };
}
try {
  const started = await pm2([
    "start",
    script,
    "--name",
    "zync-pm2-smoke",
    "-i",
    "1",
  ]);
  assert.equal(started.exitCode, 0, started.stderr);
  const snapshot = await request("refresh");
  assert.equal(snapshot.processes.length, 1);
  assert.equal(snapshot.processes[0].status, "online");
  const process = snapshot.processes[0];
  let target = { id: process.id, identity: processIdentity(process) };
  const logs = await request("logs", { id: process.id, stream: "all" });
  assert.match(logs.text, /zync-pm2-fixture/);
  assert.match(
    (await request("logs", { id: process.id, stream: "out" })).text,
    /zync-pm2-fixture ready/,
  );
  assert.match(
    (await request("logs", { id: process.id, stream: "err" })).text,
    /zync-pm2-fixture diagnostic/,
  );
  for (const action of ["reload", "restart", "stop"]) {
    const result = await request("action", { action, targets: [target] });
    assert.equal(result.outcomes[0].ok, true, JSON.stringify(result));
    const current = (await request("refresh")).processes[0];
    target = { id: current.id, identity: processIdentity(current) };
  }
  assert.equal((await request("refresh")).processes[0].status, "stopped");
  assert.equal(
    (await request("action", { action: "restart", targets: [target] }))
      .outcomes[0].ok,
    true,
  );
  const resumed = (await request("refresh")).processes[0];
  target = { id: resumed.id, identity: processIdentity(resumed) };
  assert.equal((await request("save")).canceled, false);
  assert.equal(
    (await request("action", { action: "delete", targets: [target] }))
      .outcomes[0].ok,
    true,
  );
  assert.equal(parseProcesses((await pm2(["jlist"])).stdout).length, 0);
  assert.equal((await request("save")).canceled, false);
  console.log(
    "Real WSL PM2 smoke passed: list, logs, restart, stop, resume, save, delete, empty list.",
  );
} finally {
  // This is the private PM2_HOME created for this run, never the user's daemon.
  await pm2(["kill"]);
}
