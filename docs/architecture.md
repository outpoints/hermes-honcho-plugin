# Architecture

## Decision

The plugin connects directly to the Honcho instance already configured for the
active Hermes profile. The separate Honcho dashboard is a design and
information-architecture reference only. It is not in the runtime path. This
keeps current-chat identity aligned with Hermes and supports cloud and
self-hosted Honcho without duplicating authentication.

## Runtime flow

1. Hermes Desktop exposes the focused connection, owner profile, stored session,
   runtime session, working directory, and local generation state through
   `host.state`.
2. The uncompiled desktop plugin sends only those identifiers to its namespaced
   backend using `ctx.rest()`.
3. Each React Query key contains the connection, profile, owner connection,
   focused profile, stored session, runtime session, and working directory.
4. In the collector worker, the backend binds Hermes's profile scope using the
   transport's `?profile=` selector or the host's current profile. It rejects
   mismatched body provenance and profiles where the plugin is not enabled
   before loading Honcho config or creating a client.
5. The backend loads `HonchoClientConfig.from_global_config()` and
   `get_honcho_client(config)` from Hermes's built-in Honcho provider.
6. Before a scoped read, the adapter lists workspaces and verifies the
   configured workspace exists. It does not use an SDK get-or-create path.
7. The backend reads the focused stored session's title provenance and working
   directory from that profile's state database when available.
8. Hermes's `resolve_session_name()` chooses the Honcho session, preserving
   per-directory, per-repository, per-session, manual override, and global
   strategy semantics.
9. A synchronous Honcho collector runs in a worker thread under an explicit
   timeout. Its home and secret scope last until that worker actually exits,
   including after an HTTP timeout or cancellation. Each collector returns
   bounded, sanitized data and can preserve successful subreads when another
   subread fails.

### Profile scope contract

`ctx.rest()` chooses the connection and profile through Hermes. Local/isolated
backends usually own their profile through `HERMES_HOME`; shared remotes supply
`?profile=`. The Python plugin mount provides authentication and plugin enable
gates, but does not automatically bind home/secret ContextVars for the router.
The plugin therefore calls Hermes's existing `_config_profile_scope` inside
the worker. Hermes validates the routed name and resolves its credentials.
The request body's profile fields are consistency checks, not scope selectors
or authorization to open another home. Unknown profiles, disabled plugins and
body/transport mismatches fail closed. Connection identity is enforced by the
host transport, not authenticated from a JSON string.

All nine route families use this boundary, including ticket preparation and
multipart upload. Tickets store the resolved profile even if the body omits
it, so a ticket cannot be replayed through another profile. A pre-existing
named host context is bound explicitly rather than accidentally pairing its
home with the launch profile's credentials. No request mutates `os.environ`,
reads credential files directly, or supplies fallback credentials.

Session metadata uses `SessionDB(read_only=True)` under the same scope. This
avoids a removed `web_server` export and never bootstraps a missing store.
An empty draft remains session-unresolved rather than borrowing the backend
process's cwd. Workspace connectivity can still be healthy without a session.

Regression coverage in `tests/test_profile_scope.py` uses the installed Hermes
scope/config/session implementations, isolated fixture homes and mocked Honcho
network services. It covers named and default profiles, concurrent thread
execution, routing rejection, missing stores/drafts, ticket isolation and
scope cleanup after success, exceptions, timeout and cancellation. Run it with
the Hermes interpreter, or run the complete suite with `./scripts/check.sh`.

Confirmed ingestion adds a separate mutation phase:

1. Desktop sends metadata only to `/upload-ticket` after the person reviews the
   lineage target.
2. The backend re-resolves the existing focused session and configured user
   peer, capability-checks `Session.upload_file`, and returns a random one-time
   ticket with a two-minute lifetime. It does not create a workspace, session,
   peer, or scope.
3. Desktop verifies that focus has not changed and the ticket's workspace,
   session and peer still match the displayed confirmation. It then sends the
   bytes through Hermes's authenticated multipart `ctx.rest()` transport.
4. The backend consumes the ticket before invoking Honcho so it cannot be
   replayed, uploads to the ticket-bound session/peer, and reads every returned
   message ID back through `Session.get_message`.
5. A timeout, transport loss or malformed receipt is reported as an unknown
   outcome rather than a clean failure. A synchronous SDK call may finish after
   the local timeout. The UI disables retries after ambiguous writes and prevents
   dismissal or duplicate submission while the upload is pending. A failed
   readback preserves the messages already verified, without claiming success.

Tickets are process-local. Run the companion in the normal single-process Hermes
backend, or keep ticket creation and upload on the same worker. A backend restart
invalidates outstanding tickets. The API reads at most the confirmed byte count
plus one from the multipart file and rejects mismatched sizes before contacting
Honcho. Host multipart parsing and deployment-level request limits still apply.

The dashboard manifest is hidden and its small JavaScript entry registers a
null component. Hermes's web dashboard loads enabled manifests to mount their
APIs, so this satisfies that host contract without creating a second UI.

## Deployment and remote routing

The frontend and backend have different installation scope:

1. The local workstation loads `desktop/plugin.js` once and owns the visual
   contributions.
2. Every local or remote profile has its own Hermes home, enabled-plugin list,
   Honcho configuration, state database, and session mappings. A backend process
   may serve more than one profile.
3. The API companion must therefore be installed and enabled separately in
   every profile that should serve the cockpit.
4. Hermes Desktop scopes `ctx.rest()` to the active connection and profile and
   transports it through the configured local, SSH, remote-gateway, or Hermes
   Cloud connection.
5. The receiving Hermes instance resolves Honcho using only that target
   profile's configuration and local session state.

SSH is transport for the Hermes API, not a second Honcho integration. The
renderer never receives the SSH host key, gateway token, Honcho credential, or
raw Honcho endpoint. A missing remote companion fails closed; requests are
never retried against a local profile or another connection. Duplicate profile
names on different gateways remain distinct because connection ID is part of
request and cache identity.

Before a remote request, `host.profileRoutes()` supplies the authoritative
mapping from `(connectionId, profile)` to `targetProfile`. The plugin puts that
target in the URL selector and both profile provenance fields. Read-route
discovery shares the host React Query cache for 10 seconds. Confirmed uploads
refresh it immediately and compare against the backend profile shown in the
confirmation. `ctx.rest()` remains the sole transport.

The plugin checks live focus ownership again after asynchronous route discovery.
Unresolved saved-session ownership, ambiguous routes and connection/profile
changes cannot silently dispatch to the newly active gateway. Ticket creation
and multipart dispatch use the same confirmed backend profile.

## Desktop surfaces

- `/honcho`: tabbed memory cockpit with Overview, Messages, Conclusions,
  Context, Search, and Activity sections.
- `Honcho Memory`: default-collapsed pane docked to the right of the focused
  conversation.
- Sidebar navigation: opens `/honcho`.
- Right status bar: compact connectivity, queue, and local-generation state.
- Command palette: opens the cockpit or opens its Search section.

The visual system uses Hermes components and theme tokens. Its dashboard
influence is structural: dense readout strips, quiet section hairlines,
monospace operational data, readable memory content, and progressive
disclosure. It does not copy the dashboard shell or add a frontend build/runtime
dependency. `ResizeObserver` measures each rendered plugin surface: widths under
420px stack details, widths under 840px use compact columns, and wider surfaces
use asymmetric session/configuration and paired queue compositions. This is
container-based because a docked pane can be narrow inside a wide app window.

## Backend endpoints

All endpoints are `POST` requests under the plugin's profile-scoped namespace.
Every model rejects unknown fields and inherits the focused-session ownership
fields used by `/snapshot`.

| Route | Read behavior | Bounds and refresh |
| --- | --- | --- |
| `/snapshot` | Connection, config, mapping, counts, peers, and queues | One summary object; polled no faster than 10 seconds |
| `/messages` | Saved messages for the resolved session | Page 1+, size 1 to 100; route/focus/manual refresh |
| `/conclusions` | Observer-to-user conclusions with provenance | Current or all scope; page 1+, size 1 to 100 |
| `/context` | Session summary, representation, peer context, and card | Token budget 256 to 32,000; no polling |
| `/search` | Session, peer, workspace, or verified existing Honcho-scope search | Submitted query only; length 1 to 2,000; limit 1 to 100 |
| `/scopes` | Existing visibility scopes (SDK 2.4+, server 3.1+); never get-or-create | Page 1+, size 1 to 100; capability-gated and no polling |
| `/activity` | Workspace and session queue status plus SDK capabilities | Aggregate-only where required; polled no faster than 10 seconds |
| `/upload-ticket` | Revalidates and binds a proposed file/text write to the exact existing session and user peer | Metadata only; supported types only; one-time ticket expires after two minutes |
| `/uploads/{ticket}` | Sends one PDF, JSON, or text payload through `Session.upload_file` and verifies every returned message | Multipart upload; authoritative file-size enforcement belongs to Honcho |

Pagination metadata is retained. Search ordering is Honcho-native and is not
re-ranked in the plugin. Optional SDK parameters are inspected before use so an
older installed `honcho-ai` version produces an explicit capability gap rather
than guessed data.

## Focus and stale-data isolation

A focused chat can belong to another profile or remote connection while the
renderer remains connected to its home gateway. The renderer therefore sends
both home and focused ownership. The backend fails closed if either differs.

A focus change produces a new query key immediately. The previous chat's value
is not used as placeholder data. Search submissions also store the focus
fingerprint that launched them; switching chats clears the submission and does
not replay it against the next chat. Pane queries are disabled while the pane
is collapsed.

## Security and privacy

- Credentials stay inside Hermes and are never sent to the renderer.
- Profile and connection ownership are validated before Honcho client creation.
- Existing workspace verification prevents reads from silently creating a
  workspace.
- URL user info, secret query values, bearer tokens, authorization fields,
  cookies, passwords, secrets, and API-key-shaped metadata are redacted.
- Error strings and returned content fields are length-bounded.
- No returned or logged context contains a credential-bearing endpoint.
- Read routes do not create or delete sessions, peers, scopes, messages,
  conclusions, context, or reasoning work.
- The only write route requires an explicit UI confirmation and a short-lived,
  one-time target ticket. It can create only messages in the exact existing
  focused session.
- Upload content type is limited to PDF, JSON, and `text/*`. File bytes are not
  stored in the ticket or logged.
- A verified upload response includes exact readback of every created message
  ID. An ambiguous timeout is never represented as a safe retry.

## Failure model

Top-level states distinguish `not_configured`, `disabled`, `route_mismatch`,
`workspace_missing`, `session_missing`, `unreachable`, and `unavailable`.
Context and snapshot collectors can return `partial` data with scoped errors.
The desktop keeps healthy layers visible and presents errors near the affected
surface instead of replacing the whole cockpit.

## Compatibility

The frontend remains one uncompiled plain ESM file. Runtime imports are limited
to `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`; rendering uses
`jsx()` and `jsxs()` without JSX syntax.

The backend treats the Python SDK installed in the selected profile backend as
authoritative; the Desktop workstation's version does not describe an SSH or
remote backend. It uses signature-based capability checks for APIs that differ
between Honcho versions and reports unavailable detail honestly.

The current automated matrix runs against the real Python SDK 2.2.0, 2.4.0,
and 2.5.0. First-class scopes require SDK 2.4+ and server 3.1+. Scope discovery
uses `Honcho.scopes()`. Exact search-boundary verification uses SDK 2.5's
non-creating `get_scope(id)` after workspace verification, or paginated scope
listing on 2.4 (at most 100 pages of 100 scopes). Exhausting that budget reports
an incomplete lookup, not a missing scope. The creating `scope(id)` helper is
never used. Failed scope discovery does not enable scope-search controls.

`SessionContext.summary` is a summary model, `peer_representation` carries its
representation, and `Peer.context()` returns a structured response. The adapter
extracts their text fields instead of stringifying models. It uses `get_card()`
when available and accepts an absent card as an empty state. The SDK provides
no total context token count, so the API returns null and the UI says unavailable.

SDK 2.5 supplies `source_ids` and `times_derived` on conclusions for Honcho 3.2.
The adapter preserves those fields and labels parents as conclusions, not
messages. Parent lists are bounded to 100 IDs with an explicit truncation flag.
Older SDKs return null for absent attribution. SDK 2.5 itself defaults a missing
derivation count to 1, so that count alone is not proof of server 3.2 support.
The plugin does not make new single-conclusion or graph-traversal requests.

Aggregate queue status and confirmed uploads work in all three matrix SDKs.
Failed-work-unit and recent-task detail remains unavailable through those queue
APIs, so Activity still labels that state `AGGREGATE_QUEUE_ONLY`. Honcho 3.1.2's
service-wide `/deriver/metrics` is a different API, not a workspace queue total.
It, chat evidence, and collector traces are not implemented here. See
[compatibility.md](compatibility.md) for verified coverage and feature boundaries.

## File-size semantics

There is no plugin-defined 10 MB maximum. Current Honcho server source defines
configurable `MAX_FILE_SIZE`, defaulting to 5,242,880 bytes (5 MiB). The plugin
surfaces that as Honcho's default, not a universal hard limit, because a
self-hosted deployment may configure another value. The selected Honcho server
remains authoritative. Its separate approximately 49,500-character extraction
chunks keep generated messages below the 50,000-character message limit and do
not define maximum upload bytes.

Hermes Desktop forwards multipart uploads for local, SSH, and token-authenticated
remote connections. OAuth-gated remote backends currently reject uploads in the
Hermes transport. The plugin surfaces that error and never redirects the write
to a local or differently authenticated profile.

## Phase 2 backlog

These write operations remain intentionally unimplemented:

- Schedule a dream.
- Retry failed reasoning work.
- Create or delete conclusions.
- Edit peer cards.
- Add or remove session peers.
- Create, attach, edit, or delete Honcho scopes.

Each future mutation needs an explicit confirmation flow, profile/session
ownership validation, capability gating, targeted tests, and a readback that
verifies the exact changed resource.
