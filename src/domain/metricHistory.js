import { processIdentity } from "./processes.js";

const valid = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const identity = (process) =>
  `${processIdentity(process)}:${process.startedAt}:${process.pid}`;

export class MetricHistory {
  records = new Map();

  clear() {
    this.records.clear();
  }

  record(processes, at) {
    if (!valid(at)) return;
    const present = new Set();
    for (const process of processes.slice(0, 250)) {
      present.add(process.id);
      const key = identity(process);
      let record = this.records.get(process.id);
      // A reused ID or restarted process must not inherit the previous lifetime's chart.
      if (record?.key !== key) record = { key, samples: [] };
      const last = record.samples.at(-1);
      if (!last || at > last.at) {
        record.samples.push({
          at,
          cpu:
            process.cpuAvailable !== false && valid(process.cpu)
              ? process.cpu
              : null,
          memory:
            process.memoryAvailable !== false && valid(process.memory)
              ? process.memory
              : null,
        });
        if (record.samples.length > 60) record.samples.shift();
      }
      this.records.set(process.id, record);
    }
    for (const id of this.records.keys())
      if (!present.has(id)) this.records.delete(id);
  }

  get(process) {
    const record = this.records.get(process.id);
    return record?.key === identity(process) ? record.samples : [];
  }
}

export function chartSegments(samples, metric) {
  if (samples.length < 2) return [];
  const values = samples.map((sample) => sample[metric]).filter(valid);
  if (!values.length) return [];
  const max = Math.max(metric === "cpu" ? 100 : 1, ...values);
  const start = samples[0].at;
  const duration = samples.at(-1).at - start;
  if (duration <= 0) return [];
  const segments = [];
  let segment = [];
  for (const sample of samples) {
    if (!valid(sample[metric])) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else
      segment.push([
        ((sample.at - start) / duration) * 280 + 4,
        52 - (sample[metric] / max) * 44,
      ]);
  }
  if (segment.length) segments.push(segment);
  return segments;
}
