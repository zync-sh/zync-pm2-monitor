import test from "node:test";
import assert from "node:assert/strict";
import { MetricHistory, chartSegments } from "../src/domain/metricHistory.js";
const process = {
  id: 1,
  createdAt: 1,
  name: "api",
  script: "/app.js",
  pid: 12,
  startedAt: 3,
  cpu: 0,
  memory: 100,
};

test("history is bounded, ordered and reset on process restart or connection change", () => {
  const history = new MetricHistory();
  for (let at = 1; at <= 80; at++) history.record([process], at);
  assert.equal(history.get(process).length, 60);
  history.record([process], 80);
  history.record([process], 2);
  assert.equal(history.get(process).length, 60);
  const restarted = { ...process, startedAt: 10 };
  history.record([restarted], 81);
  assert.equal(history.get(restarted).length, 1);
  assert.equal(history.get(process).length, 0);
  history.clear();
  assert.equal(history.get(restarted).length, 0);
});
test("missing metrics leave chart gaps; zero remains a real sample", () => {
  const history = new MetricHistory();
  history.record([process], 1);
  history.record([{ ...process, cpuAvailable: false }], 2);
  history.record([{ ...process, cpu: 5 }], 3);
  assert.deepEqual(
    history.get(process).map((sample) => sample.cpu),
    [0, null, 5],
  );
  assert.equal(chartSegments(history.get(process), "cpu").length, 2);
  history.record([], 4);
  assert.equal(history.records.size, 0);
});
