import test from "node:test";
import assert from "node:assert/strict";
import { createPm2Service } from "../src/worker/service.js";
import { parseProcesses, processIdentity } from "../src/domain/processes.js";

test("denied export is JSON-safe and retry succeeds without a plugin confirmation", async () => {
  const replies = [];
  let attempts = 0;
  let writes = 0;
  const service = createPm2Service({
    panel: { postMessage: async (_pane, reply) => replies.push(reply) },
    ui: {
      confirm: async () => {
        assert.fail("Export must not show a duplicate confirmation");
      },
    },
    filesystem: {
      pickWriteFile: async () => {
        if (++attempts === 1) throw new Error("Permission denied");
        return { handle: "selected" };
      },
      writeText: async () => {
        writes++;
      },
    },
  });
  const request = {
    paneInstanceId: "pane-a",
    message: { type: "export-logs", requestId: "export", content: "test log" },
  };
  await service(request);
  assert.match(replies[0].error, /Permission denied/);
  assert.deepEqual(
    structuredClone(replies[0]),
    JSON.parse(JSON.stringify(replies[0])),
  );
  assert.equal(writes, 0);
  await service(request);
  assert.deepEqual(replies[1].result, { canceled: false });
  assert.equal(writes, 1);
});

test("save explicitly confirms replacing even an empty resurrection snapshot", async () => {
  const fixture = setup();
  await fixture.send("save");
  assert.match(fixture.dialogs[0].message, /including an empty list/);
  assert.deepEqual(fixture.calls[0].args, ["save", "--force"]);
});

const raw = (id) => ({
  pm_id: id,
  name: `app-${id}`,
  pm2_env: {
    created_at: id + 1,
    status: "online",
    exec_mode: "cluster_mode",
    pm_exec_path: "/app.js",
  },
});

test("an uncoded operation error replies with JSON-safe fields and leaves the service usable", async () => {
  const fixture = setup({
    execute: () => {
      throw new Error("Permission denied");
    },
  });
  await fixture.send("refresh");
  const reply = fixture.replies.at(-1);
  assert.match(reply.error, /Permission denied/);
  assert.equal(Object.hasOwn(reply, "errorCode"), false);
  assert.deepEqual(structuredClone(reply), JSON.parse(JSON.stringify(reply)));
  await fixture.send("refresh");
  assert.match(fixture.replies.at(-1).error, /Permission denied/);
});

test("missing executable carries a distinct error code without running an installer", async () => {
  const fixture = setup({
    execute: () => ({ exitCode: 127, stdout: "", stderr: "pm2: not found" }),
  });
  await fixture.send("refresh");
  assert.equal(fixture.replies.at(-1).errorCode, "EXECUTABLE_NOT_FOUND");
  assert.equal(fixture.calls.length, 1);
});

test("custom Node.js runs the absolute PM2 script without shell startup or interpolation", async () => {
  const fixture = setup({
    execute: () => ({
      exitCode: 0,
      stdout: "[]",
      stderr: "",
      connectionToken: "server-a",
    }),
  });
  await fixture.send("refresh", {
    program: "/home/user/nvm/bin/pm2",
    nodeProgram: "/home/user/nvm/bin/node",
  });
  assert.equal(fixture.calls[0].program, "/home/user/nvm/bin/node");
  assert.deepEqual(fixture.calls[0].args, ["/home/user/nvm/bin/pm2", "jlist"]);
  await fixture.send("refresh", {
    program: "pm2",
    nodeProgram: "/home/user/node",
  });
  assert.match(fixture.replies.at(-1).error, /absolute paths/);
});
test("first refresh omits the token until the server returns one", async () => {
  const fixture = setup();
  await fixture.send("refresh");
  assert.equal(
    Object.hasOwn(fixture.calls[0], "expectedConnectionToken"),
    false,
  );
  assert.equal(fixture.replies.at(-1).result.connectionToken, "server-a");

  await fixture.send("logs", { id: 0 });
  assert.equal(fixture.calls[1].expectedConnectionToken, "server-a");
});
const targets = (ids) =>
  parseProcesses(JSON.stringify(ids.map(raw))).map((item) => ({
    id: item.id,
    identity: processIdentity(item),
  }));
function setup({ confirm = true, execute, list = [raw(0)] } = {}) {
  const calls = [],
    replies = [],
    dialogs = [];
  const service = createPm2Service({
    panel: {
      postMessage: async (pane, reply) => {
        replies.push({ pane, ...reply });
      },
    },
    ui: {
      confirm: async (options) => {
        dialogs.push(options);
        return typeof confirm === "function" ? confirm(options) : confirm;
      },
    },
    sshCommand: {
      execute: async (pane, request) => {
        calls.push({ pane, ...request });
        const custom = await execute?.(pane, request, calls.length);
        return (
          custom ?? {
            exitCode: 0,
            stdout: request.args[0] === "jlist" ? JSON.stringify(list) : "done",
            stderr: "",
            connectionToken: "server-a",
          }
        );
      },
    },
  });
  const send = (type, extra = {}, paneInstanceId = "pane-a") =>
    service({
      paneInstanceId,
      message: {
        type,
        requestId: "test",
        program: "pm2",
        connectionToken: "server-a",
        ...extra,
      },
    });
  return { send, calls, replies, dialogs };
}

test("large lists use bounded envelopes and expose no environment data", async () => {
  const fixture = setup({
    list: Array.from({ length: 250 }, (_, id) => ({
      ...raw(id),
      pm2_env: { ...raw(id).pm2_env, SECRET: "secret-value" },
    })),
  });
  await fixture.send("refresh");
  assert.equal(
    fixture.replies.flatMap((reply) => reply.chunk ?? []).length,
    250,
  );
  assert.ok(
    fixture.replies.every(
      (reply) => Buffer.byteLength(JSON.stringify(reply)) < 65536,
    ),
  );
  assert.ok(!JSON.stringify(fixture.replies).includes("secret-value"));
  assert.equal(fixture.replies.at(-1).result.connectionToken, "server-a");
});
test("canceling confirmation makes no mutation", async () => {
  const fixture = setup({ confirm: false });
  await fixture.send("action", { action: "delete", targets: targets([0]) });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.replies.at(-1).result.canceled, true);
});
test("mutation rechecks process identity after confirmation and uses only numeric ids", async () => {
  const fixture = setup();
  await fixture.send("action", { action: "restart", targets: targets([0]) });
  assert.deepEqual(
    fixture.calls.map((call) => call.args),
    [["jlist"], ["jlist"], ["restart", "0"]],
  );
  assert.ok(
    fixture.calls.every(
      (call) =>
        call.pane === "pane-a" && call.expectedConnectionToken === "server-a",
    ),
  );
});
test("start is available for a stopped process, but not an online one", async () => {
  const stopped = {
    ...raw(2),
    pm2_env: { ...raw(2).pm2_env, status: "stopped" },
  };
  const fixture = setup({ list: [stopped] });
  const target = parseProcesses(JSON.stringify([stopped]))[0];
  await fixture.send("action", {
    action: "start",
    targets: [{ id: target.id, identity: processIdentity(target) }],
  });
  assert.deepEqual(
    fixture.calls.map((call) => call.args),
    [["jlist"], ["jlist"], ["start", "2"]],
  );
  const online = setup();
  await online.send("action", { action: "start", targets: targets([0]) });
  assert.match(online.replies.at(-1).error, /already running/);
  assert.equal(online.calls.length, 1);
});
test("reused process id while dialog was open is not mutated", async () => {
  const fixture = setup({
    execute: (_pane, request, count) =>
      count === 2
        ? {
            exitCode: 0,
            stdout: JSON.stringify([{ ...raw(0), name: "different-app" }]),
            stderr: "",
            connectionToken: "server-a",
          }
        : undefined,
  });
  await fixture.send("action", { action: "stop", targets: targets([0]) });
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.replies.at(-1).result.outcomes[0].ok, false);
});
test("server rebind after confirmation fails closed instead of switching hosts", async () => {
  const fixture = setup({
    execute: (_pane, _request, count) => {
      if (count === 2) throw new Error("Connection changed");
    },
  });
  await fixture.send("action", { action: "restart", targets: targets([0]) });
  assert.match(fixture.replies.at(-1).error, /Connection changed/);
  assert.equal(fixture.calls.length, 2);
});
test("a failed batch stops and reports the unattempted processes", async () => {
  const fixture = setup({
    list: [raw(0), raw(1), raw(2)],
    execute: (_pane, request) =>
      request.args[0] === "stop"
        ? {
            exitCode: 1,
            stdout: "",
            stderr: "denied",
            connectionToken: "server-a",
          }
        : undefined,
  });
  await fixture.send("action", { action: "stop", targets: targets([0, 1, 2]) });
  const outcomes = fixture.replies.at(-1).result.outcomes;
  assert.equal(outcomes.length, 3);
  assert.match(outcomes[1].error, /Not attempted/);
  assert.equal(
    fixture.calls.filter((call) => call.args[0] === "stop").length,
    1,
  );
});
test("untrusted message cannot execute arbitrary commands or unconfirmed save", async () => {
  const fixture = setup({ confirm: false });
  await fixture.send("action", { action: "kill", targets: targets([0]) });
  assert.equal(fixture.calls.length, 0);
  await fixture.send("save");
  assert.equal(fixture.calls.length, 0);
  await fixture.send("action", {
    action: "restart",
    targets: targets([0]),
    connectionToken: undefined,
  });
  assert.equal(fixture.calls.length, 0);
});
test("bounds logs by size, removes control codes and preserves pane identity", async () => {
  const fixture = setup({
    execute: () => ({
      exitCode: 0,
      stdout: "\x1b[31m" + "x".repeat(20000),
      stderr: "",
      connectionToken: "server-a",
    }),
  });
  await fixture.send("logs", { id: 0, stream: "all" }, "pane-b");
  const result = fixture.replies.at(-1).result;
  assert.equal(result.text.length, 12000);
  assert.equal(result.truncated, true);
  assert.equal(fixture.calls[0].pane, "pane-b");
});
test("deduplicates concurrent operations in a pane but permits an independent pane", async () => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const fixture = setup({
    execute: async (pane) => {
      if (pane === "pane-a") await waiting;
    },
  });
  const first = fixture.send("refresh");
  await fixture.send("refresh");
  assert.match(fixture.replies.at(-1).error, /Another operation/);
  await fixture.send("refresh", {}, "pane-b");
  release();
  await first;
  assert.equal(fixture.calls.length, 2);
});
