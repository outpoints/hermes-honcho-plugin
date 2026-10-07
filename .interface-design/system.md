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

### Narrow: under 440px

For the docked pane and very narrow route tiles:

- One content column. The pane omits the page title; the status and actions
  lead the header.
- The lineage wraps inline (`Connection local · Profile demo · …`); identifiers
  wrap rather than truncate.
- Sections live behind one host-style menu trigger (`Memory ⌄`), not tabs.
- Toolbars stack: search on its own row, then scope and the primary action
  share a row.
- Selecting a conclusion replaces the list with its inspector and a back
  button (`All conclusions`).
- Detail rows keep a narrow label column (6.5rem) instead of stacking.

### Compact: 440–879px

- Text tabs, one content column.
- Selecting a conclusion replaces the list, as in narrow.

### Wide: 880px and above

- Memory splits into the conclusion list (3fr) and a sticky inspector (2fr,
  min 18rem) separated by one tertiary hairline. With nothing selected, the
  inspector shows the session summary and peer card.
- Status uses two columns of grouped detail rows.
- Prose is capped near 72 characters. Ask and Context cap their column at 880px.

Full-width does not mean every panel spans edge to edge. Content width follows semantic usefulness while the composition fills the workspace.

## Depth and surfaces

Use border-led, flat depth consistent with Hermes:

1. Base: inherited workspace background.
2. Grouped region: a subtle Hermes surface token with one quiet boundary.
3. Inset input/content preview: control or muted background token.
4. Dialog/popover: Hermes SDK primitive owns elevation and shadow.

No component may combine a strong border, independent shadow, and contrasting fill. Ordinary regions should remain legible if their border disappears in a squint test.

## Typography

- Page title: Hermes sans, 14px semibold, sentence case.
- Region title: Hermes sans, 12–14px medium, sentence case. No bracketed terminal headings.
- Controls: inherit the SDK primitive's typography and sizing without local overrides.
- Field labels: 12px sans. Underscore-delimited internal labels are presentation-only and display as readable words. Never transform identifiers or source content.
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

A region is flat, grouped by its heading and whitespace. Avoid outer frames and repeated row dividers. A status dot in a region heading is reserved for an actual warning or failure. Do not render decorative window controls or healthy dots on every heading.

### Lineage strip

Show safe labels only: connection display label or local identity, profile, resolved Honcho session, and attributed peer. Never show endpoint credentials, gateway tokens, SSH keys, or credential-bearing URLs.

### Detail list

Use whitespace between rows. Add a tertiary hairline only when rows require stronger scan separation. On narrow layouts, stack label over value and left-align both.

On compact and wide layouts, put label and value on the same grid row and left-align values. Declare `gridTemplateColumns` explicitly so the layout works with the host's shipped CSS, without generating new Tailwind classes.

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
- Use the host's underline text-tab treatment (as on the Capabilities page) with arrow-key navigation, and a dropdown menu trigger below 440px. Use SegmentedControl for two-way scope choices and Select for longer lists. Narrow scope controls use Select too.
- Runtime plugins get no Tailwind build. Every utility class must already exist in the host's shipped stylesheet; `scripts/check-ui-surface.mjs` enforces this. Put missing geometry (dialog size, grid columns, `last:`-style rules) in inline styles or logic.
- Use the shared SearchField. Enter submits only the explicit search action, not its embedded Clear button, and IME composition must not submit.
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

## Runtime CSS verification

The plugin is uncompiled. Verify against the desktop's shipped CSS, not a Tailwind build scanning the plugin, which can hide missing utility selectors. Keep essential custom grid geometry, wrapping, and prose width in inline styles. Use container-relative page gutters clamped to the Hermes 20–64px range. Do not invent `--page-gutter-x` or `--page-gutter-y`: the host does not define them.

Use a real flex/grid wrapper for section spacing. `display: contents` removes the wrapper's layout box and defeats parent `space-y-*` spacing. Compare before and after with the same data, theme, and pane dimensions.
