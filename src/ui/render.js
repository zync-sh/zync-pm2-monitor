import { renderLogSnapshot } from "./logView.js";
import { renderMetricCharts } from "./metricCharts.js";
import { processDiagnostics } from "../domain/diagnostics.js";
import {
  filterProcesses,
  formatBytes,
  formatUptime,
} from "../domain/processes.js";
import { closeActionMenu, openActionMenu } from "./actionMenu.js";

export const $ = (id) => document.getElementById(id);
const rowCache = new Map();
const cpuLabel = (process) =>
  process.cpuAvailable === false ? "Unavailable" : `${process.cpu.toFixed(1)}%`;
const memoryLabel = (process) =>
  process.memoryAvailable === false
    ? "Unavailable"
    : formatBytes(process.memory);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function statusPill(status) {
  const pill = element("span", undefined, `status-pill ${status}`);
  pill.append(element("i", undefined, "dot"), document.createTextNode(status));
  return pill;
}

function meter(value, max, label, danger) {
  const wrap = element("div", undefined, `meter${danger ? " warning" : ""}`);
  wrap.append(element("span", label, "meter-label"));
  const track = element("span", undefined, "meter-track");
  const fill = element("span", undefined, "meter-fill");
  fill.style.width = `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
  track.append(fill);
  wrap.append(track);
  return wrap;
}

function actionButton(process, action, onAction) {
  const labels = {
    start: "Start",
    restart: "Restart",
    reload: "Reload",
    stop: "Stop",
    delete: "Delete",
  };
  const glyphs = {
    start: "▶",
    restart: "↻",
    reload: "⟳",
    stop: "■",
    delete: "✕",
  };
  const button = element(
    "button",
    glyphs[action],
    `row-action ${action === "delete" ? "danger" : ""}`,
  );
  button.type = "button";
  button.dataset.tooltip = `${labels[action]} ${process.name}`;
  button.setAttribute("aria-label", button.dataset.tooltip);
  button.disabled = action === "reload" && process.mode !== "cluster";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onAction(action, process.id);
  });
  return button;
}

export function renderRows(state, onSelect, onOpen, onAction, onLogs) {
  // A refresh invalidates menu choices; never leave actions bound to an old row.
  closeActionMenu();
  const visible = filterProcesses(
    state.processes,
    $("search").value,
    $("status").value,
    $("sort").value,
  );
  const rows = [];
  const visibleIds = new Set(visible.map((process) => process.id));
  for (const id of rowCache.keys())
    if (!visibleIds.has(id)) rowCache.delete(id);
  for (const process of visible) {
    const signature = JSON.stringify([
      process,
      state.selected.has(process.id),
      state.detailId === process.id,
    ]);
    const cached = rowCache.get(process.id);
    if (cached?.signature === signature) {
      cached.row.querySelector('input[type="checkbox"]').disabled =
        state.busy || state.stale;
      cached.row.querySelector(".uptime-cell").textContent =
        formatUptime(process);
      cached.row.querySelectorAll(
        ".compact-metrics > span",
      )[2].lastChild.textContent = formatUptime(process);
      rows.push(cached.row);
      continue;
    }
    const row = element("tr");
    row.dataset.current = String(state.detailId === process.id);
    const checkCell = element("td", undefined, "check-cell");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(process.id);
    checkbox.setAttribute(
      "aria-label",
      `Select ${process.name} #${process.id}`,
    );
    checkbox.disabled = state.busy || state.stale;
    checkbox.addEventListener("change", () =>
      onSelect(process.id, checkbox.checked),
    );
    checkCell.append(checkbox);

    const idCell = element("td", `#${process.id}`, "id-cell");
    const nameCell = element("td", undefined, "name-cell");
    const name = element("button", process.name, "process-name");
    name.dataset.tooltip = process.name;
    name.setAttribute("aria-label", process.name);
    name.addEventListener("click", () => onOpen(process.id));
    nameCell.append(name, element("span", process.namespace, "process-meta"));
    const statusCell = element("td", undefined, "status-cell");
    statusCell.append(statusPill(process.status));

    const cpuCell = element("td", undefined, "cpu-cell");
    cpuCell.append(
      meter(process.cpu, 100, cpuLabel(process), process.cpu > 70),
    );
    const memoryCell = element("td", undefined, "memory-cell");
    memoryCell.append(
      meter(
        process.memory,
        512 * 1024 * 1024,
        memoryLabel(process),
        process.memory > 450 * 1024 * 1024,
      ),
    );

    const actionCell = element("td", undefined, "action-cell");
    const actions =
      process.status === "online" || process.status === "launching"
        ? ["restart", "reload", "stop", "delete"]
        : ["start", "delete"];
    for (const action of actions)
      actionCell.append(actionButton(process, action, onAction));
    const logs = element("button", "logs", "row-logs");
    logs.type = "button";
    logs.dataset.tooltip = `Open logs for ${process.name}`;
    logs.addEventListener("click", (event) => {
      event.stopPropagation();
      onLogs(process.id);
    });
    actionCell.append(logs);
    const menuTrigger = element(
      "button",
      undefined,
      "row-menu-trigger icon-button",
    );
    const dots = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dots.setAttribute("viewBox", "0 0 18 18");
    dots.setAttribute("width", "18");
    dots.setAttribute("height", "18");
    dots.setAttribute("aria-hidden", "true");
    for (const x of [3, 9, 15]) {
      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", "9");
      dot.setAttribute("r", "1.5");
      dot.setAttribute("fill", "currentColor");
      dots.append(dot);
    }
    menuTrigger.append(dots);
    menuTrigger.type = "button";
    menuTrigger.setAttribute(
      "aria-label",
      `Actions for ${process.name} #${process.id}`,
    );
    menuTrigger.setAttribute("aria-haspopup", "menu");
    menuTrigger.setAttribute("aria-expanded", "false");
    menuTrigger.setAttribute("aria-controls", "process-action-menu");
    menuTrigger.addEventListener("click", () =>
      openActionMenu(menuTrigger, [
        { label: "View details", run: () => onOpen(process.id) },
        { label: "View logs", run: () => onLogs(process.id) },
        ...actions.map((action) => ({
          label: action[0].toUpperCase() + action.slice(1),
          danger: action === "delete",
          disabled:
            state.busy ||
            state.stale ||
            (action === "reload" && process.mode !== "cluster"),
          run: () => onAction(action, process.id),
        })),
      ]),
    );
    actionCell.append(menuTrigger);

    const compactMetrics = element("td", undefined, "compact-metrics");
    for (const [label, value] of [
      ["CPU", cpuLabel(process)],
      ["Memory", memoryLabel(process)],
      ["Uptime", formatUptime(process)],
      ["Restarts", String(process.restarts)],
    ]) {
      const metric = element("span");
      metric.append(
        element("span", label, "metric-label"),
        element("span", value),
      );
      compactMetrics.append(metric);
    }
    row.append(
      checkCell,
      idCell,
      nameCell,
      statusCell,
      element("td", process.mode, "mode-cell"),
      element("td", process.pid ? String(process.pid) : "—", "pid-cell"),
      element("td", formatUptime(process), "uptime-cell"),
      element(
        "td",
        String(process.restarts),
        `restarts-cell ${process.restarts >= 10 ? "warning" : ""}`,
      ),
      cpuCell,
      memoryCell,
      actionCell,
      compactMetrics,
    );
    rowCache.set(process.id, { signature, row });
    rows.push(row);
  }
  const focused = document.activeElement?.getAttribute("aria-label");
  // Keep unchanged controls mounted so polling doesn't steal focus or reset hover.
  const body = $("rows");
  const wanted = new Set(rows);
  for (const row of [...body.children]) if (!wanted.has(row)) row.remove();
  rows.forEach((row, index) => {
    if (body.children[index] !== row)
      body.insertBefore(row, body.children[index] ?? null);
  });
  if (focused)
    [...$("rows").querySelectorAll("[aria-label]")]
      .find((node) => node.getAttribute("aria-label") === focused)
      ?.focus({ preventScroll: true });
  $("select-all").checked =
    visible.length > 0 && visible.every((item) => state.selected.has(item.id));
  $("select-all").indeterminate =
    visible.some((item) => state.selected.has(item.id)) &&
    !$("select-all").checked;
  $("select-all").disabled = state.busy || state.stale || !visible.length;
  $("process-count").textContent = state.loaded
    ? `${visible.length} of ${state.processes.length} processes${state.stale ? " · stale data" : ""}`
    : "Waiting for server";
  $("bulk").hidden = !state.selected.size;
  $("selection-count").textContent = `${state.selected.size} selected`;
  return visible.length;
}

export function renderMetrics(state) {
  if (state.loaded) {
    $("total").textContent = String(state.processes.length);
    $("online").textContent = String(
      state.processes.filter(
        (p) => p.status === "online" || p.status === "launching",
      ).length,
    );
    $("stopped").textContent = String(
      state.processes.filter(
        (p) => p.status === "stopped" || p.status === "stopping",
      ).length,
    );
    $("attention").textContent = String(
      state.processes.filter((p) => p.status === "errored").length,
    );
  }
  for (const button of document.querySelectorAll(".metric")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === $("status").value),
    );
  }
}

export function renderDetail(state) {
  const process = state.processes.find((item) => item.id === state.detailId);
  $("details").hidden = !process;
  document.querySelector(".app").dataset.detailOpen = String(Boolean(process));
  if (!process) return;
  renderMetricCharts(process, state.metricHistory, state.stale, state.paused);
  const diagnostics = $("process-diagnostics");
  const messages = processDiagnostics(process);
  diagnostics.hidden = !messages.length;
  diagnostics.replaceChildren(
    ...messages.map((message) => element("li", message)),
  );
  $("detail-name").textContent = process.name;
  $("detail-id").textContent =
    `id ${process.id} · pid ${process.pid || "—"} · ${process.mode}`;
  $("detail-status").replaceChildren(statusPill(process.status));
  $("detail-cpu").textContent = cpuLabel(process);
  $("detail-memory").textContent = memoryLabel(process);
  $("detail-uptime").textContent = formatUptime(process);
  $("detail-restarts").textContent = String(process.restarts);
  $("detail-instances").textContent = String(process.instances || 1);
  $("detail-mode").textContent = process.mode;
  const fields = {
    Name: process.name,
    "PM2 ID": process.id,
    PID: process.pid || "—",
    Status: process.status,
  };
  const runtimeFields = {
    Node: process.nodeVersion || "—",
    Version: process.version || "—",
    Script: process.script || "—",
    CWD: process.cwd || "—",
    Interpreter: process.interpreter || "—",
    Watch: process.watch ? "On" : "Off",
    Autorestart:
      process.autorestart === null || process.autorestart === undefined
        ? "Unknown"
        : process.autorestart
          ? "On"
          : "Off",
    "Last exit code": process.exitCode ?? "Unknown",
    "Memory restart limit": process.maxMemoryRestart
      ? formatBytes(process.maxMemoryRestart)
      : "Not reported / not set",
  };
  for (const [id, values] of [
    ["detail-fields", fields],
    ["detail-runtime", runtimeFields],
  ])
    $(id).replaceChildren(
      ...Object.entries(values).flatMap(([key, value]) => [
        element("dt", key),
        element("dd", String(value)),
      ]),
    );
}

export function renderLogs(text) {
  const filter = $("log-search").value.toLowerCase();
  renderLogSnapshot(text, filter, $("log-content"));
}
