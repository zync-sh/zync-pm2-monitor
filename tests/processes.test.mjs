import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProcesses,
  filterProcesses,
  processIdentity,
  formatBytes,
  formatUptime,
  stripTerminalCodes,
} from "../src/domain/processes.js";
import {
  executable,
  mutation,
  logsCommand,
  commandError,
} from "../src/domain/commands.js";

export const processFixture = (id = 0, overrides = {}) => ({
  pm_id: id,
  name: `api-${id}`,
  pid: 123,
  pm2_env: {
    status: "online",
    exec_mode: "cluster_mode",
    created_at: 1,
    pm_uptime: 1000,
    pm_exec_path: "/srv/app.js",
    SECRET: "never-forward-this",
  },
  monit: { cpu: 2.5, memory: 1048576 },
  ...overrides,
});

test("parses PM2 JSON and daemon banners without forwarding environment secrets", () => {
  const list = parseProcesses(
    `\x1b[32m[PM2] Starting daemon\x1b[0m\n${JSON.stringify([processFixture()])}`,
  );
  assert.equal(list[0].id, 0);
  assert.equal(list[0].mode, "cluster");
  assert.ok(!JSON.stringify(list).includes("never-forward-this"));
  assert.equal(list[0].cpu, 2.5);
});
test("rejects malformed lists, repeated ids, missing ids, oversized lists", () => {
  for (const value of [
    "oops",
    "{}",
    "[{}]",
    JSON.stringify([processFixture(), processFixture()]),
    JSON.stringify(Array.from({ length: 251 }, (_, id) => processFixture(id))),
  ]) {
    assert.throws(() => parseProcesses(value));
  }
  assert.deepEqual(parseProcesses("[]"), []);
});
test("hostile names stay inert text and invalid numeric metrics normalize", () => {
  const [process] = parseProcesses(
    JSON.stringify([
      processFixture(2, {
        name: "<img src=x onerror=alert(1)>",
        monit: { cpu: -1, memory: "oops" },
      }),
    ]),
  );
  assert.equal(process.name, "<img src=x onerror=alert(1)>");
  assert.equal(process.cpu, 0);
  assert.equal(process.memory, 0);
  assert.equal(process.cpuAvailable, false);
  assert.equal(process.memoryAvailable, false);
});
test("zero metrics remain valid and restart diagnostics expose only approved fields", () => {
  const [process] = parseProcesses(
    JSON.stringify([
      processFixture(0, {
        monit: { cpu: 0, memory: 0 },
        pm2_env: {
          autorestart: false,
          exit_code: 1,
          max_memory_restart: 1048576,
          SECRET: "hidden",
        },
      }),
    ]),
  );
  assert.equal(process.cpuAvailable, true);
  assert.equal(process.memoryAvailable, true);
  assert.equal(process.autorestart, false);
  assert.equal(process.exitCode, 1);
  assert.equal(process.maxMemoryRestart, 1048576);
  assert.ok(!JSON.stringify(process).includes("hidden"));
});
test("filters, sorts without mutating and distinguishes restarted from replaced processes", () => {
  const a = parseProcesses(
    JSON.stringify([processFixture(1), processFixture(2)]),
  );
  a[1].cpu = 99;
  assert.equal(filterProcesses(a, "", "all", "cpu")[0].id, 2);
  assert.equal(a[0].id, 1);
  assert.equal(filterProcesses(a, "api-1").length, 1);
  assert.equal(
    processIdentity(a[0]),
    processIdentity({ ...a[0], startedAt: 400 }),
  );
  assert.notEqual(
    processIdentity(a[0]),
    processIdentity({ ...a[0], createdAt: 400 }),
  );
});
test("commands accept numeric IDs only, never process names or injected flags", () => {
  assert.deepEqual(mutation("restart", 0), ["restart", "0"]);
  assert.deepEqual(mutation("start", 2), ["start", "2"]);
  for (const id of ["all", "--force", "1; rm -rf /", -1, NaN])
    assert.throws(() => mutation("restart", id));
  assert.throws(() => mutation("kill", 0));
  assert.throws(() => mutation("__proto__", 0));
  assert.deepEqual(logsCommand(0, "err"), [
    "logs",
    "0",
    "--lines",
    "100",
    "--nostream",
    "--raw",
    "--err",
  ]);
  assert.throws(() => logsCommand(0, "raw; kill"));
});
test("executable settings are a single program, not shell syntax", () => {
  assert.equal(
    executable("/home/user/with space/pm2"),
    "/home/user/with space/pm2",
  );
  for (const value of [
    "pm2 && echo bad",
    "sudo pm2",
    "",
    "/tmp/a\nb",
    "--version",
    null,
  ])
    assert.throws(() => executable(value));
});
test("formatting, control stripping and executable-not-found errors", () => {
  assert.equal(formatBytes(1048576), "1.0 MB");
  assert.equal(
    formatUptime({ status: "online", startedAt: 1000 }, 121000),
    "2m",
  );
  assert.equal(stripTerminalCodes("\x1b[31mERROR\x1b[0m\0"), "ERROR");
  assert.match(
    commandError({ exitCode: 127, stderr: "pm2 not found", stdout: "" }),
    /PATH/,
  );
});
