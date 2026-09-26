# PM2 Monitor for Zync

A focused PM2 workspace: inspect the server, find the process, make an intentional change. Manifest v2, no legacy bridge or runtime downloads. Shared controls and theme handling use the published Zync plugin UI package, bundled locally.

## Try it

This build requires **Zync 2.33.0 or newer with Plugin API 2.1**. Restart/rebuild the native Zync app before installing. Hosts with API 2.0 correctly reject it. Marketplace installation additionally requires a host built with the trusted registry URL and public keys. The existing legacy marketplace PM2 1.1.0 package is unchanged.

1. Run `npm ci` and `npm run package` in this repository.
2. In Zync, use the local plugin installation flow to select `dist` (or the ZIP in it). Unsigned local packages require Developer Mode and explicit permission review.
3. Open an SSH connection, use the workspace **+** menu, and open **PM2 Monitor**.
4. The SSH account must already have Node.js and PM2 installed. If needed, set the PM2 executable under **Connection settings**. For nvm/custom installations outside the SSH PATH, provide absolute paths for both the PM2 script and Node.js executable; no shell profile is sourced.

The ZIP is an **unsigned development artifact**, not a signed marketplace update. Do not publish it to the marketplace without the normal publisher-signing and registry-release checks. No code in this project requires a Zync checkout to build: it uses the published SDK validator with an explicit API 2.1 target.

## Included

- Live process overview: status, CPU, memory, restarts, uptime, namespace, execution mode.
- Search, status filter, stable sorting, selection, process details, and a container-responsive list/detail layout adapted from `here-just-for-reference/zync-pm2-watcher`. Colors follow Zync's light/dark theme message.
- Start, restart, cluster reload, stop, delete, and explicit save-list. Every change requires a Zync-owned confirmation.
- Selected-process batches up to five; failures stop the batch and show which processes were not attempted.
- Last 100 log lines: standard output, errors, text filtering, copy/clear of the displayed snapshot, optional snapshot refresh, and an expanded view. No persistent log stream or server log deletion.
- Per-pane search, selection, executable setting, refresh interval, detail view, and logs. A hidden or paused pane stops scheduling polls. Failures back off to 60 seconds.
- Up to 250 processes with chunked UI messages. Tables scroll independently; rendered text never becomes HTML.

## Permission boundary

`ssh.command.execute` is powerful: it grants remote execution as your SSH account on the server where this pane is opened. It is **not** a read-only PM2 permission or an OS sandbox. The plugin uses only fixed PM2 subcommands and numeric IDs, but only install builds from publishers you trust.

The host chooses the connection, quotes arguments, rejects controls, bounds time/output/concurrency, and cancels its channel when the runtime or binding is revoked. The plugin carries an opaque connection token across confirmation and execution. It rechecks process identity after confirmation; PM2 does not provide an atomic compare-and-mutate operation, so concurrent external administrators can still race it. A timeout can mean an operation already took effect: inspect the process list before retrying. Closing a channel does not necessarily stop daemonized work.

`pm2 jlist` contains environment variables. The worker forwards only a small field allowlist to the pane, never the environment object. Logs can still contain application secrets; they are not uploaded or persisted by this plugin. There is no analytics or external network dependency.

## Development

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:ui
npm run test:states
npm run preview
```

The preview at `http://127.0.0.1:4178` uses **simulated data**. It cannot operate on a server. The fixture is never included in `dist`. Source is divided into `domain` (parsing/commands), `worker` (authority and confirmation), and `ui` (presentation). Build output inlines only the bundled UI and CSS because Zync's isolated frame has no asset/network access.

See [testing](docs/TESTING.md) for evidence and remaining release checks; [architecture](docs/ARCHITECTURE.md) for maintenance notes.

## Release status

See [stable release workflow](docs/RELEASING.md) for tag-triggered candidates, manual publisher signing, protected signed-release promotion and offline registry publication.

Version 2.0.0 is prepared for stable release, retaining `com.zync.plugin.pm2-monitor`. Its repository is `zync-sh/zync-pm2-monitor`; the build scripts do not publish GitHub releases. It uses published `@zync-sh/plugin-sdk@2.1.0-beta.1` and `@zync-sh/plugin-ui@0.1.0-beta.1`. Publication still requires publisher signing, trusted registry staging, and a released compatible API 2.1 host. Keep the legacy listing unchanged so older clients remain supported.

Use the Compact toggle in the pane header to reduce process row spacing without changing data or refresh behavior. Compact rows provide a keyboard-accessible action menu for details, logs and process operations. Density is pane-session state; it does not change other panes. Mutating menu actions use the same native confirmation and process-identity checks as the details view.

The pane follows Zync's background, surface, border, text and accent tokens. Dropdowns are sandbox-local, keyboard-accessible menus; scrollbars use the host's slim styling. No remote fonts or UI libraries are loaded.

The log viewer uses readable numbered lines, a wrap toggle, and a jump-to-latest control. Line numbers are visual only and are not included when copying logs. Refreshes follow the bottom only when you were already there; scrolling up preserves your reading position. Output is still bounded snapshots, not a streaming connection. The P2 monogram replaces the earlier tiled icon.

Initial reads use a skeleton, with a slower-server explanation after five seconds. Missing executables offer settings and retry (never an automatic install); empty process lists and filtered lists have separate recovery actions. Failed refreshes retain populated snapshots as stale. Zync owns the SSH reconnect screen for plugins declaring required SSH permissions; the frame mounts only after the host connects. `test:states` checks these presentation states directly from the bundle without a preview server; live SSH reconnection still needs an app smoke test.
