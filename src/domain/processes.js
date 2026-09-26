const MAX_PROCESSES = 250;
const statuses = new Set([
  "online",
  "stopped",
  "errored",
  "stopping",
  "launching",
  "waiting restart",
  "one-launch-status",
]);
const text = (value, limit = 160) =>
  typeof value === "string"
    ? stripTerminalCodes(value)
        .replace(/[\r\n\t\u202a-\u202e\u2066-\u2069]/g, " ")
        .slice(0, limit)
    : "";
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const hasMetric = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function stripTerminalCodes(value) {
  return String(value)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

export function parseProcesses(output) {
  const clean = stripTerminalCodes(output).trim();
  let raw;
  try {
    raw = JSON.parse(clean);
  } catch {
    // PM2 can print a daemon-start banner before jlist's JSON. Never interpret
    // arbitrary embedded JSON: the process array must be the final output.
    const starts = [...clean.matchAll(/(?:^|\n)\s*(\[)/g)].map(
      (match) => match.index + match[0].lastIndexOf("["),
    );
    for (const start of starts.slice(-20)) {
      try {
        const candidate = JSON.parse(clean.slice(start));
        if (Array.isArray(candidate)) {
          raw = candidate;
          break;
        }
      } catch {
        /* Try the next complete line. */
      }
    }
  }
  if (!Array.isArray(raw))
    throw new Error(
      "PM2 returned an invalid process list. Check that the selected executable is PM2.",
    );
  if (raw.length > MAX_PROCESSES)
    throw new Error(
      `This pane supports up to ${MAX_PROCESSES} processes. The server returned ${raw.length}.`,
    );
  const ids = new Set();
  return raw.map((item) => {
    if (
      !item ||
      !Number.isSafeInteger(item.pm_id) ||
      item.pm_id < 0 ||
      ids.has(item.pm_id)
    ) {
      throw new Error(
        "PM2 returned missing or duplicate process IDs. Actions have been disabled.",
      );
    }
    ids.add(item.pm_id);
    const env = item.pm2_env ?? {};
    // jlist includes environment secrets. Only these fields may leave the worker.
    return {
      id: item.pm_id,
      name: text(item.name) || `Process ${item.pm_id}`,
      namespace: text(env.namespace) || "default",
      status: statuses.has(env.status) ? env.status : "unknown",
      mode: env.exec_mode === "cluster_mode" ? "cluster" : "fork",
      instances: number(env.instances) || 1,
      pid: number(item.pid),
      cpu: number(item.monit?.cpu),
      memory: number(item.monit?.memory),
      cpuAvailable: hasMetric(item.monit?.cpu),
      memoryAvailable: hasMetric(item.monit?.memory),
      restarts: number(env.restart_time),
      startedAt: number(env.pm_uptime),
      createdAt: number(env.created_at),
      script: text(env.pm_exec_path, 256),
      cwd: text(env.pm_cwd, 256),
      interpreter: text(env.exec_interpreter),
      nodeVersion: text(env.node_version),
      watch: Boolean(env.watch),
      version: text(env.version),
      autorestart:
        typeof env.autorestart === "boolean" ? env.autorestart : null,
      exitCode: Number.isSafeInteger(env.exit_code) ? env.exit_code : null,
      maxMemoryRestart: number(env.max_memory_restart),
    };
  });
}

export function processIdentity(process) {
  return `${process.id}:${process.createdAt}:${process.name}:${process.script}`;
}

export function filterProcesses(
  processes,
  query = "",
  status = "all",
  sort = "name",
) {
  const needle = query.trim().toLowerCase();
  return processes
    .filter(
      (process) =>
        (status === "all" ||
          (status === "online" &&
            ["online", "launching"].includes(process.status)) ||
          (status === "stopped" &&
            ["stopped", "stopping"].includes(process.status)) ||
          (status === "errored" && process.status === "errored")) &&
        `${process.name} ${process.id} ${process.namespace} ${process.status}`
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => {
      const order =
        sort === "cpu" || sort === "memory" || sort === "restarts"
          ? b[sort] - a[sort]
          : a.name.localeCompare(b.name);
      return order || a.id - b.id;
    });
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${["B", "KB", "MB", "GB"][unit]}`;
}

export function formatUptime(process, now = Date.now()) {
  if (process.status !== "online" || !process.startedAt) return "—";
  const seconds = Math.max(0, Math.floor((now - process.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
