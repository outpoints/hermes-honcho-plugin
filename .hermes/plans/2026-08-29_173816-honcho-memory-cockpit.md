# Honcho Memory Cockpit Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the status-only Hermes Honcho plugin with a read-only, focused-chat memory cockpit that safely exposes messages, conclusions, context, scoped search, and reasoning activity.

**Architecture:** Keep the desktop UI as one uncompiled ESM file using only the installed Hermes Desktop SDK, React, and the JSX runtime. Extend the profile-scoped FastAPI adapter with bounded request models and synchronous collectors executed in timeout-bounded worker threads. Verify the configured workspace through the installed SDK's non-creating workspace list endpoint before allowing any SDK method that performs the workspace get-or-create preflight.

**Tech Stack:** Hermes Desktop Plugin SDK, React Query, FastAPI, Pydantic, installed `honcho-ai` 2.2.0, Node test runner, Python unittest.

---

### Task 1: Establish read-only client and focus safety

**Files:**
- Modify: `tests/test_plugin_api.py`
- Modify: `dashboard/plugin_api.py`

1. Add failing tests proving workspace existence is checked without get-or-create, unknown workspaces fail closed, profile/connection mismatch skips client calls, and malformed request fields are rejected.
2. Run the focused Python tests and confirm RED.
3. Add strict shared focus request models, workspace verification, and current-session resolution helpers.
4. Run the focused tests and confirm GREEN.

### Task 2: Add paginated current-session messages

**Files:**
- Modify: `tests/test_plugin_api.py`
- Modify: `dashboard/plugin_api.py`

1. Add failing tests for page/size bounds, empty sessions, malformed SDK pages, safe metadata, and unavailable capabilities.
2. Implement `/messages` with capped serialization and current-session provenance.
3. Verify focused and full Python tests.

### Task 3: Add conclusions and provenance

**Files:**
- Modify: `tests/test_plugin_api.py`
- Modify: `dashboard/plugin_api.py`

1. Add failing tests for current/all modes, exact AI observer and user target resolution, unknown peers, missing conclusions, level/session provenance, and unsupported SDK signatures.
2. Implement `/conclusions` as a read-only scoped list.
3. Verify focused and full Python tests.

### Task 4: Add context and representation inspection

**Files:**
- Modify: `tests/test_plugin_api.py`
- Modify: `dashboard/plugin_api.py`

1. Add failing tests for token bounds, Session.context/Peer.context/representation capability gates, layer partial failure, safe truncation, and no context logging.
2. Implement `/context` with independent session, peer, and representation reads plus layer estimates and scope explanations.
3. Verify focused and full Python tests.

### Task 5: Add scoped native search

**Files:**
- Modify: `tests/test_plugin_api.py`
- Modify: `dashboard/plugin_api.py`

1. Add failing tests for current-session, configured-user-peer, and workspace scopes; limits; ordering preservation; unknown peer; and network errors.
2. Implement user-triggered `/search` using installed SDK search APIs.
3. Verify focused and full Python tests.

### Task 6: Add detailed read-only activity

**Files:**
- Modify: `tests/test_plugin_api.py`
- Modify: `dashboard/plugin_api.py`

1. Add failing tests for partial workspace/session queue results, malformed queue payloads, and explicit unsupported failed-task detail.
2. Implement `/activity` with aggregate counters, stale timestamp, capabilities, and no write controls.
3. Verify focused and full Python tests.

### Task 7: Build the contextual pane and tabbed page

**Files:**
- Modify: `tests/plugin_contract.test.mjs`
- Modify: `desktop/plugin.js`

1. Add failing contract tests for `PANES_AREA`, right-edge default collapse, exact runtime import scanner, supported imports, fail-closed mismatch behavior, shared focus keys, stale-result guards, section labels, and polling limits.
2. Implement the right pane and OVERVIEW/MESSAGES/CONCLUSIONS/CONTEXT/SEARCH/ACTIVITY page with native components, progressive disclosure, localized UTC timestamps, visible focus states, and no previous-chat placeholder data.
3. Run Node checks/tests and confirm GREEN.

### Task 8: Document contracts and Phase 2

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `CLAUDE.md`

Document surfaces, endpoint models, installed SDK compatibility decisions, read-only workspace guard, polling/query behavior, failure states, and the write-mode Phase 2 backlog.

### Task 9: Full validation and live verification

1. Run `./scripts/check.sh` and `hermes plugins doctor --ci .`.
2. Verify the standalone desktop symlink and unified backend companion links/enabled state.
3. Trigger desktop hot reload and inspect GUI/error logs.
4. Call backend endpoints against the mapped `hermes-honcho-desktop-plugin` session, switch focus where safely automatable, and verify identifiers prevent stale cross-chat rendering.
5. Compare configured Honcho workspace/session/message/conclusion state before and after validation to prove no records were created or deleted.
6. Do not commit or push.
