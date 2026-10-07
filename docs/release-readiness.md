# Release verification

## 0.4.0, 2026-10-07

### Changes

- Redesigned the Desktop UI on the host's own primitives: five sections
  (Memory, Ask, Messages, Context, Status) in underline text tabs like the
  Capabilities page, a section menu in narrow panes, a conclusion list with an
  inspector for premises and derived conclusions, `PanelEmpty` states, and one
  gate state that names the next step when nothing can be read.
- Fixed "Blocked" for chats from another profile while the sidebar shows all
  profiles. The plugin now reads such a chat in its owner profile through an
  explicit `?profile=` selector. Chats on another connection, or with ambiguous
  ownership, stay blocked with a specific reason.
- Drafts and unsaved chats show one clear state instead of a set of failed reads.
- Conclusions are listed newest first. The backend had sent `reverse=true`,
  which Honcho reads as oldest first.
- Host navigation is recognized by its effect on the route, not by reading host
  `data-tour` markup, which catalog rule 8 forbids.
- Version 0.4.0 everywhere. The backend constant had still said 0.3.0.
- `requires_hermes: ">=0.21.4"` in the catalog entry. See
  [compatibility.md](compatibility.md) for how the floor was derived.

### Verification

- `./scripts/check.sh`: 69 JavaScript and 94 Python tests pass.
- The Python suite also passes under `honcho-ai` 2.2.0, 2.4.0, 2.5.0 and 2.5.1
  overlays through the managed launcher.
- `scripts/check-ui-surface.mjs`: all 40 SDK imports and 8 icons exist in Hermes
  v2026.8.31, v2026.9.24 and current main, and all 110 utility classes exist in
  the host's shipped stylesheet.
- `scripts/check-host.mjs`: 15 SSH-alias requests and 6 cross-profile local
  requests through the real host REST bridge and Electron path builders,
  offline. No live SSH connection.
- `scripts/screenshots.mjs`: 26 synthetic captures and 13 axe WCAG A/AA audits
  with 0 violations, 0 browser errors, 0 external requests and 0 uploads.
  `verification.json` matches the committed `desktop/plugin.js`.
- `hermes plugins validate . --json`: every check passes, the security scan is
  `safe`, and there are no warnings. `hermes plugins doctor --ci .` passes.
- The catalog entry passes upstream `validate_plugin_catalog.py` with a stand-in
  SHA. That is a schema check only.

### Live checks

- In the running macOS app, **Reload desktop plugins** loaded the new UI. A new
  draft showed the single "No Honcho session" state.
- The repository owner confirmed in the running app that a chat from another
  profile is no longer blocked.
- The newest-first conclusion order is a backend change. Running Hermes
  backends keep the old code until they restart. No backend was restarted for
  this release.
- Live Windows/SSH acceptance and live writes remain untested.

### Privacy

- Current files: a pattern scan for names, contact details, home paths, private
  network addresses, profile names and emails found nothing outside
  reserved-domain test fixtures. Gitleaks found no secrets.
- Images: OCR of all 26 screenshots and 7 catalog images found only synthetic
  identifiers. No PNG carries text metadata.
- History: the 7 reachable commits and the `v0.1` tag are clean. GitHub still
  served the 5 commits from before the September history rewrite by SHA. Those
  contained a first name in test fixtures, a home-directory path and private
  profile names. Publication recreated the repository from the clean history,
  so those commits are not part of it.

## Inspector focus regression fix, 2026-09-29

- Fixed loss of the inspected conversation when Honcho takes pane focus or
  opens its main page. The frontend retains the exact inspection scope only
  during plugin interaction, without changing backend routing or session lookup.
- `./scripts/check.sh`: 58 JavaScript and 88 Python tests pass, including 13
  focus-retention tests for navigation, drafts, unresolved ownership, stale
  requests, scope changes and disposal.
- Browser regression passes with native controls and synthetic host handoffs:
  tile to another primary, portalled dropdown selection, sidebar navigation,
  empty primary selection, page remount, refresh and upload-dialog cancellation.
  Request bodies retain the original durable session throughout these actions.
- The full synthetic browser suite also passes its five accessibility audits,
  with no browser errors, external requests or uploads. The gallery below
  records the earlier workbench capture, not this subsequent source revision.
- Actual-host transport checks still pass (15 requests with synthetic IPC).
  No backend change, restart, dependency upgrade or live memory write was needed.
- The installed frontend links to this checkout. Executed **Reload desktop
  plugins** in the running macOS app, selected the current project conversation,
  refreshed its side panel, opened the native section dropdown and selected
  Messages, then opened the main Honcho page from the sidebar. Captures confirmed
  the same resolved Honcho session and populated message stream in both surfaces.
  The dropdown required foreground pointer delivery after background AXPress did
  not open it. This is a live local read-only smoke test, not Windows/SSH or live
  mutation acceptance. Private live captures remain outside the repository.
  No backend restart or manual test-memory write was performed.

## Unreleased memory workbench, 2026-09-29

Implementation and offline verification are complete in the working tree.
The manifest remains 0.3.1, not a newly published release. No commit, tag,
catalogue submission, SDK upgrade, or backend restart was performed.

- `./scripts/check.sh`: 45 JavaScript and 88 Python tests.
- Full Python suite: passes with installed `honcho-ai` 2.2.0 and isolated
  overlays 2.4.0, 2.5.0, and 2.5.1 on the same managed Python 3.14.7 runtime.
- Actual Hermes host transport: 15 requests through the real REST bridge and
  profile mapper with synthetic IPC, including all new endpoint families.
- Plugin validation and doctor pass. Existing warnings remain: missing
  `hermes-provider-switcher` entry-point module in the host, and a scanner
  caution in the historical implementation plan. Neither is a plugin failure.
- Real SDK HTTP fixtures verify scoped search, exact/partial provenance,
  explicit questions, optional evidence, target-bound additive correction,
  exact readback, and no retry after an ambiguous write.
- Browser tests pass for search and questions, cancelling without requests,
  confirmed synthetic correction, unknown outcomes, duplicate-submit and
  pending-dismissal guards, focus-switch races, unsupported capabilities, and
  disconnected state. No live Honcho writes or reasoning calls were used.
- Eighteen synthetic screenshots use the actual plugin, native SDK controls,
  shipped CSS, and Nous themes. Five axe WCAG A/AA audits report no violations.
  The harness reports no browser errors, external requests, or uploads.
  See `docs/screenshots/verification.json` for source hash and host revision.
- Desktop/narrow light and dark screenshots, correction, provenance, and
  question evidence were visually reviewed inline by the main assistant.
  An earlier two-subagent delegation was interrupted. The remaining work,
  final verification, and visual review were completed in the main chat.
  The existing native visual system was retained.

### Activation boundary

On-disk changes do not establish activation in a running Python backend.
Deploy the same reviewed candidate to each intended API companion, then restart
only those backends with approval. Reload the Desktop contribution separately
if its watcher has not picked up the file. No unrelated profile was modified.
Optional graph/evidence features stay disabled on the installed SDK 2.2.0.
Basic questions, semantic conclusion search, inspection, and correction do not
require upgrading Hermes's SDK.

Live Windows/SSH acceptance, screen-reader testing, and any disposable-workspace
end-to-end mutation test remain outside this offline verification. Do not use
personal memory for test writes or screenshot fixtures. The historical privacy
audits below are not a new audit of all current changes or remote history.

## 0.3.1 candidate, 2026-09-29

This is a test candidate, not a catalogue release. Live Windows-to-SSH testing
is pending. The catalogue template still requires the final reviewed commit SHA.

### Current compatibility gates

- Executed against Hermes `39faafb61688282a372ff2d59191581588e9a003`,
  Python 3.14.7 and the host's installed `honcho-ai` 2.2.0.
- Checked upstream main again at 2026-09-29 07:07 UTC. It had advanced to
  `666f313d1d3abd8077291ba464cf0a10f1a6157f`. Reviewed the complete intervening
  diff: first-launch window sizing and 110% default zoom, no change to the
  plugin SDK, API transport, Honcho adapter contracts or catalogue schema.
- `./scripts/check.sh`: 39 JavaScript and 68 Python tests pass. Managed
  launchers use `hermes --run-module` so composed dependency layers are kept.
- `scripts/check-host.mjs`: nine calls traverse the real host REST bridge and
  Electron profile mapper with synthetic IPC, covering all reads, upload-ticket
  creation and multipart bytes. A missing remote companion never falls back.
- `hermes plugins validate . --json` and `hermes plugins doctor --ci .` pass.
  The scanner caution is a documentation-only `agent_config_mod` match in the
  historical implementation plan, not runtime behavior. The local CLI also
  reports an unrelated missing `hermes-provider-switcher` entry-point module.
- JavaScript syntax checks and `git diff --check` pass.

SSH alias-to-target translation, refreshed upload routing, focus changes during
async discovery, unresolved ownership and changed confirmation targets are
covered by regression tests. No Hermes source, dependency pins, configuration
or running backend was changed. No live upload was performed.

### Screenshots and privacy

Nine reproducible synthetic PNGs are included under `docs/screenshots`, with
the actual plugin, native controls, shipped CSS and theme palette. All six tabs
were exercised. The capture run reports no browser exceptions, no external
network requests and no upload calls. Images were visually reviewed.
`verification.json` identifies the exact UI source hash and host revision.
This is isolated rendering, not proof of Windows or live Electron activation.

Gitleaks found no secrets in the working tree or six reachable commits.
Targeted scans of current files, 46 historical blobs, commit/tag metadata and
manual source/image review found no private names, personal contact details,
developer-home paths or private network addresses. Reserved-domain test
fixtures, public project attribution and GitHub noreply identities remain
intentional. This is a bounded audit, not a guarantee about copies outside the
repository or unreachable objects retained by GitHub.

The current remote main and tag match the audited local refs. No history rewrite,
force push or credential rotation was needed or performed for this candidate.
The historical publication instructions below describe the earlier audit only.

### Remaining release steps

1. Complete [Windows SSH acceptance](windows-ssh-testing.md) with the same
   candidate on the workstation and remote profile companion.
2. Review any test-driven fixes and publish the final candidate with owner approval.
3. Fill the [catalogue template](catalog-entry.yaml.in) with that exact published
   SHA, verify its public images and submit a maintainer-reviewed catalogue PR.

## Historical 0.3.0 verification, 2026-09-22

The sections below record the earlier release audit. SDK 2.4/2.5 and the larger
accessibility matrix were verified then, not rerun as part of 0.3.1.

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
