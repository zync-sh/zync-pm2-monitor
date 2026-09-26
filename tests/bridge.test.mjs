import test from "node:test";
import assert from "node:assert/strict";
import { createBridge } from "../src/ui/bridge.js";

test("a synchronous send failure cancels its pending timeout", async (t) => {
  t.mock.method(globalThis, "setTimeout", () => 42);
  const clear = t.mock.method(globalThis, "clearTimeout", () => {});
  const request = createBridge({
    onMessage() {},
    postMessage() {
      throw new Error("Pane closed");
    },
  });
  await assert.rejects(request("refresh"), /Pane closed/);
  assert.equal(clear.mock.callCount(), 1);
  assert.deepEqual(clear.mock.calls[0].arguments, [42]);
});

test("remounted panes cannot consume replies from an older frame", async () => {
  const listeners = [];
  const sent = [];
  const pane = {
    onMessage: (listener) => listeners.push(listener),
    postMessage: (message) => sent.push(message),
  };
  const first = createBridge(pane)("refresh");
  const second = createBridge(pane)("refresh");
  assert.notEqual(sent[0].requestId, sent[1].requestId);
  assert.ok(sent.every((message) => message.requestId.length < 80));
  for (const listener of listeners)
    listener({ requestId: sent[0].requestId, result: { marker: "old" } });
  for (const listener of listeners)
    listener({ requestId: sent[1].requestId, result: { marker: "new" } });
  assert.equal((await first).marker, "old");
  assert.equal((await second).marker, "new");
});
