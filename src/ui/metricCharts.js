import { chartSegments } from "../domain/metricHistory.js";
import { formatBytes } from "../domain/processes.js";

export function renderMetricCharts(process, history, stale, paused) {
  const samples = history.get(process);
  for (const metric of ["cpu", "memory"]) {
    const target = document.getElementById(`history-${metric}`);
    const points = chartSegments(samples, metric);
    const values = samples
      .map((sample) => sample[metric])
      .filter((value) => value !== null);
    const summary = document.createElement("small");
    summary.textContent =
      values.length < 2
        ? "Collecting samples…"
        : `Peak ${metric === "cpu" ? `${Math.max(...values).toFixed(1)}%` : formatBytes(Math.max(...values))} · ${values.length} readings`;
    target.replaceChildren(summary);
    if (!points.length) continue;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 288 60");
    svg.setAttribute("aria-hidden", "true");
    for (const segment of points) {
      // Missing samples break the trace rather than drawing invented readings.
      if (segment.length < 2) continue;
      const line = document.createElementNS(svg.namespaceURI, "polyline");
      line.setAttribute(
        "points",
        segment.map((point) => point.join(",")).join(" "),
      );
      svg.append(line);
    }
    target.append(svg);
  }
  document.getElementById("history-status").textContent = samples.length
    ? `${stale ? "Stale snapshot" : paused ? "Paused" : "Sampled history"} · ${new Date(samples.at(-1).at).toLocaleTimeString()} · last 60 snapshots in this pane`
    : "History starts when this pane loads";
}
