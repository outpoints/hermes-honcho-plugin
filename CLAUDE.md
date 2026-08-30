# Hermes Honcho Plugin

## Architecture

- `desktop/plugin.js` is an uncompiled Hermes Desktop SDK plugin. Keep it to
  plain ESM and `jsx`/`jsxs`; do not add a frontend build step.
- `dashboard/plugin_api.py` is a profile-scoped, read-only FastAPI adapter over
  Hermes's built-in Honcho provider and the installed `honcho-ai` SDK.
- The desktop UI must use `ctx.rest()` for backend calls. Do not introduce the
  separate Honcho dashboard as a runtime dependency.
- Never read or return Honcho credentials. Let Hermes resolve them.

## Development rules

- Verify SDK imports against the current Hermes Desktop SDK before adding one.
- Keep polling at 10 seconds or slower and share a React Query cache key.
- Preserve partial results when an individual Honcho metric fails.
- Cover malformed input, disconnected Honcho, and missing-session states.
- Run `./scripts/check.sh` before submitting changes.
