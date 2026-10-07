# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People actively working in a Hermes Desktop conversation who want to inspect, question, and improve the memory associated with that conversation without switching tools.

## Product Purpose

Make Honcho memory understandable and actionable inside Hermes. Success is finding a relevant memory, understanding its provenance and scope, and deliberately adding a corrective fact when needed. Connectivity alone is not memory quality.

## Positioning

A focused-conversation memory workbench, not a smaller operator dashboard. Hermes owns the connection, profile, credentials, and conversation identity. The plugin follows that ownership rather than maintaining another connection configuration.

## Operating Context

Local and remote Hermes profiles may use different Honcho SDK versions. Per-repository mapping can put several Hermes chats in one Honcho session. Always distinguish that shared memory boundary from the current chat and from a particular model turn.

## Capabilities and Constraints

- Preserve plain ESM, native Hermes SDK components, authenticated ctx.rest transport, shared query cache, and profile isolation.
- Keep stored messages, scoped search, context previews, queue diagnostics, and explicitly confirmed document ingestion.
- The approved overhaul prioritizes a memory-first landing view, semantic conclusion search, bounded provenance inspection, explicit memory questions, and confirmed additive correction.
- Optional functionality must be gated by the selected backend's verified capabilities. Unsupported is not empty or zero.
- Context preview is a fresh assembly, not recorded prompt injection. Exact per-turn recall telemetry is out of scope until the host exposes a verified contract.
- The separate dashboard remains the home for fleet administration, server logs, database metrics, queue repair, and collector traces. It is not a runtime dependency.
- No automatic reasoning calls or mutation retries. No deletion as an ordinary correction workflow.

## Brand Commitments

Use Hermes's existing native controls, typography, theme, and focus behavior. Keep language plain and specific. Preserve the ownership lineage strip.

## Evidence on Hand

The repository includes offline SDK and profile-isolation tests plus a synthetic-data renderer using the real Hermes controls and shipped CSS. These do not establish activation in a running local or remote backend. Repository screenshots must use synthetic data only.

## Product Principles

1. Memory content precedes status and aggregate counts.
2. Show scope and provenance before encouraging interpretation.
3. Corrections add explicit facts, never pretend to rewrite inferred history instantly.
4. A displayed result must say whether it is a stored record, a new preview, or a new reasoning answer.
5. Preserve safe workflows across older runtimes without inventing feature parity.
