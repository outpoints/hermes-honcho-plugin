# Synthetic screenshot gallery

Every image renders the actual `desktop/plugin.js` using Hermes's real native
controls, shipped stylesheet and Nous light/dark theme. All profile names,
conversation text, metrics and responses are invented in
`tests/screenshots/fixtures.mjs`. No live account or Honcho service is connected.
The bar at the top of each capture labels this explicitly. These are isolated UI
captures, not screenshots of an activated plugin in a running Desktop/SSH session.

| Image | Purpose |
| --- | --- |
| [Memory, dark](memory-dark.png) | Landing view: newest conclusions and session context |
| [Memory, light](memory-light.png) | Light-theme landing view |
| [Memory, wide](memory-wide.png) | Full-width page |
| [Memory search](memory-search.png) | Semantic conclusion search |
| [Provenance](provenance.png) | Selected conclusion with premises and derived conclusions |
| [Provenance, light](provenance-light.png) | Light-theme inspector |
| [Ask](ask-memory.png) | New synthesis and the records Honcho read |
| [Messages](messages.png) | Saved messages |
| [Message search](search.png) | Scoped message search |
| [Context](context.png) | What Honcho would supply now |
| [Status](diagnostics.png) | Connection, profile, mapping and queues |
| [Add to session](add-to-session.png) | Target confirmation, no write |
| [Correction](correction.png) | Additive correction confirmation |
| [Memory pane](memory-pane.png) | Docked pane, dark |
| [Pane inspector](memory-pane-detail.png) | Docked pane with a conclusion open |
| [Memory pane, light](memory-narrow-light.png) | Docked pane, light |
| [Draft chat](draft.png) | A chat with no Honcho session yet |
| [Another profile](cross-profile.png) | A chat from another local profile, read in its owner profile |
| [Unsupported](unsupported.png) | Honest SDK capability gaps |
| [Unknown correction](unknown-correction.png) | Ambiguous write with retry blocked |
| [Disconnected](disconnected.png) | Backend unavailable without fallback |

The light captures `ask-light.png`, `correction-light.png`, `search-light.png`,
`status-light.png` and `memory-pane-detail-light.png` cover the light theme.
The catalog art in [`docs/catalog`](../catalog) uses the dark captures.

## Reproduce

Use a prepared Hermes checkout with installed `esbuild`, `playwright`, React and
UI dependencies, a built `apps/desktop/dist`, and Playwright Chromium installed.
The harness also needs `axe-core`. If it is not in the host checkout, install
it only in a scratch directory and set `AXE_SOURCE` to its `axe.min.js` file.
No dependencies or builds are added to the shipped plugin.

```sh
HERMES_SOURCE=/path/to/hermes-agent SCREENSHOT_WORK_DIR=/path/to/scratch \
  node scripts/screenshots.mjs
HERMES_SOURCE=/path/to/hermes-agent node scripts/catalog-art.mjs
```

The harness binds an ephemeral loopback port, blocks external network requests,
uses a fixed fixture timestamp, waits for local fonts, captures at 2× scale,
then shuts down the browser/server and removes its temporary bundle. It
exercises every section, cancels document ingestion without uploading, and
tests corrections only through the synthetic in-memory transport. It also
checks focus-switch races, host navigation, cross-profile routing, drafts,
unknown outcomes, disabled capabilities, and axe accessibility.
`SCREENSHOT_OUTPUT_DIR` can redirect captures to scratch. `verification.json`
records dimensions, the tested host commit, the plugin SHA-256 and
runtime/network checks. OS font rendering may vary.

`catalog-art.mjs` composes the 2:1 banner and the six gallery images from these
captures and the generated drawings in [`docs/catalog/art`](../catalog/art/README.md).
It loads Mondwest and Neuebit from the host checkout's `@nous-research/ui`
package (MIT) and JetBrains Mono from the built Desktop assets at render time,
and copies none of them here.

Review regenerated images visually before publishing. Do not replace these
fixtures with exports, screenshots, paths or IDs from a real profile.
