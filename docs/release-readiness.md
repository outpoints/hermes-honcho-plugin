# Release verification

Verified on 2026-09-22 for plugin 0.3.0. Local automated gates pass. This is a
record of exercised behavior, not a guarantee about every host, theme or server.

## Automated checks

`./scripts/check.sh` passed with the installed Hermes interpreter and with
isolated SDK overlays. No Hermes dependencies were upgraded.

| Python Honcho SDK | Python tests | JavaScript tests | Result |
| --- | ---: | ---: | --- |
| 2.2.0 | 68 | 26 | Pass |
| 2.4.0 | 68 | 26 | Pass |
| 2.5.0 | 68 | 26 | Pass |

The host checkout reported `v2026.9.14-5268-g439eb0395e`. SDK overlays reuse the
host interpreter's dependencies. They are not independent clean installations.
See [compatibility.md](compatibility.md) for the repeatable matrix procedure.

Additional checks passed:

- `hermes plugins doctor --ci .`: manifest, discovery, import and registration.
- JavaScript syntax checks for both entry points.
- Ruff's `E4,E7,E9,F` checks with isolated configuration.
- `git diff --check` and `git fsck --full --no-reflogs --unreachable`.
- Gitleaks 8.30.1 over working files and all reachable Git history.

The Python host emitted a SQLite WAL-reset safety warning and selected its
DELETE-journal fallback. This is a host-runtime maintenance issue, not a failed
plugin test. The plugin does not change the SQLite runtime or Hermes installation.

## Safety regressions covered

- Exact session-ID verification before reads or upload preparation, even when
  the server returns a nonmatching filtered result.
- Workspace, session and peer consistency between the displayed confirmation,
  issued ticket and final upload.
- Revalidation when the configured peer changes after ticket preparation.
- One-time, profile-bound tickets and worker-scope isolation through cancellation
  and timeout.
- Unknown outcomes for transport loss, provider errors and malformed receipts.
  Neither the UI nor the tested SDK multipart path replays an ambiguous upload.
- Pending uploads cannot be dismissed or submitted twice, including the brief
  interval before React Query renders its pending state.
- Partial readback preserves verified messages without reporting full success.
- Declared-size enforcement before Honcho ingestion and closing upload handles
  on rejection.
- Partial metric failures retain successful independent reads and display
  diagnostics. Refresh updates the visible section, not only the summary.
- Credential-shaped errors and metadata are redacted, including quoted values
  and Basic authorization. IPv6 endpoint formatting preserves its brackets.

## UI verification

An isolated Chromium harness used the host's real SDK controls, shipped CSS,
localization and theme palette. All displayed content and transport responses
were synthetic fixtures. The harness was kept outside the published source.

- All six tabs were exercised at 300, 600 and 1100 pixels in light and dark
  themes. Those 36 scenes had no detected horizontal clipping or axe WCAG
  A/AA violations. The upload-error dialog also passed the axe check.
- Loading, empty, unavailable, missing-session, partial and long-identifier
  states rendered successfully.
- Manual refresh and explicit search submission dispatched the expected calls.
- Cancel dispatched no upload. Pending upload locking, successful readback
  feedback and blocked retry after an unknown outcome passed.
- Narrow navigation and actions remained usable. Secondary text uses scoped
  Hermes tokens with sufficient contrast in the tested light theme.

Automated accessibility checks do not replace screen-reader testing. This
harness does not prove that an already-running Desktop process has reloaded the
plugin, or exercise the real Electron-to-remote transport.

## Privacy and publication boundary

Targeted scans and source review found no remaining personal names, private
profile labels, developer-home paths, private network addresses or nonfixture
email addresses in the current source or five pre-audit commits after the
approved local history rewrite. Reserved-domain fixtures and public package
attribution remain intentional. Secret scanning reported no findings.

The branch and release tag were rewritten. Old local objects were pruned, and
a private recovery backup was kept outside the repository. `origin` was
temporarily removed to prevent an accidental fetch from restoring unsanitized
history. Publication requires exact force-with-lease checks for both refs and
verification of a fresh remote clone.

Rewriting refs does not guarantee deletion of unreachable GitHub objects,
cached commit views or other people's clones. Those require separate cleanup
where applicable. Do not publish the recovery backup.

## Remaining deployment limits

- API code is imported by long-running Hermes processes. Restart the affected
  backend when deploying. Reload the Desktop plugin separately if needed.
- No live write to a personal Honcho workspace, backend restart or dependency
  upgrade was performed for this audit. Uploads were verified offline against
  real SDKs and through the synthetic UI transport.
- OAuth-gated remote multipart uploads remain unsupported by the host. SSH and
  token-authenticated routing still depend on the target's installed companion.
- Upload tickets are process-local and expire on restart. Multi-worker hosting
  requires routing both upload steps to the same worker.
- Request-body limits and multipart parsing remain host/deployment concerns.
  Honcho remains authoritative for its configurable file-size limit.
- Optional scope APIs and other capability gaps remain as documented in
  [compatibility.md](compatibility.md). This plugin is not a replacement for
  every feature in the standalone Honcho dashboard.
