# Catalogue submission package

The entry template is [catalog-entry.yaml.in](catalog-entry.yaml.in).
It is deliberately **not a valid submission until the release commit is pinned**.
Do not use a commit that predates the candidate, a branch, a tag, or a fabricated SHA.

The template passed the upstream `scripts/validate_plugin_catalog.py` after a
scratch-only substitution of an existing full SHA. That checks the schema only.
It does not verify unpublished image URLs.

## What is prepared

- Matching plugin manifest, dashboard manifest, backend and entry version:
  **0.4.0**. A contract test keeps all four in agreement.
- `requires_hermes: ">=0.21.4"`, a SemVer floor derived from the host APIs the
  plugin uses. See [compatibility.md](compatibility.md).
- SDK-only runtime ESM and host-owned authenticated transport. No self-updater,
  no dynamic imports, and no reads of host markup (`data-tour`, `data-slot`).
- Existing Hermes Honcho configuration and SDK, with no new runtime dependency.
- Empty tool/hook/middleware/env capabilities, matching the registration probe.
  This is a Desktop UI/API companion, not a replacement memory provider.
- A 2:1 banner and six gallery images in [`docs/catalog`](catalog), all
  rendered from synthetic data, plus a README with a disclosure section.
- The historical implementation plan that triggered the scanner's
  `agent_config_mod` caution is no longer in the repository.
- Public maintainer handle only. No private contact information is needed.
- [Verification and privacy record](release-readiness.md).

## Before submitting

The repository is private. Catalogue admission requires publicly accessible
code and image URLs, so its visibility must change first. Publishing a commit
does not submit it to the catalogue.

1. Complete the [Windows SSH checklist](windows-ssh-testing.md).
2. Run `./scripts/check.sh`, `hermes plugins validate . --json`,
   `hermes plugins doctor --ci .`, the host checks and privacy scans.
3. Replace every `RELEASE_COMMIT_SHA` in the template with the exact published
   40-character lowercase commit SHA. Save it as
   `plugin-catalog/hermes-honcho-plugin.yaml` in a Hermes contribution checkout.
4. Run upstream `scripts/validate_plugin_catalog.py` against the completed entry,
   then `hermes plugins validate` on a fresh checkout of the pin. Verify every
   image URL resolves publicly.
5. Open a PR to `NousResearch/hermes-agent`. A maintainer reviews and merges it.
   Future releases need a new reviewed SHA-bump PR.

The platform list describes intended SDK support, not three separate live OS
test results.

## Suggested PR description

Adds `hermes-honcho-plugin`, a Hermes Desktop workbench for the Honcho memory
behind the focused chat. It lists the session's conclusions newest first,
traces premises and derived conclusions, searches messages, asks scoped
questions, and adds confirmed corrections or source files.

Disclosure:

- Network: only the Honcho server each profile is already configured to use,
  through that profile's Honcho provider. No telemetry.
- Reads outside its own data: the focused chat's title and working directory
  from the profile's session database, read-only.
- Writes: an additive conclusion or session messages, each only after explicit
  confirmation, with exact readback. No automatic retries.
- Usage: Ask runs a Honcho reasoning call, only when the user submits it.
- Credentials: never read, returned or stored by the plugin.

All backend traffic goes through `ctx.rest()`. Remote aliases resolve through
`host.profileRoutes()`. Chats on another connection, or with ambiguous
ownership, fail closed. Screenshots contain synthetic data only.

Attach the final test results, the tested host revision, the Windows SSH result
and any scanner warnings. Link the exact pinned release, not a moving branch.
