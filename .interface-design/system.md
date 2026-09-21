# Honcho Memory Cockpit Visual System

## Intent

The cockpit serves a person actively working in a Hermes conversation. They need to verify which profile and Honcho session own the visible memory, inspect recall and reasoning state, and deliberately add source material without leaving the current task.

The interface should feel like a precise Hermes instrument panel: dense where comparison matters, calm where reading matters, and unmistakably attached to the focused conversation. It must not become a generic KPI-card dashboard or a separate visual product inside Hermes.

## Domain

- Focused conversation
- Memory lineage and provenance
- Session mapping
- Peers and observation direction
- Recall layers
- Ingestion and background reasoning
- Connection/profile isolation

## Color world

The plugin inherits the active Hermes theme. Its color world is the existing Hermes canvas, subtle editor surfaces, quiet hairlines, primary accent, and semantic status colors. It must never introduce a standalone Honcho palette.

- Canvas and ordinary content: Hermes page/editor background
- Recessed or grouped content: Hermes muted/widget surface tokens
- Separators: `--ui-stroke-tertiary` by default
- Primary text: `--ui-text-primary`
- Supporting text: `--ui-text-secondary`
- Metadata: `--ui-text-tertiary`
- Disabled/unsupported: `--ui-text-quaternary`
- Focus and current target: `--ui-accent` / `--theme-primary`
- Health, warning, and failure: Hermes semantic component tones only

## Signature

Use a compact memory lineage strip to connect the ownership chain:

`connection → profile → Honcho session → attributed peer`

The same lineage must appear in the read overview and the Add to Session confirmation. It is both a visual signature and a security affordance: users can see where a read or write lands.

## Rejecting defaults

- Repeated equal-weight cards → asymmetric semantic regions and flat grouped rows.
- Viewport breakpoints → measured container layouts, because Hermes panes resize independently of the window.
- Decorative terminal window chrome → real Refresh, Copy, and Add to Session actions.
- Monospace everywhere → Hermes sans for prose and message content, monospace for operational data.
- Color-coded decoration → color only for current focus, action, and status.
- Nested bordered cards → one surface boundary, then whitespace or a single tertiary hairline.

## Hermes contracts

The Hermes Desktop `DESIGN.md` is authoritative when it changes. Current hard constraints:

- Flat, not boxed.
- Tokens over literals.
- Shared SDK controls over bespoke controls.
- `--ui-stroke-tertiary` for ordinary in-panel separation.
- No nested rounded boxes or card-in-card composition.
- No custom shadows on page content.
- Use Hermes page gutters rather than inventing unrelated page widths.
- Actions must have hover, active, focus-visible, disabled, loading, success, and error states.
- Confirmation is explicit and preserves user intent; no write occurs when a file is merely selected.

## Responsive layout

Layout is based on the plugin container width, measured with `ResizeObserver`, not the global app viewport.

### Narrow: under 420px

For the docked pane and very narrow route tiles:

- One content column.
- Lineage uses a compact two-by-two strip; identifiers wrap within their cells
  instead of making provenance consume four full rows.
- Detail rows stack label above value; values are left-aligned.
- Metric readouts use at most two columns and collapse to one when content needs it.
- Primary actions fill available width; related quiet actions may share a row,
  and shared action targets are at least 32px high.
- The tab rail becomes one Hermes Select showing the current section, avoiding
  clipped or undiscoverable horizontal overflow.
- Dialog/form controls stack; filenames and session IDs wrap instead of truncating critical identity.

### Compact: 420–839px

For resized panes and small workspace tiles:

- One major region per row.
- Metric strips use two columns.
- Session and profile regions remain separate but can share horizontal detail rows.
- Upload preview remains a single reading column.

### Wide: 840px and above

For ordinary and full-width workspace views:

- Use a 12-column composition.
- Focused session is primary at 7 columns; profile/configuration is secondary at 5.
- Current-session and workspace queues sit side by side at 6 columns each.
- Reading surfaces such as messages, conclusions, search results, and context preview can use the full width, but prose is capped near 72 characters per line.
- Extra width creates useful comparison and breathing room, not stretched label/value pairs.

Full-width does not mean every panel spans edge to edge. Content width follows semantic usefulness while the composition fills the workspace.

## Depth and surfaces

Use border-led, flat depth consistent with Hermes:

1. Base: inherited workspace background.
2. Grouped region: a subtle Hermes surface token with one quiet boundary.
3. Inset input/content preview: control or muted background token.
4. Dialog/popover: Hermes SDK primitive owns elevation and shadow.

No component may combine a strong border, independent shadow, and contrasting fill. Ordinary regions should remain legible if their border disappears in a squint test.

## Typography

- Page title: Hermes sans or restrained mono identity, medium weight, tight tracking.
- Region title and controls: 10–11px monospace, uppercase, moderate tracking.
- Counts/IDs/timestamps: monospace with tabular numerals.
- Explanations, messages, conclusions, errors, and context: Hermes sans, readable line height, maximum 65–75ch.
- Use primary, secondary, tertiary, and quaternary text levels. Do not flatten copy into one foreground and one gray.

## Spacing

Use a 4px base unit.

- Micro: 4px
- Related controls/metadata: 8px
- Region interior: 12px or 16px
- Between related regions: 12px
- Major separation: 20px or 24px

Padding is symmetrical unless a list row deliberately uses a shared outer gutter.

## Component patterns

### Region

A region has one quiet outer boundary or a single surface shift. Its header contains a status dot, title, and real actions only. Do not render decorative minimize/maximize/close glyphs.

### Lineage strip

Show safe labels only: connection display label or local identity, profile, resolved Honcho session, and attributed peer. Never show endpoint credentials, gateway tokens, SSH keys, or credential-bearing URLs.

### Detail list

Use whitespace between rows. Add a tertiary hairline only when rows require stronger scan separation. On narrow layouts, stack label over value and left-align both.

### Metric strip

Metrics are compact instrument readouts, not hero cards. Values remain modest in size. Group only comparable values.

### Add to Session

Use a Hermes Dialog as a short form, not an irreversible-alert modal.

1. Choose Paste Text or File.
2. Preview filename/type/size or text character count.
3. Show the full lineage target and attributed peer.
4. Explain that Honcho creates one or more messages and queues background processing.
5. Require the explicit `ADD TO SESSION` action.
6. On success, show exact created-message count/IDs and refresh affected reads.

Selecting a file never writes. If focus identity changes before submission or while a request is in flight, cancel publication and require a fresh confirmation.

### File-size language

Do not call 10 MB a Honcho limit. Current Honcho source exposes configurable `MAX_FILE_SIZE` with a 5 MiB default (`5,242,880` bytes). The file-upload guide separately documents chunking extracted text near 49,500 characters to stay below message limits.

- If an authoritative backend limit is discoverable, show it.
- Otherwise say “Honcho’s current default is 5 MiB; self-hosted servers may configure another limit.”
- Do not add an unrelated product cap or imply the default is universal.
- Surface authoritative transport/server rejection without retrying an ambiguous upload automatically.

## Interaction and motion

- Use Hermes Button, Input, Textarea, Dialog, status, loading, and copy primitives.
- Keep hover/press/focus transitions fast and functional.
- No bounce, spring, background animation, or decorative motion.
- Preserve keyboard navigation and visible focus.
- Disable duplicate submission while pending.
- Errors remain visible until the user changes input or retries.

## Avoid

- Hardcoded hex, RGB, or standalone color names
- Gradients, backdrop blur, decorative shadows, or glow
- Card grids of identical repeated tiles
- Nested borders and nested panel chrome
- Fake window controls
- Pill-shaped technical badges
- Full-width prose with excessively long lines
- Right-aligned values separated from labels by huge empty space
- Upload limits described without distinguishing server default, server configuration, and transport behavior
- Writes to missing sessions or automatic fallback to another profile/connection
