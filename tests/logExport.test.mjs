import test from "node:test";
import assert from "node:assert/strict";
import { exportLogSnapshot } from "../src/worker/logExport.js";
function setup({
  confirm = true,
  file = { handle: "host-owned" },
  denied = false,
} = {}) {
  const events = [];
  return {
    events,
    api: {
      ui: {
        confirm: async () => {
          events.push("confirm");
          return confirm;
        },
      },
      filesystem: {
        pickWriteFile: async () => {
          events.push("pick");
          if (denied) throw new Error("Plugin permission is not granted");
          return file;
        },
        writeText: async (handle, content) => {
          events.push([handle, content]);
        },
      },
    },
  };
}
test("export uses the host picker without a duplicate plugin confirmation", async () => {
  const fixture = setup();
  assert.deepEqual(await exportLogSnapshot(fixture.api, "ERROR test"), {
    canceled: false,
  });
  assert.deepEqual(fixture.events, ["pick", ["host-owned", "ERROR test"]]);
});
test("canceling the picker writes nothing", async () => {
  for (const options of [{ file: null }]) {
    const fixture = setup(options);
    assert.equal((await exportLogSnapshot(fixture.api, "test")).canceled, true);
    assert.ok(fixture.events.every((event) => typeof event === "string"));
  }
});
test("denied permission and invalid content never write files", async () => {
  const fixture = setup({ denied: true });
  await assert.rejects(exportLogSnapshot(fixture.api, "test"), /not granted/);
  assert.deepEqual(fixture.events, ["pick"]);
  for (const content of ["", " ", null, "x".repeat(12001)]) {
    const invalid = setup();
    await assert.rejects(
      exportLogSnapshot(invalid.api, content),
      /Load a log snapshot/,
    );
    assert.deepEqual(invalid.events, []);
  }
});
