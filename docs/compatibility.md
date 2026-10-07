# Honcho compatibility verification

## 0.4.0 (2026-10-07)

- Python suite (94 tests) passes under real `honcho-ai` 2.2.0, 2.4.0, 2.5.0 and
  2.5.1, each loaded as an isolated overlay through the managed Hermes launcher.
  Each run printed the overlay's version. JavaScript suite: 68 tests.
- Conclusions are listed newest first. Honcho's server orders conclusions by
  `created_at` descending by default, and `reverse=true` means oldest first
  (verified in Honcho 3.0.0 through 3.3.0 source). Messages are the opposite:
  oldest first by default. Earlier releases sent `reverse=true` for both, which
  showed the oldest conclusions first. A regression test now pins the order.
- Host API floor: every Desktop SDK import exists from Hermes 0.21.0
  (`scripts/check-ui-surface.mjs`). The backend's profile-scope helper ships in
  0.21.1, and its per-profile secret scope in 0.21.4. Cross-profile reads rely on
  that secret scope, so the catalog entry declares `requires_hermes: ">=0.21.4"`.
  This floor comes from source inspection of tagged releases, not from running
  each release.

## Earlier verification

Offline matrix refreshed for the memory workbench on 2026-09-29. The installed
SDK for that matrix was **`honcho-ai==2.2.0`**. Isolated overlays also pass with **2.4.0**,
**2.5.0**, and **2.5.1**. Do not modify Hermes, upgrade its SDK, or change its
dependency pins to install this plugin. Earlier live-read results are historical
verification from 2026-09-21. Neither those nor the debundled-provider checks
below exercise live questions or corrections.
The reference dashboard uses the separate TypeScript `@honcho-ai/sdk` package.

## Debundled provider verification (2026-10-04)

Current Hermes installs the `honcho` memory provider separately from this
workbench. All backend paths now resolve its client through Hermes's
`plugins.memory.import_provider_module("honcho", "client")` inside the routed
profile scope. Hosts without that resolver retain the legacy bundled import.
An installed resolver's failure never triggers a bundled fallback, and the
workbench does not cache a provider across requests or profiles.

- `./scripts/check.sh`: 93 Python and 58 JavaScript tests passed with the
  installed `honcho-ai==2.5.1` runtime.
- Regression tests cover snapshot, shared-read and workbench imports without
  the bundled package, legacy hosts, resolver failures and repeat resolution.
- Profile tests use the real installed provider in isolated fixture homes,
  retaining routing, credential-scope, concurrency and timeout coverage.
- A fresh process loaded the installed API companion and exercised snapshot,
  messages, conclusions, context, capabilities, activity and scopes against the
  configured self-hosted server. All seven returned HTTP 200 and `connected`.
  The probe permitted only read operations. All 34 outgoing requests returned
  HTTP 200. No reasoning calls, corrections or uploads were performed.

This verifies the installed files in a fresh process, not a hot reload of the
running Desktop backend. Restart Hermes Desktop after changing the Python API.

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
| 2.5.1 | Supported | Exact non-creating `get_scope` | Parent IDs and derivation counts |

The new workbench suite runs through each real SDK's HTTP layer:

| Operation | SDK 2.2 / 2.4 | SDK 2.5.0 / 2.5.1 |
| --- | --- | --- |
| Semantic conclusion search | Supported, relationship/session filters verified | Supported |
| Exact-record inspector | Supported | Supported |
| Parent/derived inspector | Explicitly unavailable | One level, up to ten per direction, server 3.2+ required |
| Session/across-session questions | Supported, explicit submit only | Supported |
| Accessed-record evidence | Explicitly unavailable | Requires `include_evidence` and verified server 3.2+ |
| Additive correction | Confirmed create plus exact readback | Confirmed create plus exact readback |

Each SDK run passes 88 Python tests. The frontend suite passes 45 JavaScript
tests. Server metadata is synthetic in this matrix. The backend checks the
selected runtime's methods/signatures and a bounded read-only OpenAPI version
probe for optional graph/evidence support. An unavailable version probe keeps
those controls unavailable rather than speculatively sending newer flags.

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
- Bounded parent/derived navigation, exact identity checks, and partial graph
  failures that preserve the original record.
- Explicit questions with no SDK retry, correct session/target, and optional
  evidence failures that preserve the answer.
- Single-use correction tickets, resolved-profile isolation, changed targets,
  expiry, exact created-content readback, and ambiguous writes without retry.
- Browser tests for pending-dismissal locks, duplicate clicks, focus changes,
  stale-answer suppression, unsupported capabilities, and unknown outcomes.

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

For a **managed Hermes launcher**, do not substitute a surviving legacy venv.
Its composed bootstrap can take precedence over `PYTHONPATH`. Install the SDK
with `uv pip install --target "$SDK_TARGET" --no-deps 'honcho-ai==2.5.0'`, then
insert the overlay after that bootstrap. From the repository root, with
`SDK_TARGET` exported:

```sh
python3 -c 'import json, subprocess, sys
command = json.loads(subprocess.check_output(["hermes", "--print-runtime-command"], text=True))
bootstrap, marker, _ = command[-1].rpartition("; runpy.run_module(")
if not marker: raise SystemExit("Unrecognized managed launcher. Inspect its runtime command first.")
command[-1] = bootstrap + "; import os, importlib.metadata; sys.path.insert(0, os.path.abspath(os.environ[\"SDK_TARGET\"])); print(\"honcho-ai\", importlib.metadata.version(\"honcho-ai\")); sys.argv=[\"unittest\",\"discover\",\"-s\",\"tests\"]; runpy.run_module(\"unittest\", run_name=\"__main__\")"
sys.exit(subprocess.call(command))'
```

The printed distribution version must match the intended overlay. This command
only changes the test subprocess, not the installed runtime or its dependencies.

## Historical live read-only verification (2026-09-21)

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
For remote requests, the plugin obtains `targetProfile` from Hermes's public
`host.profileRoutes()` API and uses that same value in the URL and body
provenance. It never infers a target from an alias or opens its own tunnel.
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

- Parent/derived navigation is one level at a time, not a full graph explorer.
  `source_ids` contains parent conclusion IDs, not message IDs.
- SDK 2.5 defaults an omitted `times_derived` to 1. A displayed count alone does
  not prove server 3.2 support.
- Named scope listing remains paginated and the current Desktop picker loads
  its first 100 scopes. The backend accepts later-page scope IDs and verifies
  them correctly. SDK 2.4 verification has a 100-page safety budget and reports
  incomplete lookup if exhausted.
- Questions concern the configured agent-to-user relationship, not arbitrary
  peer or workspace chat. Evidence lists records accessed, not guaranteed
  citations or a record of the current Hermes turn's injected prompt.
- Corrections add explicit facts. They do not edit/delete prior conclusions,
  forge derivation links, or promise immediate representation changes.
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
