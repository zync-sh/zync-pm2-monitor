# Verification and release checklist

## Verified locally — 2026-09-25

- 18 domain/worker tests passed.
- 7 browser scenarios passed against a fresh build, including an opaque-origin iframe with Zync's CSP, hidden-pane polling, and hostile text. Desktop, narrow-pane and light-theme screenshots were inspected.
- 90 native Zync plugin tests passed, including combined output budgets, split UTF-8 chunks, missing/nonzero exit status, forged connection fields and lease invalidation.
- Zync's full agent suite, `tsc --noEmit`, SDK consumer type check and SDK release check passed.
- Real PM2 7.0.4 in an isolated Ubuntu WSL home passed list, stdout/stderr logs, cluster reload, restart, stop, resume, save, delete, empty list and empty-list save. The private daemon was stopped afterwards; no normal PM2 processes were touched.
- Package preflight passed; the ZIP contains only manifest, worker, pane HTML and license. npm audit reported no known dependency vulnerabilities at verification time.

Desktop installation and the actual Tauri-to-SSH round trip remain unverified. The local ZIP is a test candidate, not a claim of production certification.

## Automated coverage

### Beta.23 release candidate — 2026-09-26

37 domain/worker tests and 14 direct-bundle browser checks passed. These include shared-library styling regressions at 320, 530, and 1280 pixels, flat detail actions/tabs, compact ring-selected metrics, permission denial/retry, and stale connection handling. The ZIP remains unsigned; automated checks do not replace the manual desktop and signed marketplace release gates below.

### UI review follow-up — 2026-09-26

The current build adds loading/slow-server, executable-unavailable, empty-list and filtered-list states. Regression tests cover stale empty snapshots, synchronous bridge send failures, and status/action/mode alignment at 320px and 650px in both row densities. `npm run test:states` loads the actual bundle directly, without a preview server. The ZIP now also includes the declared process-manager SVG icon. The shared Zync reconnect screen and custom tab/menu/pane icons require an updated host; live desktop reconnect remains a manual release check.

Set `PM2_PREVIEW_PORT` to a free local port when an older preview is already running; the browser suite and preview server use the same value. Do not reuse an old preview to verify a new bundle.

Log-view checks cover inert markup, visual-only line numbers, long lines, wrapping, bottom navigation, and preserving reading position on refresh. An optional companion-host harness checks the actual sidebar resize hook across an iframe and host-list scrolling while the frame has focus; it skips when this standalone repository has no sibling Zync checkout. This is not a substitute for a live desktop sidebar smoke test.

`npm test` exercises parsing, banners/control codes, duplicate IDs, limits, injection-shaped names, numeric-only commands, secret-field exclusion, filtering, identities, confirmation cancellation, stale identities, server rebind, partial failures, bounded logs, per-pane concurrency, and large-list envelopes.

`npm run test:ui` launches a headless browser against the bundled UI with a simulated host. It covers search/details/logs, narrow viewport overflow, selected actions, cluster-only reload, cancel, stale-data disabling/recovery, pause, empty state, light theme, and independent view state. Screenshots go to `test-results`.

Zync's companion change is checked with TypeScript, SDK consumer types, the full agent test suite, and `cargo test --lib plugins:: --no-default-features`. Native tests cover command quoting and bounds, concurrency guard cleanup, runtime ownership, lease invalidation, and rebind tokens. The frontend router test verifies host-assigned identity and stale-response suppression.

## Real PM2 smoke

The `tests/remote` scripts are an opt-in **developer fixture for the authorized Ubuntu WSL instance**, not an installer for users. `prepare.sh` downloads a checksum-verified portable Node 22 and pinned PM2 7.0.4 into a new private cache directory. `smoke.mjs <printed-runtime>` runs the real worker service against real PM2 via WSL, with a private `PM2_HOME` and only its own sample process. It exercises list, recent logs, cluster reload, restart, stop, resume, save, delete, and empty list. It stops the private daemon in `finally`.

This verifies PM2 behavior and the worker, **not** the desktop install/permission dialog or actual Tauri SSH transport. Browser tests likewise use a simulated host; neither should be described as full desktop end-to-end coverage.

## Required before publishing

- Rebuild the desktop host with API 2.1; install this local package and approve its three permissions.
- On a disposable SSH process, test all actions, cancel, revocation during a slow command, reconnect during confirmation, and closing the pane during execution.
- Split into two panes on the same server, then use a second server. Check selection and logs remain independent and a pending confirmation cannot cross connections.
- Exercise a server with PM2 on PATH and one using a custom/nvm installation. Verify local-terminal workspaces produce an SSH-only message.
- Test the minimum supported PM2 release before claiming support for it. The current real smoke uses PM2 7.0.4.
- Sign the artifact, deploy beta registry metadata, validate upgrade from marketplace 1.1.0 and rollback, then publish. Nothing here publishes automatically.
