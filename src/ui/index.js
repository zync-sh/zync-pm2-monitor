import { createBridge } from "./bridge.js";
import {
  enhanceSelects,
  installTooltips,
  installThemeBridge,
} from "@zync-sh/plugin-ui";
import { renderEmptyState } from "./emptyState.js";
import { installLogIcons } from "./logView.js";
import { MetricHistory } from "../domain/metricHistory.js";
import { actionReport } from "../domain/diagnostics.js";
import { installKeyboardNavigation } from "./keyboard.js";
import {
  $,
  renderRows,
  renderMetrics,
  renderDetail,
  renderLogs,
} from "./render.js";
import { filterProcesses, processIdentity } from "../domain/processes.js";
import { executable, commandTarget } from "../domain/commands.js";

const sendRequest = createBridge(window.zync.pane);
const request = (type, payload) =>
  sendRequest(type, { nodeProgram: state.nodeProgram, ...payload });
const state = {
  processes: [],
  metricHistory: new MetricHistory(),
  selected: new Set(),
  detailId: null,
  detailTab: "overview",
  logsExpanded: false,
  loaded: false,
  busy: false,
  stale: false,
  paused: false,
  visible: true,
  program: "pm2",
  nodeProgram: "",
  connectionToken: null,
  updatedAt: 0,
  failures: 0,
  logs: "",
  density: "comfortable",
  refreshError: "",
  refreshErrorCode: "",
  slowLoading: false,
};
let timer;
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").hidden = !text;
  $("notice").dataset.error = String(error);
}
function updateControls() {
  const blocked = state.busy || state.stale || !state.loaded;
  for (const button of document.querySelectorAll("[data-action]")) {
    const targets = button.closest("#bulk")
      ? state.processes.filter((item) => state.selected.has(item.id))
      : state.processes.filter((item) => item.id === state.detailId);
    button.disabled =
      blocked ||
      !targets.length ||
      targets.length > 5 ||
      (button.dataset.action === "start" &&
        targets.some(
          (item) => item.status === "online" || item.status === "launching",
        )) ||
      (button.dataset.action === "reload" &&
        targets.some((item) => item.mode !== "cluster"));
    button.dataset.tooltip =
      button.dataset.action === "reload"
        ? "Reload is available for cluster processes only"
        : targets.length > 5
          ? "Select up to 5 processes per operation"
          : "";
  }
  for (const id of ["refresh", "apply-settings", "save", "load-logs"])
    $(id).disabled =
      state.busy ||
      (id === "save" && blocked) ||
      (id === "load-logs" && (blocked || state.detailId === null));
  $("program").disabled = state.busy;
  $("export-logs").disabled = state.busy || !state.logs;
  $("node-program").disabled = state.busy;
  $("health").dataset.state = state.stale
    ? "error"
    : state.paused || state.busy
      ? "idle"
      : state.loaded
        ? "live"
        : "idle";
  $("health").textContent = state.busy
    ? "Working on this server…"
    : state.stale
      ? "Refresh failed · data may be stale"
      : state.paused
        ? "Paused · showing last snapshot"
        : state.loaded
          ? `Updated ${new Date(state.updatedAt).toLocaleTimeString()}`
          : "Connecting to PM2…";
  const connection = $("connection-state");
  connection.dataset.state = state.stale
    ? "error"
    : state.loaded
      ? "live"
      : "warning";
  connection.lastChild.textContent = state.stale
    ? state.refreshErrorCode === "EXECUTABLE_NOT_FOUND"
      ? "PM2 unavailable"
      : "Refresh failed"
    : state.loaded
      ? "PM2 connected"
      : "Connecting";
  $("updated-label").textContent = state.loaded
    ? state.paused
      ? "auto-refresh paused"
      : `updated ${Math.max(0, Math.round((Date.now() - state.updatedAt) / 1000))}s ago · every ${Number($("interval").value) / 1000}s`
    : "";
}
function render() {
  document.querySelector(".app").dataset.density = state.density;
  const visibleCount = renderRows(
    state,
    (id, checked) => {
      if (checked) state.selected.add(id);
      else state.selected.delete(id);
      render();
    },
    openDetail,
    (action, id) => act(action, [id]),
    (id) => {
      openDetail(id);
      setDetailTab("logs");
      operate(fetchLogs);
    },
  );
  renderMetrics(state);
  renderEmptyState(state, visibleCount);
  renderDetail(state);
  for (const button of document.querySelectorAll(".detail-tab"))
    button.setAttribute(
      "aria-selected",
      String(button.dataset.tab === state.detailTab),
    );
  for (const panel of ["overview", "logs", "environment"])
    $(`detail-${panel}`).hidden = state.detailTab !== panel;
  document.querySelector(".app").dataset.logsExpanded = String(
    state.logsExpanded,
  );
  updateControls();
}
function schedule() {
  clearTimeout(timer);
  const interval = Number($("interval").value);
  if (
    !interval ||
    state.paused ||
    !state.visible ||
    document.hidden ||
    state.busy
  )
    return;
  timer = setTimeout(
    () => refresh(),
    Math.min(60000, interval * 2 ** Math.min(state.failures, 3)),
  );
}
async function operate(task) {
  if (state.busy) return;
  clearTimeout(timer);
  state.busy = true;
  render();
  try {
    await task();
  } catch (error) {
    notice(error.message, true);
  } finally {
    state.busy = false;
    render();
    schedule();
  }
}
async function fetchProcesses() {
  state.slowLoading = false;
  const slowTimer = setTimeout(() => {
    state.slowLoading = true;
    if (!state.loaded) render();
  }, 5000);
  try {
    const result = await request("refresh", { program: state.program });
    if (state.connectionToken !== result.connectionToken) {
      state.metricHistory.clear();
      state.selected.clear();
      state.detailId = null;
      state.logs = "";
      $("follow-logs").checked = false;
    }
    state.connectionToken = result.connectionToken;
    const previous = new Map(
      state.processes.map((item) => [item.id, processIdentity(item)]),
    );
    state.processes = result.processes;
    state.updatedAt = result.updatedAt;
    state.metricHistory.record(state.processes, state.updatedAt);
    state.loaded = true;
    state.stale = false;
    state.failures = 0;
    state.refreshError = "";
    state.refreshErrorCode = "";
    state.selected = new Set(
      [...state.selected].filter((id) =>
        state.processes.some(
          (item) =>
            item.id === id && processIdentity(item) === previous.get(id),
        ),
      ),
    );
    if (
      state.detailId !== null &&
      !state.processes.some(
        (item) =>
          item.id === state.detailId &&
          processIdentity(item) === previous.get(item.id),
      )
    ) {
      if (!state.processes.some((item) => item.id === state.detailId))
        state.detailId = null;
      state.logs = "";
      $("follow-logs").checked = false;
      $("log-content").textContent =
        "Process changed. Load its current logs again.";
      $("log-status").textContent = "Previous log snapshot cleared";
      $("log-count").textContent = "0 lines";
    }
  } catch (error) {
    state.refreshError = error.message;
    state.refreshErrorCode = error.code;
    state.stale = true;
    state.failures++;
    throw error;
  } finally {
    clearTimeout(slowTimer);
  }
}
async function refresh() {
  await operate(async () => {
    await fetchProcesses();
    notice("");
    if ($("follow-logs").checked && state.detailId !== null) await fetchLogs();
  });
}
function openDetail(id) {
  if (state.detailId !== id) {
    state.logs = "";
    $("log-search").value = "";
    $("follow-logs").checked = false;
    $("log-content").textContent =
      "Load the last 100 lines. Logs may contain sensitive application data.";
    $("log-status").textContent = "Snapshots only · no persistent log stream";
    $("log-count").textContent = "0 lines";
  }
  state.detailId = id;
  state.detailTab = "overview";
  state.logsExpanded = false;
  render();
}
function setDetailTab(tab) {
  state.detailTab = tab;
  if (tab !== "logs") state.logsExpanded = false;
  render();
}
async function fetchLogs() {
  const id = state.detailId;
  const stream = $("log-stream").value;
  const result = await request("logs", {
    program: state.program,
    id,
    stream,
    connectionToken: state.connectionToken,
  });
  if (state.detailId !== id || $("log-stream").value !== stream) return;
  state.logs = result.text || "No recent log output.";
  renderLogs(state.logs);
  $("log-status").textContent =
    `${result.truncated ? "Trimmed · " : ""}Snapshot · ${new Date(result.updatedAt).toLocaleTimeString()} · not a live stream`;
}
async function act(action, ids) {
  await operate(async () => {
    const targets = ids
      .map((id) => state.processes.find((item) => item.id === id))
      .filter(Boolean)
      .map((process) => ({
        id: process.id,
        identity: processIdentity(process),
      }));
    const result = await request("action", {
      program: state.program,
      action,
      targets,
      connectionToken: state.connectionToken,
    });
    if (result.canceled) {
      notice("Action canceled. No changes made.");
      return;
    }
    const failures = result.outcomes.filter((item) => !item.ok);
    const summary = actionReport(
      action,
      result.outcomes,
      new Map(state.processes.map((process) => [process.id, process.name])),
    );
    state.selected.clear();
    try {
      await fetchProcesses();
      notice(summary, failures.length > 0);
    } catch (error) {
      notice(`${summary}\nRefresh failed: ${error.message}`, true);
    }
  });
}
$("refresh").addEventListener("click", refresh);
for (const button of document.querySelectorAll(".metric"))
  button.addEventListener("click", () => {
    $("status").value = button.dataset.filter;
    $("status").dispatchEvent(new Event("change", { bubbles: true }));
    render();
  });
for (const id of ["search", "status", "sort"])
  $(id).addEventListener(id === "search" ? "input" : "change", render);
$("select-all").addEventListener("change", (event) => {
  for (const process of filterProcesses(
    state.processes,
    $("search").value,
    $("status").value,
    $("sort").value,
  )) {
    if (event.target.checked) state.selected.add(process.id);
    else state.selected.delete(process.id);
  }
  render();
});
$("clear-selection").addEventListener("click", () => {
  state.selected.clear();
  render();
});
for (const button of document.querySelectorAll("[data-action]"))
  button.addEventListener("click", () => {
    act(
      button.dataset.action,
      button.closest("#bulk") ? [...state.selected] : [state.detailId],
    );
  });
$("close-details").addEventListener("click", () => {
  state.detailId = null;
  state.logsExpanded = false;
  $("follow-logs").checked = false;
  render();
});
for (const button of document.querySelectorAll(".detail-tab"))
  button.addEventListener("click", () => {
    setDetailTab(button.dataset.tab);
    if (button.dataset.tab === "logs" && !state.logs) operate(fetchLogs);
  });
$("load-logs").addEventListener("click", () => operate(fetchLogs));
$("log-stream").addEventListener("change", () => {
  if (state.detailId !== null) operate(fetchLogs);
});
$("log-search").addEventListener("input", () => renderLogs(state.logs));
$("copy-logs").addEventListener("click", async () => {
  try {
    const text = $("log-content").textContent;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("aria-hidden", "true");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    $("log-status").textContent = "Visible logs copied";
  } catch {
    $("log-status").textContent = "Clipboard unavailable in this isolated pane";
  }
});
$("clear-logs").addEventListener("click", () => {
  state.logs = "";
  renderLogs("");
  $("log-status").textContent = "Displayed logs cleared";
});
$("export-logs").addEventListener("click", () =>
  operate(async () => {
    const content = [...$("log-content").querySelectorAll(".log-line")]
      .map((line) => line.textContent)
      .join("\n");
    if (!content.trim()) throw new Error("No matching log lines to export.");
    const result = await request("export-logs", { content });
    $("log-status").textContent = result.canceled
      ? "Export canceled · no file written"
      : "Displayed snapshot exported to your computer";
  }),
);
$("expand-logs").addEventListener("click", () => {
  state.logsExpanded = !state.logsExpanded;
  $("expand-logs").setAttribute(
    "aria-label",
    state.logsExpanded ? "Collapse log view" : "Expand log view",
  );
  $("expand-logs").dataset.tooltip = state.logsExpanded
    ? "Collapse log view"
    : "Expand log view";
  render();
});
$("pause").addEventListener("click", () => {
  state.paused = !state.paused;
  $("pause").textContent = state.paused ? "◎" : "◉";
  $("pause").setAttribute(
    "aria-label",
    state.paused ? "Resume auto-refresh" : "Pause auto-refresh",
  );
  $("pause").dataset.tooltip = state.paused
    ? "Resume auto-refresh"
    : "Pause auto-refresh";
  $("pause").setAttribute("aria-pressed", String(state.paused));
  updateControls();
  schedule();
});
$("interval").addEventListener("change", schedule);
$("settings-toggle").addEventListener("click", () => {
  $("settings").hidden = !$("settings").hidden;
  $("settings-toggle").setAttribute(
    "aria-expanded",
    String(!$("settings").hidden),
  );
});
$("apply-settings").addEventListener("click", () => {
  try {
    const program = executable($("program").value.trim());
    const nodeProgram = $("node-program").value.trim();
    commandTarget(program, nodeProgram);
    state.program = program;
    state.nodeProgram = nodeProgram;
    state.selected.clear();
    state.detailId = null;
    state.processes = [];
    state.metricHistory.clear();
    state.loaded = false;
    state.stale = false;
    state.logs = "";
    render();
    refresh();
  } catch (error) {
    notice(error.message, true);
  }
});
$("save").addEventListener("click", () =>
  operate(async () => {
    const result = await request("save", {
      program: state.program,
      connectionToken: state.connectionToken,
    });
    notice(result.canceled ? "Save canceled." : result.summary);
  }),
);
document.addEventListener("visibilitychange", schedule);
new IntersectionObserver((entries) => {
  state.visible = entries[0]?.isIntersecting ?? false;
  schedule();
}).observe(document.body);
window.addEventListener("pagehide", () => clearTimeout(timer));
installThemeBridge();
$("density").addEventListener("click", () => {
  state.density = state.density === "dense" ? "comfortable" : "dense";
  $("density").setAttribute("aria-pressed", String(state.density === "dense"));
  $("density").dataset.tooltip =
    state.density === "dense"
      ? "Restore comfortable row spacing"
      : "Reduce row spacing; same process data";
  render();
});
enhanceSelects();
installKeyboardNavigation({
  closeDetails: () => {
    const id = state.detailId;
    $("close-details").click();
    const index = filterProcesses(
      state.processes,
      $("search").value,
      $("status").value,
      $("sort").value,
    ).findIndex((process) => process.id === id);
    document
      .querySelectorAll("#rows .process-name")
      [index]?.focus({ preventScroll: true });
  },
  openLogs: () => {
    setDetailTab("logs");
    operate(fetchLogs);
  },
});
installTooltips();
installLogIcons();
$("log-wrap").addEventListener("change", () => {
  $("log-content").dataset.wrap = String($("log-wrap").checked);
});
$("jump-logs").addEventListener("click", () => {
  $("log-content").scrollTop = $("log-content").scrollHeight;
});
$("empty-retry").addEventListener("click", refresh);
$("empty-settings").addEventListener("click", () => {
  if ($("settings").hidden) $("settings-toggle").click();
  $("program").focus();
});
$("empty-clear").addEventListener("click", () => {
  $("search").value = "";
  $("status").value = "all";
  $("status").dispatchEvent(new Event("change"));
  render();
});
refresh();
