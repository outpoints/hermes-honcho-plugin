# Catalogue submission package

The entry template is [catalog-entry.yaml.in](catalog-entry.yaml.in).
It is deliberately **not a valid submission until the release commit is pinned**.
Do not use a commit that predates the candidate, a branch, a tag, or a fabricated SHA.

The template's structure passed the upstream catalogue validator after a
scratch-only substitution of an existing full SHA. That check validates schema
only. It does not make the old commit a release candidate or verify unpublished
screenshot URLs.

## What is prepared

- Matching plugin and dashboard manifest version: **0.3.1**.
- SDK-only runtime ESM and host-owned authenticated transport. No self-updater.
- Existing Hermes Honcho configuration and SDK, with no new runtime dependency.
- Empty tool/hook/middleware/env capabilities, matching the registration probe.
  This is a Desktop UI/API companion, not a replacement memory provider.
- A 2:1 synthetic banner and six selected gallery images, all repository-local.
- Public maintainer handle only. No private contact information is needed.
- [Verification and privacy record](release-readiness.md).

## Before submitting

The repository is currently private. Catalogue admission requires publicly
accessible code and image URLs. Any visibility change needs separate owner
approval. Publishing a Git test candidate does not submit it to the catalogue.

1. Complete the [Windows SSH checklist](windows-ssh-testing.md).
2. Run `./scripts/check.sh`, `hermes plugins validate . --json`,
   `hermes plugins doctor --ci .`, the host transport check and privacy scans.
3. Review the complete diff and new assets. Commit and publish any final fixes
   only with the repository owner's approval.
4. Replace every `RELEASE_COMMIT_SHA` in the template with that exact published
   40-character lowercase commit SHA. Ensure the pinned commit contains all
   screenshots. Save it as `plugin-catalog/hermes-honcho-plugin.yaml` in an
   isolated Hermes contribution checkout.
5. Run upstream `scripts/validate_plugin_catalog.py` against the completed entry
   using the checkout's documented Python environment, then validate the plugin
   from a fresh checkout of the pin. Verify every image URL resolves publicly.
6. Submit a PR to `NousResearch/hermes-agent`. Maintainer review and a human
   merge are required. Future releases require a new reviewed SHA-bump PR.

The minimum Hermes numeric version is deliberately not guessed. README names
the required SDK features and the verification record identifies the exact
upstream revisions checked. The platform list describes intended SDK support,
not three separate live OS test results.

## Scanner note

At this audit, the install scanner's only caution was `agent_config_mod` in the
historical implementation plan at `.hermes/plans/…`, which lists `CLAUDE.md` as a
documentation edit. It is not executable plugin behavior. It is disclosed for
review rather than hidden with an allowlist. The runtime desktop-surface check
passes. Recheck warnings at the final pinned commit.

## Suggested PR description

Honcho memory inspection and explicit source ingestion for Hermes Desktop.
The page and contextual pane follow focused-session ownership, use the shared
SDK query cache and send all backend traffic through `ctx.rest()`. SSH aliases
are resolved by `host.profileRoutes()`, with matching remote-profile provenance
and fail-closed focus checks. The companion uses each target profile's existing
Honcho configuration. Screenshots contain synthetic data only.

Attach the final test results, tested host revision, Windows SSH result and
reviewed scanner caution. Link the exact pinned release, not a moving branch.
