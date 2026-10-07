# Memory-first workbench

> 0.4.0 keeps this direction and simplifies the structure to five sections
> (Memory, Ask, Messages, Context, Status). Conclusion search and provenance
> moved into Memory, message search into Messages, and diagnostics into Status.
> See `.interface-design/system.md` for the current layout rules.

The user approved this direction after reviewing the plugin's status-first limitations. This is a functional overhaul inside the established Hermes visual system, not a new visual identity.

## Surface

- Target: `desktop/plugin.js`, `/honcho` and the Honcho Memory docked pane.
- Mode: Operate.
- Task: inspect relevant memory, search it, examine provenance, ask a scoped question, and deliberately add a corrective fact.
- Keep existing messages, document ingestion, scope search, and diagnostics reachable.

## Direction contract

**THESIS:** Memory before machinery. Replace the landing page's counts and configuration readout with readable stored conclusions and session context. The product refuses a KPI-card dashboard.

**OWN-WORLD:** Inherit Hermes sans-serif prose, theme surfaces, quiet hairlines, native controls and semantic status tones. Monospace identifies records, never decorates whole paragraphs. No independent palette or frontend build step.

**STORY:** Confirm the focused connection/profile/session, read what has been learned, inspect a questionable belief, then ask or correct with clear scope. Errors stay beside the affected data.

**FIRST VIEWPORT:** A compact ownership strip anchors task tabs. Recent session conclusions occupy the primary reading region. The session summary and peer card form supporting context. Search, ask and correction actions sit beside memory, while routine configuration and queue totals live in Diagnostics. Narrow panes stack content without shrinking controls.

**FORM:** User-approved memory-first workbench within the existing native Hermes world. Selection was explicitly delegated after the concrete recommendation. No palette or identity replacement, concept tournament, or generated imagery.

**FINISH:** Verify backend contracts, focus-safe interactions, unsupported and failure states, and actual rendering with shipped Hermes controls/CSS. Review desktop and narrow light/dark captures. Report offline fixture verification separately from installed/runtime activation.

## Boundaries

- A Honcho session can include several Hermes chats. Never label all its records as learned in this chat.
- A context preview is not evidence of what reached a past model turn.
- Reasoning evidence means accessed records, not guaranteed citations.
- A corrective fact is additive and may take time to affect derived representations.
- No live memory writes, dependency upgrades, backend restarts, commits or publication are part of implementation verification.

## Finish review

Disposition: ship the implementation for review, not an activated release.
Review performed inline by the main assistant, without subagents. This extends
the existing Hermes world, so there is no replacement comp or concept roll.

### Persistence

`PRODUCT.md`, this direction, and `.interface-design/system.md` retain the
product and native visual constraints. No unrelated design-system migration was
performed. The latter's older overview terminology was not silently rewritten.

### Fidelity

| Element | Result |
| --- | --- |
| Type | Match: inherited Hermes prose and controls, monospace for attribution |
| Material | Match: flat regions, quiet hairlines, native confirmation dialog |
| Ground | Match: actual shipped Nous light/dark theme, no replacement palette |
| First viewport | Match: stored conclusions precede operational diagnostics |
| Ownership | Match: visible connection/profile/session/peer and full write target |
| Narrow layout | Adaptation: native Select replaces the tab rail, content stacks |
| Truth | Match: synthetic banner, preview/synthesis labels, additive correction copy |

### Ceiling

The native workbench needs no decorative imagery or animation. Wide and narrow
light/dark captures were reviewed, along with question evidence, provenance,
and confirmation. Controls remain readable without becoming a separate visual
product inside Hermes.

### Material fixes

No unresolved visual blocker in the reviewed captures. Page/pane duplicate IDs
found during integration review were corrected and regression-tested.
Automated accessibility is not a screen-reader pass. Runtime activation and
live Windows/SSH remain separate deployment checks.

### Keep

Keep memory before machinery, explicit ownership, bounded provenance, and
confirmation that never represents an uncertain write as safely unsaved.
