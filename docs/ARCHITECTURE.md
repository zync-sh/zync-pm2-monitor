# Architecture

The pane is a view, not an SSH client. Its only host object is `zync.pane`. A request goes to the worker with a request ID; Zync supplies the actual pane instance ID. The worker validates the operation, asks the host to confirm changes, and calls `sshCommand.execute`. Rust authorizes the current runtime, permission, package, and pane connection before opening the SSH channel.

## Ownership

The build uses the published npm packages `@zync-sh/plugin-sdk@2.1.0-beta.1` (package validation) and `@zync-sh/plugin-ui@0.1.0-beta.1` (theme bridge, dropdowns, tooltips, and shared control styles). Versions are pinned in the lockfile. Shared CSS and JavaScript are bundled into the sandbox HTML; no CDN or runtime npm access is needed. PM2 layout styles alias the shared theme tokens, while host permissions and SSH remain separate from the UI package.

- `src/domain/commands.js`: command allowlist, numeric IDs, executable validation, actionable errors.
- `src/domain/processes.js`: bounded PM2 parsing, field allowlist, identity, formatting/filtering.
- `src/worker/service.js`: one operation per pane, confirmation, server token, stale process rejection, partial failure reporting. No persistent interval or unbounded queue in the worker.
- `src/ui/bridge.js`: bounded-lifetime correlated requests and process-list chunk assembly.
- `src/ui/index.js`: view state and completion-based polling; one operation at a time.
- `src/ui/render.js`: DOM construction using textContent, scoped selections, detail/log rendering.
- `src/ui/styles/`: separate base, overview, process list, details, and responsive styling.

## Limits and behavior

Host commands allow 64 arguments, 16 KiB of argument data, 2 MiB combined output, five seconds to open a channel, and twenty seconds to execute. There is one in-flight command per pane, at most eight globally, plus the runtime request budget. The plugin bounds the list at 250 processes, batches at five, and logs at 12,000 characters. It chunks lists below 40 KiB and does not retry mutations.

Selection is tied to process ID + creation time + name + script path. PM2 can change creation time on restart, so old selections are cleared on refresh. Closing/replacing a process clears its old log snapshot. Connection tokens change on pane rebind or SSH reconnect, so a user cannot accidentally confirm an action for a different server.

PM2 is invoked as an executable with argv, not as a composed shell command. Names are display-only. We do not offer arbitrary command entry, `pm2 kill`, global log flushing, deployment, ecosystem-file editing, or startup-service installation. Those need separate UX and security review, not a generic destructive button.

## Marketplace migration

Keep the legacy `zync-extensions/plugins/pm2-monitor.zip` and marketplace entry until a signed standalone release is actually available. Then publish a beta entry using the existing identity, test opt-in and rollback, and promote stable only after the desktop Plugin API 2.1 host has shipped. Never point the listing at a nonexistent GitHub release.
