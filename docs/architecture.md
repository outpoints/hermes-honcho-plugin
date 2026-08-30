# Architecture

## Decision

The plugin connects directly to the Honcho instance already configured for the
active Hermes profile. The separate Honcho dashboard is not in the runtime
path. This keeps current-chat identity aligned with Hermes and lets the plugin
work for cloud and self-hosted Honcho deployments without duplicating auth.

## Runtime flow

1. Hermes Desktop exposes the focused profile, session, working directory, and
   local generation state through `host.state`.
2. The uncompiled desktop plugin sends only those identifiers to its namespaced
   backend with `ctx.rest()`.
3. Hermes applies the focused profile to the request.
4. The backend loads `HonchoClientConfig.from_global_config()` and
   `get_honcho_client(config)` from Hermes's built-in Honcho provider.
5. The backend reads the focused stored session's title provenance and working
   directory from the active profile's state database when available.
6. The provider's own `resolve_session_name()` chooses the Honcho session, so
   per-directory, per-repository, per-session, manual override, and global
   strategies remain consistent with memory writes.
7. The backend returns bounded, redacted metrics. Each metric can fail without
   discarding the others.

The dashboard manifest is hidden and its tiny JavaScript entry registers a null
component. Hermes's web dashboard loads every enabled manifest even when it
exists only to mount an API, so this completes that host contract without
creating a second user interface.

## Surfaces

- `/honcho`: full status page registered in the desktop route area.
- Sidebar navigation: opens the full status page.
- Right status bar: compact connectivity, queue, and local generation state.
- Command palette: opens the status page.

## Security and privacy

- Credentials stay inside Hermes and are never sent to the desktop renderer.
- Endpoint output excludes URL user info and query strings.
- SDK and network error strings are length-bounded and redact common token
  forms before reaching the UI.
- The plugin exposes only read operations. The Honcho SDK may perform its
  normal idempotent workspace ensure before list calls.

## Compatibility

Version 0.1.0 targets the Hermes Desktop SDK documented and shipped with Hermes
Agent v0.20.6. Disk plugins must remain a single plain ESM file with imports
limited to `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`.
