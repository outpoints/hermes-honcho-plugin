# Synthetic screenshot gallery

Every image renders the actual `desktop/plugin.js` using Hermes's real native
controls, shipped stylesheet and Nous light/dark theme. All profile names,
conversation text, metrics and responses are invented in
`tests/screenshots/fixtures.mjs`. No live account or Honcho service is connected.
The visible banner labels this explicitly. These are isolated UI captures, not
screenshots of an activated plugin in a running Desktop/SSH session.

| Image | Purpose |
| --- | --- |
| [Overview, dark](overview-dark.png) | Main catalogue screenshot |
| [Overview, light](overview-light.png) | Light-theme example |
| [Messages](messages.png) | Saved conversation inspection |
| [Conclusions](conclusions.png) | Provenance and derivations |
| [Context](context.png) | Recall layers |
| [Search](search.png) | Explicit scoped search |
| [Add to session](add-to-session.png) | Target confirmation, no write |
| [Memory pane](memory-pane.png) | Narrow docked surface |
| [2:1 banner](banner.png) | Catalogue card image |

The catalogue template selects six gallery images, the current catalogue limit.
The remaining views remain available in this repository.

## Reproduce

Use a prepared Hermes checkout with installed `esbuild`, `playwright`, React and
UI dependencies, a built `apps/desktop/dist`, and Playwright Chromium installed.
No dependencies or builds are added to the shipped plugin.

```sh
HERMES_SOURCE=/path/to/hermes-agent SCREENSHOT_WORK_DIR=/path/to/scratch \
  node scripts/screenshots.mjs
```

The harness binds an ephemeral loopback port, blocks external network requests,
uses a fixed UTC fixture timestamp, waits for local fonts, captures at 2× scale,
then shuts down the browser/server and removes its temporary bundle. It
exercises every tab and cancels the confirmation dialog without uploading.
`verification.json` records dimensions, the tested host commit, the plugin
SHA-256 and runtime/network checks. OS font rendering may vary.

Review regenerated images visually before publishing. Do not replace these
fixtures with exports, screenshots, paths or IDs from a real profile.
