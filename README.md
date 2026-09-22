# Hermes Honcho Plugin

A native memory cockpit for Hermes Desktop. It follows the focused conversation
and exposes a compact right-side **Honcho Memory** pane, a tabbed `/honcho`
workspace, and a status-bar indicator.

The plugin connects directly to the Honcho instance already configured in
Hermes. It does not proxy through, embed, or depend on the separate Honcho
dashboard. The visual language borrows the dashboard's dense operational
hierarchy while retaining Hermes components, theme tokens, typography, focus
behavior, and pane layout.

## What it shows

The `/honcho` workspace contains six focused sections and one confirmed write
action:

- **Overview**: connection, workspace, session mapping, queue, peers, and local
  generation state.
- **Messages**: bounded, paginated saved-message history with peer, token, and
  timestamp provenance.
- **Conclusions**: current-session or workspace conclusions with observer,
  observed peer, source session, type, level, and creation time. Honcho 3.2 with
  Python SDK 2.5 also exposes parent conclusion IDs and derivation counts.
- **Context**: bounded session summary, representation, peer context, peer card,
  and source-layer availability.
- **Search**: explicitly triggered session, peer, workspace, or existing Honcho
  scope search that preserves Honcho's result order. Named scopes appear only
  when the selected profile backend exposes the Python SDK 2.4+ scope APIs
  and the server accepts scope listing (Honcho 3.1+).
- **Activity**: workspace and current-session reasoning queues plus honest SDK
  capability reporting.
- **Add to session**: paste text or select a PDF, JSON, or text file, review the
  exact connection/profile/session/peer target, then explicitly confirm the
  write. Honcho may split extracted content into multiple messages.

The default-collapsed right pane presents the current Honcho session, saved
messages, conclusions, attached peers, queue state, latest memory activity, and
a short context preview. It also provides add, open, search, copy, and refresh
actions.

The same semantic components adapt to their rendered container rather than the
global window. A narrow docked pane stacks lineage and details, ordinary
workspace widths use compact columns, and full-width routes use asymmetric
session/configuration and side-by-side queue compositions. Styling follows the
Hermes Desktop design contract: shared controls, inherited theme tokens,
tertiary hairlines, flat surfaces, and no custom palette or decorative shadow.

Only the summary and aggregate activity endpoints poll, never faster than every
10 seconds. Messages, conclusions, and context refresh on focus change, pane
visibility, route mount, or manual refresh. Search runs only when submitted.
Every query key includes the owning connection and profile plus the focused
stored/runtime session and working directory. A focus change therefore clears
the prior chat's data instead of displaying it while the next chat loads.

## Requirements

- Hermes Agent with Desktop Plugin SDK support (tested with v0.20.6)
- Honcho configured for each Hermes profile you want to inspect
- Honcho 3.2.0 and Python `honcho-ai` 2.5.0 are verified targets. The existing
  read/upload workflows are also tested with SDK 2.2.0 and 2.4.0, with optional
  features gated by the selected backend's capabilities.
- Node.js only for the repository checks; it is not a runtime dependency

Configure Honcho first if needed:

```sh
hermes honcho setup
```

## Install

Once this repository is published:

```sh
hermes plugins install outpoints/hermes-honcho-plugin --enable
```

Restart Hermes Desktop so the Python API is mounted. Unified installs appear in
**Settings → Plugins** and remain opt-in until the **Honcho** desktop plugin is
enabled. Standalone installs in `desktop-plugins` load immediately.

For local development, install or symlink this repository at:

```text
~/.hermes/plugins/hermes-honcho-plugin
```

The directory name must remain `hermes-honcho-plugin`, matching the desktop
plugin ID and dashboard API namespace. Enable the agent plugin with:

```sh
hermes plugins enable hermes-honcho-plugin
```

Restart Hermes Desktop after changing the Python backend. The uncompiled
`desktop/plugin.js` can be reloaded by toggling the desktop plugin off and on.

### Multiple profiles and remote gateways

A unified plugin has two independent deployment surfaces:

- The Desktop contribution is loaded once by the workstation running Hermes
  Desktop.
- The Python/API companion must be installed and enabled in every profile home
  that will answer `ctx.rest()` requests.

Installing the plugin in the default profile does not install it into named
profiles. Install and configure each intended profile explicitly:

```sh
hermes -p <profile> plugins install outpoints/hermes-honcho-plugin --enable
hermes -p <profile> honcho setup
```

For a local development checkout, link only `plugin.yaml`, `__init__.py`, and
`dashboard/` into
`~/.hermes/profiles/<profile>/plugins/hermes-honcho-plugin/`, then run the
profile-scoped `plugins enable` command. Keep `desktop/plugin.js` in the local
Desktop plugin root so the route is registered only once.

Remote connections use the same split. Install and enable the API companion on
the remote Hermes host for every remote profile, then add that host under
**Settings → Gateways** as SSH or a remote gateway. Hermes routes `ctx.rest()`
through the selected `(connection, profile)`; the renderer never receives SSH
or Honcho credentials. The remote machine must be able to reach its configured
Honcho endpoint. There is intentionally no fallback to a local profile when a
remote companion is missing.

Restart the affected local or remote Hermes backend after installation so its
plugin API routes mount.

## Development

Run all static contract and backend unit checks:

```sh
./scripts/check.sh
hermes plugins doctor --ci .
```

Set `HERMES_PYTHON` when the checks cannot discover the Python interpreter that
runs Hermes. See the [release verification record](docs/release-readiness.md)
for tested versions, privacy checks, UI coverage and deployment limitations.

The plugin deliberately has no frontend build step and adds no third-party
runtime framework. `desktop/plugin.js` uses only the Hermes-provided SDK, React
runtime, UI components, and shared React Query cache. `dashboard/plugin_api.py`
uses FastAPI, Hermes's built-in Honcho configuration/session resolver, and the
installed `honcho-ai` SDK.

### Honcho 3.2 / SDK 2.5 compatibility

This plugin uses the **Python** `honcho-ai` SDK supplied by Hermes, not the
dashboard's TypeScript `@honcho-ai/sdk`. Installing or updating this plugin does
not upgrade Hermes's SDK or restart a local/remote backend.

- Context unwraps SDK summary and representation models, handles absent cards,
  and does not invent a token total when the SDK does not provide one.
- Scope search uses SDK 2.5's non-creating `get_scope`. SDK 2.4 falls back to
  paginated list verification, never the creating `scope()` helper.
- Conclusion rows display `source_ids` as **parent conclusion IDs**, not source
  messages, and expose `times_derived` when the SDK supplies it. This is not a
  full parent/backlink browser.
- Chat/evidence, service-wide deriver backlog, and collector call traces remain
  features of the separate dashboard. Compatibility does not mean feature
  parity, and the plugin does not require that dashboard at runtime.

`tests/test_sdk_compatibility.py` exercises the real installed SDK over an
offline HTTP fixture transport, including exact upload readback, scoped search,
permission failures and 503 responses. See the
[compatibility record](docs/compatibility.md) for the test matrix, live-read
verification, and how to repeat the isolated SDK checks.

The backend exposes profile-scoped `POST` routes for `/snapshot`, `/messages`,
`/conclusions`, `/context`, `/search`, `/scopes`, `/activity`, and
`/upload-ticket`, plus a multipart `/uploads/{ticket}` route. Request bodies
reject unknown fields and cap page sizes, context budgets, search lengths, and
result counts. Synchronous SDK operations execute outside the event loop under
an explicit timeout.

All discovery paths remain read-only. Before any scoped SDK read, the backend
verifies that the configured workspace already exists, avoiding SDK paths that
can create workspaces or scopes. The only mutation is an explicitly confirmed
upload to the exact existing focused session. A two-minute one-time ticket binds
that write to its connection, profile, session, and configured user peer. The
backend then reads every created message ID back from that session before
reporting verified success. It never returns credentials or credential-bearing
URLs.

### File-size limits

The plugin does not impose or advertise an undocumented 10 MB limit. Honcho's
current server source defines configurable `MAX_FILE_SIZE` with a default of
5,242,880 bytes (5 MiB). A self-hosted deployment may use another value, so the
dialog identifies 5 MiB as Honcho's default and leaves authoritative acceptance
to the selected backend. Honcho separately chunks extracted text near 49,500
characters to remain within its 50,000-character message limit; that character
limit is not a file-byte limit.

Hermes currently cannot forward multipart uploads to OAuth-gated remote
backends. Local, SSH, and token-authenticated remote paths use `ctx.rest()`;
OAuth upload attempts fail explicitly rather than falling back to another
profile or connection.

See [docs/architecture.md](docs/architecture.md) for runtime flow, endpoint
contracts, isolation, privacy boundaries, installed-SDK capability handling,
and the Phase 2 backlog. The desktop implementation follows the
[official Hermes Desktop Plugin SDK guide](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk).

## Package layout

```text
desktop/plugin.js          Hermes Desktop SDK entry point
dashboard/manifest.json    API-only dashboard manifest
dashboard/plugin_api.py    Profile-scoped Honcho metrics adapter
docs/architecture.md       Architecture decision and data flow
scripts/check.sh            Repository checks
tests/                      Backend and SDK contract tests
```

## Troubleshooting

- **“Honcho status is unavailable”**: enable the agent plugin and restart
  Hermes so the backend route mounts.
- **“Honcho is not configured”**: run `hermes honcho setup` in that profile.
- **Workspace metrics but no current chat**: the session may not have written a
  message yet, or the focused chat belongs to another Hermes connection.
- **A metric is unavailable**: open Diagnostics on the Honcho page. Other
  metrics continue updating when one Honcho endpoint fails.

## License

GPL-3.0. See [LICENSE](LICENSE).
