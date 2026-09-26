// This is injected only by the preview/test server, never into the installable package.
window.__pm2Calls = [];
window.__pm2Fail = false;
const listeners = new Set();
const now = Date.now();
const processes = [
  {
    id: 0,
    name: "api-production",
    namespace: "production",
    status: "online",
    mode: "cluster",
    cpu: 12.6,
    memory: 198180864,
    restarts: 2,
  },
  {
    id: 1,
    name: "background-worker",
    namespace: "production",
    status: "online",
    mode: "fork",
    cpu: 3.2,
    memory: 90177536,
    restarts: 0,
  },
  {
    id: 2,
    name: "web-staging",
    namespace: "staging",
    status: "stopped",
    mode: "fork",
    cpu: 0,
    memory: 0,
    restarts: 4,
  },
  {
    id: 3,
    name: "scheduled-jobs",
    namespace: "production",
    status: "errored",
    mode: "fork",
    cpu: 0,
    memory: 0,
    restarts: 16,
  },
].map((process) => ({
  ...process,
  pid: 1100 + process.id,
  createdAt: 1000,
  startedAt: now - 126400000,
  script: `/srv/${process.name}/index.js`,
  cwd: `/srv/${process.name}`,
  interpreter: "node",
  nodeVersion: "22.0.0",
  version: "1.4.2",
  watch: false,
}));
window.zync = {
  pane: {
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    postMessage: (message) => {
      window.__pm2Calls.push(message);
      setTimeout(() => {
        const reply = { requestId: message.requestId };
        if (window.__pm2Fail) reply.error = "The server is disconnected";
        else if (message.type === "refresh")
          reply.result = {
            processes: window.__pm2Empty ? [] : processes,
            updatedAt: Date.now(),
            connectionToken: "preview-server",
          };
        else if (message.type === "logs")
          reply.result = {
            text:
              window.__pm2Logs ??
              "[2026-09-25 10:04:21] INFO  HTTP server listening on :3000\n[2026-09-25 10:04:22] INFO  Connected to database\n[2026-09-25 10:04:24] INFO  GET /health 200 · 4ms\n[2026-09-25 10:04:25] WARN  Slow request: /api/reports · 812ms",
            updatedAt: Date.now(),
            truncated: false,
          };
        else if (message.type === "export-logs")
          reply.result = { canceled: true };
        else if (message.type === "action") reply.result = { canceled: true };
        else reply.result = { canceled: true };
        for (const listener of listeners) listener(reply);
      }, 30);
    },
  },
};
window.__pm2Processes = processes;
