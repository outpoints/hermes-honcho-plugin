# Honcho compatibility verification

Verified on 2026-09-21. The plugin works with Honcho **3.2.0** and upstream
Hermes's installed Python SDK, including **`honcho-ai==2.2.0`**. It also supports
SDK **2.4.0** and **2.5.0** when supplied by the host. Do not modify Hermes,
upgrade its SDK, or change its dependency pins to install this plugin.
The reference dashboard uses the separate TypeScript `@honcho-ai/sdk` package.

## Automated matrix

`./scripts/check.sh` runs JavaScript syntax/contract/render checks, backend unit
checks, profile isolation checks using real Hermes imports, and real-SDK HTTP
contract checks. The HTTP fixtures are synthetic, offline test data, not live
server responses.

| Python SDK | Existing reads and confirmed upload | Named scopes | Attribution fields |
| --- | --- | --- | --- |
| 2.2.0 | Supported | Explicitly unavailable | Null when absent in SDK |
| 2.4.0 | Supported | Paginated non-creating lookup | Null when absent in SDK |
| 2.5.0 | Supported | Exact non-creating `get_scope` | Parent IDs and derivation counts |

The suites include local multiplexed read and upload routing regressions.
The matrix tests cover:

- Workspace, session and peer discovery without get-or-create writes.
- Message pagination and conclusion observer/observed/session filters.
- Real summary, session-context, peer-context and conclusion model conversion.
- Absent cards and unavailable total context token counts.
- Session, peer, workspace and named-scope search transport boundaries.
- Missing workspaces/sessions, unavailable scope APIs, denied scope listing,
  missing scopes and upstream 503 responses without broadening recall.
- Explicit upload preparation followed by multipart upload and exact readback
  of every returned message ID. The synthetic upload creates two fixture messages.
- Rendering parent IDs as conclusions, not messages, and suppressing unavailable
  attribution and token totals instead of inventing values.

Plugin doctor passes runtime discovery, manifest parsing, import and registration.
`git diff --check` passes.

### Repeating without upgrading Hermes

Use the Python interpreter that runs the selected Hermes backend. Set
`HERMES_PYTHON` to that executable and `SDK_TARGET` to a new scratch directory.
Install only the desired SDK into the overlay:

```sh
uv pip install --python "$HERMES_PYTHON" --target "$SDK_TARGET" --no-deps 'honcho-ai==2.5.0'
PYTHONPATH="$SDK_TARGET${PYTHONPATH:+:$PYTHONPATH}" ./scripts/check.sh
```

Repeat with 2.4.0 in a different directory, then run `./scripts/check.sh` without
an overlay for the installed runtime. The overlay uses the interpreter's existing
dependencies. It verifies compatibility with that dependency set, not every
possible clean installation.

## Live read-only verification

The configured server reported **3.2.0** through its OpenAPI metadata. A separate
process loaded SDK 2.5.0 from the overlay, entered the plugin's default-profile
worker scope, and exercised the checked-out adapter through Hermes's real config
and SDK client factory.

These collectors returned `connected` with no scoped errors:

- Snapshot
- Messages
- Conclusions
- Context
- Activity
- Scopes

The same live check with the installed SDK 2.2.0 returned connected for the first
five collectors. Scopes returned the expected `unsupported_sdk` state.

No live uploads, chat calls, graph traversal, scope changes, SDK upgrades,
backend restarts, or production migrations were performed. Live search and the
Desktop-to-backend transport were not exercised by this smoke check. Search and
upload behavior were verified through the offline real-SDK transport suite.
Only version/status metadata was emitted, not memory content or credentials.

The running Hermes backend may retain previously imported Python code. Restart
the affected backend separately when deploying these changes. Updating the
plugin alone does not install SDK 2.5.0 into local or remote Hermes runtimes.

## Scope and limits

### Local multiplexed Desktop routing

Some Desktop builds mark shared local backends `sharedPrimary`, but their
registry REST dispatcher adds a profile query only for `sharedRemote`.
The plugin explicitly supplies `?profile=<selected-profile>` for local
`ctx.rest()` requests, including upload-ticket creation and multipart upload.
Remote routing remains owned by Hermes so SSH aliases are not reinterpreted.
The backend's profile mismatch, plugin enablement, and upload ownership guards
remain unchanged. No Hermes source patch or SDK upgrade is needed.

Read-only checks through the plugin's ASGI router, real Hermes profile scopes,
and installed SDK 2.2.0 returned connected snapshots for the default profile
and multiple named profiles. Saved-session reads succeeded where a mapped
Honcho session existed. An unsaved session returned `session_missing`, not a
routing failure. Named scopes returned `unsupported_sdk` where a session was available.
These probes did not write Honcho records and do not verify the running
Desktop renderer has reloaded the edited plugin. Reload desktop plugins in the
command palette if the installed symlink's file watcher has not picked it up.

### Feature boundaries

This compatibility work does not port every dashboard feature:

- Conclusion attribution is displayed, but parent/backlink navigation is not
  implemented. `source_ids` contains parent conclusion IDs, not message IDs.
- SDK 2.5 defaults an omitted `times_derived` to 1. A displayed count alone does
  not prove server 3.2 support.
- Named scope listing remains paginated and the current Desktop picker loads
  its first 100 scopes. The backend accepts later-page scope IDs and verifies
  them correctly. SDK 2.4 verification has a 100-page safety budget and reports
  incomplete lookup if exhausted.
- Peer/workspace chat and `include_evidence` are not part of this plugin.
- Service-wide `/deriver/metrics` backlog and optional collector call traces are
  not the workspace/session aggregate queue API and are not implemented here.
- Existing remote transport limitations still apply, including Hermes's
  OAuth-gated multipart upload restriction.

## References

- [Honcho API and SDK changelog](https://honcho.dev/docs/changelog/introduction)
- [Reference dashboard validation](https://github.com/outpoints/honcho-dashboard/blob/main/docs/HONCHO_3_2_VALIDATION.md)
- [Reference dashboard provenance](https://github.com/outpoints/honcho-dashboard/blob/main/site/src/lib/honcho/provenance.ts)
- [Reference dashboard scope listing](https://github.com/outpoints/honcho-dashboard/blob/main/site/src/lib/honcho/scopeListing.ts)
- Installed Python distributions inspected directly: `honcho-ai` 2.2.0, 2.4.0,
  2.5.0 (`client.py`, `session.py`, `peer.py`, `conclusions.py`, `api_types.py`).
