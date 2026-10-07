from __future__ import annotations

import asyncio
import datetime as dt
import importlib.util
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "dashboard" / "plugin_api.py"
SPEC = importlib.util.spec_from_file_location("hermes_honcho_plugin_api_test", MODULE_PATH)
assert SPEC and SPEC.loader
plugin_api = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = plugin_api
SPEC.loader.exec_module(plugin_api)


class FakePage:
    def __init__(self, items=None, total=0, page=1, size=50, pages=1):
        self.items = list(items or [])
        self.total = total
        self.page = page
        self.size = size
        self.pages = pages


class FakeQueue:
    total_work_units = 7
    completed_work_units = 5
    in_progress_work_units = 1
    pending_work_units = 1


class FakeConclusions:
    def __init__(self, observer_id="hermes", observed_id="human"):
        self.observer_id = observer_id
        self.observed_id = observed_id
        self.calls = []

    def list(self, page=1, size=50, session=None, filters=None, reverse=False):
        self.calls.append(
            {
                "page": page,
                "size": size,
                "session": session,
                "filters": filters,
                "reverse": reverse,
            }
        )
        item = SimpleNamespace(
            id="conclusion-1",
            content="The fixture user prefers concise output.",
            observer_id=self.observer_id,
            observed_id=self.observed_id,
            session_id="hermes-honcho-plugin",
            level="explicit",
            created_at=dt.datetime(2026, 8, 29, 12, 5, tzinfo=dt.timezone.utc),
        )
        return FakePage([item], total=14, page=page, size=size, pages=2)


class FakePeer:
    def __init__(self, peer_id):
        self.id = peer_id
        self.conclusion_scope = FakeConclusions(observer_id=peer_id)
        self.context_calls = []
        self.representation_calls = []

    def conclusions_of(self, target):
        if target != "human":
            raise AssertionError("unexpected conclusion target")
        return self.conclusion_scope

    def context(self, target=None):
        self.context_calls.append(target)
        return "Peer-wide fixture context."

    def representation(self, session=None, target=None, max_conclusions=None) -> str:
        self.representation_calls.append(
            {"session": session, "target": target, "max_conclusions": max_conclusions}
        )
        return "Current-session fixture representation."

    def card(self):
        return ["The fixture user prefers concise output."]

    def search(self, query, limit=10):
        self.search_call = {"query": query, "limit": limit}
        message = SimpleNamespace(
            id="peer-search-message",
            content="Peer-scoped search result.",
            created_at=dt.datetime(2026, 8, 29, 12, 1, tzinfo=dt.timezone.utc),
            peer_id=self.id,
            session_id="hermes-honcho-plugin",
            workspace_id="agents",
            token_count=5,
            metadata={},
        )
        return [message]


class FakeSession:
    id = "hermes-honcho-plugin"

    def messages(self, page=1, size=50, reverse=False):
        message = SimpleNamespace(
            id="message-1",
            content="Saved memory content",
            created_at=dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc),
            peer_id="hermes",
            session_id=self.id,
            workspace_id="agents",
            token_count=17,
            metadata={
                "safe": "visible",
                "api_key": "metadata-secret",
                "nested": {"authorization": "Bearer metadata-token"},
            },
        )
        return FakePage([message], total=42, page=page, size=size, pages=5)

    def peers(self):
        return [FakePeer("human"), FakePeer("hermes")]

    def queue_status(self):
        return FakeQueue()

    def context(
        self,
        summary=False,
        tokens=None,
        peer_target=None,
        peer_perspective=None,
    ):
        self.context_kwargs = {
            "summary": summary,
            "tokens": tokens,
            "peer_target": peer_target,
            "peer_perspective": peer_perspective,
        }
        message = SimpleNamespace(
            id="message-1",
            content="A bounded context message.",
            peer_id="human",
            session_id=self.id,
            created_at=dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc),
            token_count=6,
            metadata={},
        )
        return SimpleNamespace(
            summary="Current Honcho session summary.",
            representation="Current Honcho representation.",
            messages=[message],
            token_count=23,
        )

    def search(self, query, limit=10):
        self.search_call = {"query": query, "limit": limit}
        page = self.messages(page=1, size=limit, reverse=True)
        return page.items


class FakeConfig:
    api_key = "test-secret-never-returned"
    base_url = "https://user:password@honcho.test/v3?token=secret"
    environment = "production"
    enabled = True
    host = "hermes"
    workspace_id = "agents"
    session_strategy = "per-directory"
    recall_mode = "hybrid"
    save_messages = True
    write_frequency = "async"
    peer_name = "human"
    ai_peer = "hermes"
    sessions = {}

    def resolve_session_name(self, **kwargs):
        self.resolve_args = kwargs
        return Path(kwargs["cwd"]).name


class FakeClient:
    def __init__(self, session=None, fail_peers=False, workspace_exists=True):
        self.session = session or FakeSession()
        self.fail_peers = fail_peers
        self.workspace_exists = workspace_exists
        self.events = []
        self._workspace_ensured = False

    def workspaces(self, filters=None, page=1, size=50):
        self.events.append(("workspaces", filters, page, size))
        items = ["agents"] if self.workspace_exists else []
        return FakePage(items=items, total=len(items))

    def sessions(self, filters=None, page=1, size=50):
        self.events.append(("sessions", filters, page, size))
        if filters:
            return FakePage([self.session], total=1)
        return FakePage(total=9)

    def peers(self, filters=None, page=1, size=50):
        self.events.append(("peers", filters, page, size))
        if self.fail_peers:
            raise RuntimeError("Bearer top-secret token=also-secret")
        return FakePage(total=3)

    def queue_status(self):
        self.events.append(("queue",))
        return FakeQueue()

    def search(self, query, limit=10):
        self.events.append(("search", query, limit))
        return self.session.search(query=query, limit=limit)


def collect(config, client, request=None):
    request = request or plugin_api.SnapshotRequest(
        profile="default",
        connection_id="local",
        runtime_session_id="runtime-123",
        stored_session_id="stored-123",
        cwd="/work/hermes-honcho-plugin",
    )
    return plugin_api._collect_snapshot(
        request,
        config_factory=lambda: config,
        client_factory=lambda supplied: client,
        session_metadata_loader=lambda _: {},
    )


class SnapshotTests(unittest.TestCase):
    def test_verifies_workspace_without_get_or_create_before_scoped_reads(self):
        client = FakeClient()

        result = collect(FakeConfig(), client)

        self.assertTrue(result["ok"])
        self.assertEqual(client.events[0], ("workspaces", {"id": "agents"}, 1, 1))
        self.assertTrue(client._workspace_ensured)

    def test_profile_mismatch_skips_honcho_client_creation(self):
        config = FakeConfig()
        called = False

        def client_factory(_):
            nonlocal called
            called = True
            return FakeClient()

        result = plugin_api._collect_snapshot(
            plugin_api.SnapshotRequest(
                profile="default",
                focused_profile="research",
                connection_id="local",
                focused_connection_id="remote-a",
                stored_session_id="stored-123",
                cwd="/work/private",
            ),
            config_factory=lambda: config,
            client_factory=client_factory,
            session_metadata_loader=lambda _: {},
        )

        self.assertFalse(called)
        self.assertEqual(result["state"], "route_mismatch")
        self.assertIsNone(result["chat"]["honcho_session_id"])

    def test_unknown_workspace_is_not_created(self):
        client = FakeClient(workspace_exists=False)

        result = collect(FakeConfig(), client)

        self.assertFalse(result["ok"])
        self.assertEqual(result["state"], "workspace_missing")
        self.assertEqual([event[0] for event in client.events], ["workspaces"])
        self.assertFalse(client._workspace_ensured)

    def test_connected_snapshot_uses_hermes_session_resolver(self):
        config = FakeConfig()
        result = collect(config, FakeClient())

        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "connected")
        self.assertEqual(result["totals"]["sessions"], 9)
        self.assertEqual(result["totals"]["peers"], 3)
        self.assertEqual(result["totals"]["conclusions"], 14)
        self.assertEqual(result["chat"]["honcho_session_id"], "hermes-honcho-plugin")
        self.assertEqual(result["chat"]["messages"], 42)
        self.assertEqual(result["chat"]["peers"], ["hermes", "human"])
        self.assertEqual(result["chat"]["latest_peer_id"], "hermes")
        self.assertEqual(config.resolve_args["session_id"], "stored-123")
        self.assertEqual(config.resolve_args["cwd"], "/work/hermes-honcho-plugin")

    def test_response_never_returns_endpoint_credentials(self):
        result = collect(FakeConfig(), FakeClient())

        self.assertEqual(result["config"]["endpoint"], "https://honcho.test/v3")
        rendered = repr(result)
        self.assertNotIn("password", rendered)
        self.assertNotIn("test-secret-never-returned", rendered)

    def test_individual_metric_failure_preserves_other_results(self):
        result = collect(FakeConfig(), FakeClient(fail_peers=True))

        self.assertTrue(result["ok"])
        self.assertIsNone(result["totals"]["peers"])
        self.assertEqual(result["totals"]["sessions"], 9)
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(result["errors"][0]["scope"], "peers")
        self.assertNotIn("top-secret", result["errors"][0]["message"])
        self.assertNotIn("also-secret", result["errors"][0]["message"])

    def test_missing_current_session_is_not_an_error(self):
        class MissingClient(FakeClient):
            def sessions(self, filters=None, page=1, size=50):
                if filters:
                    return FakePage(total=0)
                return FakePage(total=9)

        result = collect(FakeConfig(), MissingClient())

        self.assertTrue(result["ok"])
        self.assertFalse(result["chat"]["found"])
        self.assertIsNone(result["chat"]["messages"])

    def test_unconfigured_profile_skips_client_creation(self):
        config = FakeConfig()
        config.api_key = None
        config.base_url = None
        called = False

        def client_factory(_):
            nonlocal called
            called = True
            return FakeClient()

        result = plugin_api._collect_snapshot(
            plugin_api.SnapshotRequest(profile="work"),
            config_factory=lambda: config,
            client_factory=client_factory,
            session_metadata_loader=lambda _: {},
        )

        self.assertFalse(called)
        self.assertEqual(result["state"], "not_configured")
        self.assertFalse(result["ok"])

    def test_per_session_mapping_source_uses_durable_session(self):
        config = FakeConfig()
        config.session_strategy = "per-session"
        config.resolve_session_name = lambda **kwargs: kwargs["session_id"]
        result = collect(config, FakeClient())

        self.assertEqual(result["chat"]["mapping_source"], "Hermes session")
        self.assertEqual(result["chat"]["honcho_session_id"], "stored-123")

    def test_persisted_manual_title_matches_provider_resolution(self):
        config = FakeConfig()
        config.resolve_session_name = lambda **kwargs: kwargs["session_title"]
        request = plugin_api.SnapshotRequest(
            stored_session_id="stored-123",
            cwd="/wrong/active-tile",
        )
        result = plugin_api._collect_snapshot(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: FakeClient(),
            session_metadata_loader=lambda _: {
                "cwd": "/focused/project",
                "title": "My memory session",
                "title_source": "user",
            },
        )

        self.assertEqual(result["chat"]["honcho_session_id"], "My memory session")
        self.assertEqual(result["chat"]["mapping_source"], "explicit title")
        self.assertEqual(result["chat"]["cwd"], "/focused/project")


class ActivityTests(unittest.TestCase):
    def test_activity_reports_available_queue_metrics_and_capability_gaps(self):
        config = FakeConfig()
        client = FakeClient()
        request = plugin_api.ActivityRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
        )

        result = plugin_api._collect_activity(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["workspace_queue"]["total"], 7)
        self.assertEqual(result["session_queue"]["pending"], 1)
        self.assertIsNone(result["failed"])
        self.assertFalse(result["capabilities"]["failed_task_detail"])
        self.assertEqual(result["recent_tasks"], [])
        self.assertTrue(result["stale_at"].endswith("Z"))


class SearchTests(unittest.TestCase):
    def test_scope_lookup_uses_noncreating_sdk_method_or_paginated_legacy_list(self):
        class ScopeClient(FakeClient):
            def scopes(self, page=1, size=50):
                self.events.append(("scopes", page))
                return FakePage(
                    [SimpleNamespace(id="other" if page == 1 else "engineering")],
                    page=page, pages=2, total=101,
                )

            def scope(self, scope_id):
                raise AssertionError("must never get-or-create a scope")

            def search(self, query, limit=10, scope=None):
                self.events.append(("scope-search", scope))
                return []

        class ModernClient(ScopeClient):
            def get_scope(self, id):
                self.events.append(("get_scope", id))
                return SimpleNamespace(id=id)

        for client in (ScopeClient(), ModernClient()):
            with self.subTest(client=type(client).__name__):
                result = plugin_api._collect_search(
                    plugin_api.SearchRequest(
                        cwd="/work/hermes-honcho-plugin", scope="honcho",
                        scope_id="engineering", query="memory",
                    ),
                    config_factory=FakeConfig,
                    client_factory=lambda _: client,
                    session_metadata_loader=lambda _: {},
                )
                self.assertTrue(result["ok"], result["errors"])
                self.assertIn(("scope-search", "engineering"), client.events)
                if isinstance(client, ModernClient):
                    self.assertIn(("get_scope", "engineering"), client.events)
                    self.assertFalse(any(event[0] == "scopes" for event in client.events))
                else:
                    self.assertIn(("scopes", 2), client.events)

    def test_searches_an_existing_honcho_scope_without_get_or_create(self):
        class ScopedClient(FakeClient):
            def scopes(self, page=1, size=50):
                return FakePage([SimpleNamespace(id="engineering")], total=1)

            def scope(self, scope_id):
                raise AssertionError(f"scope get-or-create must not run: {scope_id}")

            def search(self, query, limit=10, scope=None):
                self.scope_search_call = {
                    "query": query,
                    "limit": limit,
                    "scope": scope,
                }
                message = SimpleNamespace(
                    id="scope-search-message",
                    content="Scope-qualified memory.",
                    created_at=dt.datetime(2026, 8, 30, 12, 1, tzinfo=dt.timezone.utc),
                    peer_id="human",
                    session_id="hermes-honcho-plugin",
                    workspace_id="agents",
                    token_count=5,
                    metadata={},
                )
                return [message]

        config = FakeConfig()
        client = ScopedClient()
        request = plugin_api.SearchRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            scope="honcho",
            scope_id="engineering",
            query="deployment memory",
            limit=7,
        )

        result = plugin_api._collect_search(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["scope_id"], "engineering")
        self.assertEqual(
            client.scope_search_call,
            {"query": "deployment memory", "limit": 7, "scope": "engineering"},
        )
        self.assertEqual(result["items"][0]["content"], "Scope-qualified memory.")

    def test_lists_existing_honcho_scopes_without_get_or_create(self):
        class ScopedClient(FakeClient):
            def scopes(self, page=1, size=50):
                self.scope_call = {"page": page, "size": size}
                return FakePage(
                    [
                        SimpleNamespace(
                            id="engineering",
                            workspace_id="agents",
                            created_at=dt.datetime(2026, 8, 30, 12, 0, tzinfo=dt.timezone.utc),
                            metadata={"safe": "visible", "api_key": "redact-me"},
                        )
                    ],
                    total=1,
                    page=page,
                    size=size,
                    pages=1,
                )

        config = FakeConfig()
        client = ScopedClient()
        request = plugin_api.ScopesRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            page=1,
            size=25,
        )

        result = plugin_api._collect_scopes(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(client.scope_call, {"page": 1, "size": 25})
        self.assertEqual(result["items"][0]["id"], "engineering")
        self.assertNotEqual(result["items"][0]["metadata"]["api_key"], "redact-me")

    def test_current_session_search_preserves_honcho_order(self):
        config = FakeConfig()
        session = FakeSession()
        client = FakeClient(session=session)
        request = plugin_api.SearchRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            scope="session",
            query="operational memory",
            limit=7,
        )

        result = plugin_api._collect_search(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["scope"], "session")
        self.assertEqual(result["items"][0]["rank"], 1)
        self.assertEqual(result["items"][0]["content"], "Saved memory content")
        self.assertEqual(session.search_call, {"query": "operational memory", "limit": 7})


class ContextTests(unittest.TestCase):
    def test_sdk_context_models_are_unwrapped_without_fabricating_token_totals(self):
        from honcho.api_types import PeerContextResponse
        from honcho.session_context import SessionContext, Summary

        class ModelPeer(FakePeer):
            def context(self, target=None):
                return PeerContextResponse(
                    peer_id=self.id, target_id=target,
                    representation="Workspace representation.", peer_card=None
                )

            def card(self):
                return None

        class ModelSession(FakeSession):
            def peers(self):
                return [ModelPeer("human"), ModelPeer("hermes")]

            def context(self, summary=True, tokens=None, peer_target=None, peer_perspective=None):
                return SessionContext(
                    session_id=self.id,
                    messages=[],
                    summary=Summary(
                        content="A real summary shape.", message_id="fixture-message",
                        summary_type="short", created_at="2026-01-01T00:00:00Z",
                        token_count=5,
                    ),
                    peer_representation="Session representation.",
                    peer_card=None,
                )

        result = plugin_api._collect_context(
            plugin_api.ContextRequest(cwd="/work/hermes-honcho-plugin"),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=ModelSession()),
            session_metadata_loader=lambda _: {},
        )
        self.assertEqual(result["session"]["summary"], "A real summary shape.")
        self.assertEqual(result["session"]["representation"], "Session representation.")
        self.assertEqual(result["peer_context"], "Workspace representation.")
        self.assertIsNone(result["session"]["token_count"])
        self.assertEqual(result["peer_card"], [])
        self.assertEqual(result["state"], "connected")

    def test_newer_sdk_uses_native_current_session_scope(self):
        class ScopedSession(FakeSession):
            def context(
                self,
                summary=False,
                tokens=None,
                peer_target=None,
                peer_perspective=None,
                limit_to_session=False,
            ):
                response = super().context(
                    summary=summary,
                    tokens=tokens,
                    peer_target=peer_target,
                    peer_perspective=peer_perspective,
                )
                self.context_kwargs["limit_to_session"] = limit_to_session
                return response

        config = FakeConfig()
        session = ScopedSession()
        client = FakeClient(session=session)
        request = plugin_api.ContextRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            target_peer="human",
            token_budget=2048,
        )

        result = plugin_api._collect_context(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertTrue(session.context_kwargs["limit_to_session"])
        self.assertTrue(result["capabilities"]["native_session_scope"])
        self.assertIn("native session boundary", result["scope_explanation"])

    def test_context_uses_installed_session_peer_and_representation_apis(self):
        config = FakeConfig()
        session = FakeSession()
        client = FakeClient(session=session)
        request = plugin_api.ContextRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            target_peer="human",
            token_budget=2048,
        )

        result = plugin_api._collect_context(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["target_peer_id"], "human")
        self.assertEqual(result["observer_peer_id"], "hermes")
        self.assertEqual(result["token_budget"], 2048)
        self.assertEqual(result["session"]["token_count"], 23)
        self.assertEqual(result["session"]["summary"], "Current Honcho session summary.")
        self.assertEqual(result["peer_context"], "Peer-wide fixture context.")
        self.assertEqual(
            result["session_representation"],
            "Current-session fixture representation.",
        )
        self.assertEqual(
            result["peer_card"], ["The fixture user prefers concise output."]
        )
        self.assertGreater(result["character_count"], 0)
        self.assertGreater(result["token_estimate"], 0)
        self.assertEqual(session.context_kwargs["tokens"], 2048)
        self.assertEqual(session.context_kwargs["peer_target"], "human")
        self.assertEqual(session.context_kwargs["peer_perspective"], "hermes")

    def test_copy_text_falls_back_to_available_peer_context(self):
        class NoSessionRepresentationPeer(FakePeer):
            def representation(self, session=None, target=None, max_conclusions=None) -> str:
                self.representation_calls.append(
                    {
                        "session": session,
                        "target": target,
                        "max_conclusions": max_conclusions,
                    }
                )
                return ""

        class EmptySessionContext(FakeSession):
            def peers(self):
                return [
                    NoSessionRepresentationPeer("hermes"),
                    FakePeer("human"),
                ]

            def context(
                self,
                summary=False,
                tokens=None,
                peer_target=None,
                peer_perspective=None,
            ):
                return SimpleNamespace(
                    messages=[],
                    summary=None,
                    representation=None,
                    token_count=0,
                )

        result = plugin_api._collect_context(
            plugin_api.ContextRequest(
                profile="default",
                focused_profile="default",
                stored_session_id="stored-123",
                cwd="/work/hermes-honcho-plugin",
                token_budget=2048,
            ),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=EmptySessionContext()),
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["preview"], "Peer-wide fixture context.")
        self.assertIn("Peer-wide fixture context.", result["copy_text"])
        self.assertGreater(result["character_count"], 0)


class ConclusionTests(unittest.TestCase):
    def test_attribution_preserves_parent_conclusions_and_legacy_unknowns(self):
        item = FakeConclusions().list().items[0]
        legacy = plugin_api._conclusion_payload(item, "hermes-honcho-plugin")
        self.assertIsNone(legacy.get("source_ids"))
        self.assertIsNone(legacy.get("times_derived"))
        item.source_ids = ["premise-a", "premise-b"]
        item.times_derived = 7
        modern = plugin_api._conclusion_payload(item, "hermes-honcho-plugin")
        self.assertEqual(modern.get("source_ids"), ["premise-a", "premise-b"])
        self.assertEqual(modern.get("times_derived"), 7)

    def test_current_session_conclusions_include_provenance(self):
        config = FakeConfig()
        client = FakeClient()
        request = plugin_api.ConclusionsRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            scope="current",
            page=1,
            size=10,
        )

        result = plugin_api._collect_conclusions(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["observer_id"], "hermes")
        self.assertEqual(result["observed_id"], "human")
        self.assertEqual(result["scope"], "current")
        self.assertEqual(result["items"][0]["level"], "explicit")
        self.assertEqual(result["items"][0]["source_session_id"], "hermes-honcho-plugin")
        self.assertTrue(result["items"][0]["belongs_to_current_session"])
        self.assertEqual(result["total"], 14)

    def test_conclusions_keep_honchos_newest_first_order(self):
        # Honcho lists conclusions newest first; reverse=True means oldest
        # first. Messages are the opposite, so this must not be "fixed" to match.
        peers = [FakePeer("human"), FakePeer("hermes")]
        session = FakeSession()
        session.peers = lambda: peers
        request = plugin_api.ConclusionsRequest(
            profile="default", focused_profile="default", stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin", scope="all", page=1, size=10,
        )
        result = plugin_api._collect_conclusions(
            request,
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=session),
            session_metadata_loader=lambda _: {},
        )
        self.assertTrue(result["ok"])
        self.assertIs(peers[1].conclusion_scope.calls[-1]["reverse"], False)


class MessageTests(unittest.TestCase):
    def test_messages_are_bounded_paginated_and_metadata_is_redacted(self):
        config = FakeConfig()
        client = FakeClient()
        request = plugin_api.MessagesRequest(
            profile="default",
            focused_profile="default",
            connection_id="local",
            focused_connection_id="local",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            page=2,
            size=10,
        )

        result = plugin_api._collect_messages(
            request,
            config_factory=lambda: config,
            client_factory=lambda _: client,
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["session_id"], "hermes-honcho-plugin")
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["size"], 10)
        self.assertEqual(result["total"], 42)
        self.assertEqual(result["pages"], 5)
        self.assertEqual(result["items"][0]["peer_id"], "hermes")
        self.assertEqual(result["items"][0]["token_count"], 17)
        self.assertEqual(result["items"][0]["metadata"]["safe"], "visible")
        rendered = repr(result["items"][0]["metadata"])
        self.assertNotIn("metadata-secret", rendered)
        self.assertNotIn("metadata-token", rendered)


class UploadTicketTests(unittest.TestCase):
    def test_ticket_binds_existing_session_and_configured_user_peer(self):
        class UploadCapableSession(FakeSession):
            def upload_file(self, file, peer, metadata=None):
                raise AssertionError("ticket preparation must not upload")

            def get_message(self, message_id):
                raise AssertionError("ticket preparation must not read a message")

        stored = []
        request = plugin_api.UploadTicketRequest(
            profile="default",
            focused_profile="default",
            connection_id="local",
            focused_connection_id="local",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            filename="notes.md",
            content_type="text/markdown",
            size=24,
            source_kind="text",
        )

        result = plugin_api._collect_upload_ticket(
            request,
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=UploadCapableSession()),
            session_metadata_loader=lambda _: {},
            ticket_store=lambda payload: (stored.append(payload), "ticket-123")[1],
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["ticket"], "ticket-123")
        self.assertEqual(result["target"]["session_id"], "hermes-honcho-plugin")
        self.assertEqual(result["target"]["peer_id"], "human")
        self.assertEqual(result["file"]["filename"], "notes.md")
        self.assertEqual(result["file"]["content_type"], "text/markdown")
        self.assertEqual(result["file"]["size"], 24)
        self.assertEqual(result["capabilities"]["honcho_default_max_file_size"], 5_242_880)
        self.assertIsNone(result["capabilities"]["server_max_file_size"])
        self.assertEqual(stored[0]["session_id"], "hermes-honcho-plugin")
        self.assertEqual(stored[0]["peer_id"], "human")

    def test_ticket_rejects_unsupported_content_before_storage(self):
        class UploadCapableSession(FakeSession):
            def upload_file(self, *args, **kwargs):
                return []

            def get_message(self, *args, **kwargs):
                return None

        stored = []
        request = plugin_api.UploadTicketRequest(
            profile="default",
            focused_profile="default",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            filename="photo.jpg",
            content_type="image/jpeg",
            size=10_000_000,
            source_kind="file",
        )

        result = plugin_api._collect_upload_ticket(
            request,
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=UploadCapableSession()),
            session_metadata_loader=lambda _: {},
            ticket_store=lambda payload: (stored.append(payload), "must-not-exist")[1],
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["state"], "unsupported_file_type")
        self.assertEqual(stored, [])

    def test_request_has_no_undocumented_plugin_size_cap(self):
        request = plugin_api.UploadTicketRequest(
            filename="large.txt",
            content_type="text/plain",
            size=10_000_001,
            source_kind="file",
        )

        self.assertEqual(request.size, 10_000_001)

    def test_ticket_is_one_time_and_expired_tickets_fail_closed(self):
        payload = {"expires_at": time.time() + 120, "session_id": "session-1"}
        token = plugin_api._store_upload_ticket(payload)

        self.assertEqual(plugin_api._take_upload_ticket(token), payload)
        self.assertIsNone(plugin_api._take_upload_ticket(token))

        expired = plugin_api._store_upload_ticket(
            {"expires_at": time.time() - 1, "session_id": "session-2"}
        )
        self.assertIsNone(plugin_api._take_upload_ticket(expired))


class UploadTests(unittest.TestCase):
    def test_upload_creates_and_reads_back_exact_messages(self):
        class UploadSession(FakeSession):
            def __init__(self):
                self.upload_call = None
                self.readback_ids = []
                self.created = {}

            def upload_file(self, file, peer, metadata=None):
                self.upload_call = {"file": file, "peer": peer, "metadata": metadata}
                filename, content, content_type = file
                message = SimpleNamespace(
                    id="uploaded-message-1",
                    content=content.decode("utf-8"),
                    peer_id=peer,
                    session_id=self.id,
                    workspace_id="agents",
                    created_at=dt.datetime(2026, 8, 30, 12, 0, tzinfo=dt.timezone.utc),
                    token_count=4,
                    metadata={"filename": filename, "content_type": content_type},
                )
                self.created[message.id] = message
                return [message]

            def get_message(self, message_id):
                self.readback_ids.append(message_id)
                return self.created[message_id]

        session = UploadSession()
        request = plugin_api.UploadTicketRequest(
            profile="default",
            focused_profile="default",
            connection_id="local",
            focused_connection_id="local",
            stored_session_id="stored-123",
            cwd="/work/hermes-honcho-plugin",
            filename="notes.txt",
            content_type="text/plain",
            size=12,
            source_kind="text",
        )
        ticket = {
            "request": request.model_dump(),
            "workspace_id": "agents",
            "session_id": "hermes-honcho-plugin",
            "peer_id": "human",
            "filename": "notes.txt",
            "content_type": "text/plain",
            "size": 12,
            "source_kind": "text",
            "expires_at": time.time() + 120,
        }

        result = plugin_api._collect_upload(
            ticket,
            filename="notes.txt",
            content_type="text/plain",
            content=b"hello honcho",
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=session),
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "verified")
        self.assertTrue(result["committed"])
        self.assertEqual(result["created_count"], 1)
        self.assertEqual(result["created"][0]["id"], "uploaded-message-1")
        self.assertEqual(result["created"][0]["session_id"], "hermes-honcho-plugin")
        self.assertEqual(result["created"][0]["peer_id"], "human")
        self.assertEqual(session.readback_ids, ["uploaded-message-1"])
        self.assertEqual(session.upload_call["peer"], "human")
        self.assertEqual(session.upload_call["metadata"]["source"], "hermes-desktop")
        self.assertEqual(session.upload_call["metadata"]["source_kind"], "text")


class FailureAndBoundaryTests(unittest.TestCase):
    def request_kwargs(self):
        return {
            "profile": "default",
            "focused_profile": "default",
            "connection_id": "local",
            "focused_connection_id": "local",
            "stored_session_id": "stored-123",
            "cwd": "/work/hermes-honcho-plugin",
        }

    def test_request_models_reject_out_of_bounds_and_extra_input(self):
        with self.assertRaises(ValueError):
            plugin_api.MessagesRequest(**self.request_kwargs(), size=101)
        with self.assertRaises(ValueError):
            plugin_api.ContextRequest(**self.request_kwargs(), token_budget=32_001)
        with self.assertRaises(ValueError):
            plugin_api.SearchRequest(**self.request_kwargs(), query="   ")
        with self.assertRaises(ValueError):
            plugin_api.ActivityRequest(**self.request_kwargs(), unexpected=True)

    def test_all_read_and_confirmed_upload_routes_are_registered(self):
        paths = {route.path for route in plugin_api.router.routes}
        self.assertEqual(
            paths,
            {
                "/snapshot",
                "/messages",
                "/conclusions",
                "/context",
                "/search",
                "/scopes",
                "/activity",
                "/upload-ticket",
                "/uploads/{ticket}",
                "/capabilities",
                "/conclusion-search",
                "/conclusion-detail",
                "/ask",
                "/correction-ticket",
                "/corrections",
            },
        )

    def test_network_failure_returns_unreachable_without_leaking_error_secrets(self):
        request = plugin_api.MessagesRequest(**self.request_kwargs())

        def fail_client(_):
            raise RuntimeError("Bearer dangerous-token at https://user:pass@host/v3?token=query-secret")

        result = plugin_api._collect_messages(
            request,
            config_factory=FakeConfig,
            client_factory=fail_client,
            session_metadata_loader=lambda _: {},
        )

        self.assertEqual(result["state"], "unreachable")
        rendered = repr(result)
        self.assertNotIn("dangerous-token", rendered)
        self.assertNotIn("query-secret", rendered)
        self.assertNotIn("user:pass", rendered)

    def test_malformed_message_page_is_unavailable(self):
        malformed_session = SimpleNamespace(
            id="hermes-honcho-plugin",
            messages=lambda page=1, size=50, reverse=False: SimpleNamespace(
                items={"not": "a list"}
            ),
        )

        result = plugin_api._collect_messages(
            plugin_api.MessagesRequest(**self.request_kwargs()),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=malformed_session),
            session_metadata_loader=lambda _: {},
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["state"], "unavailable")
        self.assertIn("malformed", result["errors"][0]["message"].lower())

    def test_unknown_context_peer_fails_closed(self):
        class UnknownPeerSession(FakeSession):
            def peers(self):
                return [FakePeer("hermes")]

        result = plugin_api._collect_context(
            plugin_api.ContextRequest(**self.request_kwargs(), target_peer="missing"),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=UnknownPeerSession()),
            session_metadata_loader=lambda _: {},
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["state"], "peer_unavailable")

    def test_context_preserves_session_layer_when_peer_context_fails(self):
        class BrokenObserver(FakePeer):
            def context(self, target=None):
                raise RuntimeError("peer context unavailable")

        observer = BrokenObserver("hermes")
        target = FakePeer("human")

        class PartialSession(FakeSession):
            def peers(self):
                return [target, observer]

        result = plugin_api._collect_context(
            plugin_api.ContextRequest(**self.request_kwargs()),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=PartialSession()),
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "partial")
        self.assertEqual(result["session"]["summary"], "Current Honcho session summary.")
        self.assertIsNone(result["peer_context"])

    def test_unsupported_session_search_is_reported_without_fallback(self):
        base_session = FakeSession()
        unsupported_session = SimpleNamespace(
            id=base_session.id,
            peers=base_session.peers,
        )

        result = plugin_api._collect_search(
            plugin_api.SearchRequest(**self.request_kwargs(), query="memory"),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=unsupported_session),
            session_metadata_loader=lambda _: {},
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["state"], "unavailable")
        self.assertIn("does not support", result["errors"][0]["message"])

    def test_peer_and_workspace_search_use_only_the_selected_scope(self):
        for scope in ("peer", "workspace"):
            with self.subTest(scope=scope):
                client = FakeClient()
                result = plugin_api._collect_search(
                    plugin_api.SearchRequest(
                        **self.request_kwargs(), query="memory", scope=scope, limit=4
                    ),
                    config_factory=FakeConfig,
                    client_factory=lambda _, client=client: client,
                    session_metadata_loader=lambda _: {},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["scope"], scope)
                self.assertEqual(len(result["items"]), 1)
                workspace_searches = [event for event in client.events if event[0] == "search"]
                self.assertEqual(bool(workspace_searches), scope == "workspace")

    def test_empty_conclusions_are_a_successful_empty_state(self):
        observer = FakePeer("hermes")

        class EmptyScope(FakeConclusions):
            def list(self, page=1, size=50, session=None, filters=None, reverse=False):
                return FakePage([], total=0, page=page, size=size, pages=0)

        observer.conclusion_scope = EmptyScope()
        target = FakePeer("human")

        class EmptyConclusionSession(FakeSession):
            def peers(self):
                return [target, observer]

        result = plugin_api._collect_conclusions(
            plugin_api.ConclusionsRequest(**self.request_kwargs()),
            config_factory=FakeConfig,
            client_factory=lambda _: FakeClient(session=EmptyConclusionSession()),
            session_metadata_loader=lambda _: {},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["items"], [])
        self.assertEqual(result["total"], 0)

    def test_timeout_wrapper_returns_bounded_failure(self):
        previous = getattr(plugin_api, "REQUEST_TIMEOUT_SECONDS")
        setattr(plugin_api, "REQUEST_TIMEOUT_SECONDS", 0.01)
        try:
            # This unit test owns timeout formatting only. Real profile scope
            # is covered with isolated homes in test_profile_scope.py.
            with patch.object(plugin_api, "_collect_in_profile", lambda profile, request, collector: collector(request)):
                result = asyncio.run(
                    plugin_api._run_collector(
                        plugin_api.SnapshotRequest(**self.request_kwargs()),
                        lambda _: (time.sleep(0.05), {})[1],
                    )
                )
        finally:
            setattr(plugin_api, "REQUEST_TIMEOUT_SECONDS", previous)

        self.assertFalse(result["ok"])
        self.assertEqual(result["state"], "unreachable")
        self.assertEqual(result["errors"][0]["scope"], "connection")


class SanitizationTests(unittest.TestCase):
    def test_safe_error_redacts_bearer_query_and_userinfo(self):
        error = RuntimeError(
            "Bearer abc.def at https://user:pass@example.test/v3?api_key=secret&token=other"
        )
        message = plugin_api._safe_error(error)

        self.assertIn("Bearer [redacted]", message)
        self.assertIn("https://[redacted]@example.test", message)
        self.assertNotIn("abc.def", message)
        self.assertNotIn("secret", message)
        self.assertNotIn("other", message)


if __name__ == "__main__":
    unittest.main()
