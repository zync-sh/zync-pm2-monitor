import test from "node:test";
import assert from "node:assert/strict";
import { processViewState } from "../src/ui/emptyState.js";

test("first load, unavailable executable, command error and empty list stay distinct", () => {
  const state = { loaded: false, busy: true, stale: false, processes: [] };
  assert.equal(processViewState(state, 0), "loading");
  Object.assign(state, {
    busy: false,
    stale: true,
    refreshErrorCode: "EXECUTABLE_NOT_FOUND",
  });
  assert.equal(processViewState(state, 0), "missing");
  state.refreshErrorCode = "COMMAND_FAILED";
  assert.equal(processViewState(state, 0), "error");
  state.loaded = true;
  state.stale = false;
  assert.equal(processViewState(state, 0), "empty");
});
test("a failed refresh of an empty snapshot cannot claim PM2 is responding", () => {
  assert.equal(
    processViewState(
      { loaded: true, stale: true, busy: false, processes: [] },
      0,
    ),
    "error",
  );
});
test("an unavailable executable after an empty snapshot still offers settings", () => {
  assert.equal(
    processViewState(
      {
        loaded: true,
        stale: true,
        busy: false,
        processes: [],
        refreshErrorCode: "EXECUTABLE_NOT_FOUND",
      },
      0,
    ),
    "missing",
  );
});
test("failed refresh retains a previous snapshot rather than replacing it with an error screen", () => {
  const state = { loaded: true, stale: true, processes: [{ id: 1 }] };
  assert.equal(processViewState(state, 1), "ready");
  assert.equal(processViewState(state, 0), "filtered");
});
