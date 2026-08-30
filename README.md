# Hermes Honcho Plugin

Native Honcho status inside Hermes Desktop: a sidebar page for the active
workspace and current chat, plus a compact status-bar indicator.

The plugin connects directly to the Honcho instance already configured in
Hermes. It does not proxy through, embed, or depend on a separate dashboard.
That keeps profile credentials, workspace selection, and session mapping in one
place—the built-in Hermes Honcho provider.

## What it shows

- Honcho connection and active workspace
- Total sessions and peers
- Workspace and current-session processing queues
- The Honcho session mapped to the focused Hermes chat
- Current-session message count, attached peers, and latest activity
- Honcho recall, write, identity, and session-strategy settings
- Local Hermes chat state: idle, waiting, or working
- Partial metric failures without hiding healthy results

The desktop UI polls every 10 seconds and follows the active Hermes profile.
If a focused chat belongs to a different connection, current-chat lookup pauses
instead of querying the wrong workspace.

## Requirements

- Hermes Agent with Desktop Plugin SDK support (tested with v0.20.6)
- Honcho configured for each Hermes profile you want to inspect
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

## Development

Run all static contract and backend unit checks:

```sh
./scripts/check.sh
```

The plugin deliberately has no frontend build step and adds no third-party
runtime framework. `desktop/plugin.js` uses the Hermes-provided SDK, React
runtime, UI components, and React Query cache. `dashboard/plugin_api.py` uses
FastAPI and Hermes's existing `honcho-ai` installation.

See [docs/architecture.md](docs/architecture.md) for the runtime flow, privacy
boundary, and compatibility notes. The desktop implementation follows the
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
