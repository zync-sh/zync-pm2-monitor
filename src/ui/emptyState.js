export function processViewState(state, visibleCount) {
  if (!state.loaded || (!state.processes.length && state.stale)) {
    if (state.busy || !state.stale) return "loading";
    return state.refreshErrorCode === "EXECUTABLE_NOT_FOUND"
      ? "missing"
      : "error";
  }
  return state.processes.length === 0
    ? "empty"
    : visibleCount === 0
      ? "filtered"
      : "ready";
}

export function renderEmptyState(state, visibleCount) {
  const view = processViewState(state, visibleCount);
  const get = (id) => document.getElementById(id);
  document.querySelector(".app").dataset.viewState = view;
  get("empty").hidden = view === "ready";
  const copy = {
    loading: [
      "Reading PM2 processes…",
      state.slowLoading
        ? "This server is taking longer to respond. You can wait here; no processes are being changed."
        : "Running pm2 jlist on this pane’s server.",
    ],
    missing: [
      "PM2 isn’t available",
      "PM2 or Node.js may be missing, or unavailable on the SSH command PATH. Check the executable settings, then try again.",
    ],
    error: [
      "Couldn’t read PM2 processes",
      "Check the server response below. You can retry without changing any processes.",
    ],
    empty: [
      "No processes managed by PM2",
      "PM2 is responding, but its process list is empty. Start an app from this server’s terminal, then refresh.",
    ],
    filtered: [
      "No matching processes",
      "Try a different search or clear your filters.",
    ],
    ready: ["", ""],
  }[view];
  get("empty-title").textContent = copy[0];
  get("empty-description").textContent = copy[1];
  get("empty-error").hidden = view !== "error";
  get("empty-error").textContent = state.refreshError || "";
  get("empty-settings").hidden = view !== "missing";
  get("empty-retry").hidden = ["loading", "filtered", "ready"].includes(view);
  get("empty-retry").disabled = state.busy;
  get("empty-retry").textContent =
    view === "empty" ? "Refresh processes" : "Check again";
  get("empty-clear").hidden = view !== "filtered";
  get("loading-skeleton").hidden = view !== "loading";
  get("empty").setAttribute("aria-busy", String(view === "loading"));
}
