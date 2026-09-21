"""Offline contract tests using the real installed SDK and synthetic v3 API data.

Run with SDK 2.2, 2.4 and 2.5 on PYTHONPATH. Only the HTTP boundary is mocked.
No personal Honcho configuration, credentials, or network services are used.
"""
from __future__ import annotations

import inspect
import json
import unittest
import warnings
from types import SimpleNamespace

import httpx
from honcho import Honcho
from honcho.conclusions import Conclusion
from honcho.session import Session

from test_plugin_api import plugin_api


STAMP = "2026-01-01T00:00:00Z"
WORKSPACE = "fixture-workspace"
SESSION = "fixture-session"
ROOT = f"/v3/workspaces/{WORKSPACE}"
SESSION_ROOT = f"{ROOT}/sessions/{SESSION}"


class SDKCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.failures = {}
        self.workspace_exists = True
        self.session_exists = True
        self.upload_enabled = False
        self.message = {
            "id": "message-fixture", "content": "Synthetic fixture content.",
            "peer_id": "human", "session_id": SESSION, "workspace_id": WORKSPACE,
            "metadata": {}, "created_at": STAMP, "token_count": 5,
        }
        self.conclusion = {
            "id": "conclusion-fixture", "content": "Synthetic derived fact.",
            "observer_id": "agent", "observed_id": "human", "session_id": SESSION,
            "level": "deductive", "source_ids": ["premise-fixture"],
            "times_derived": 4, "created_at": STAMP,
        }
        self.config = SimpleNamespace(
            api_key=None, base_url="http://honcho.invalid", environment="local",
            enabled=True, host="fixture", workspace_id=WORKSPACE,
            session_strategy="per-session", recall_mode="hybrid", save_messages=True,
            write_frequency="async", peer_name="human", ai_peer="agent",
            sessions={}, resolve_session_name=lambda **_: SESSION,
        )
        self.http = httpx.Client(transport=httpx.MockTransport(self.handle))
        self.addCleanup(self.http.close)
        self.client = Honcho(
            base_url="http://honcho.invalid", environment="local", api_key="fixture-only",
            workspace_id=WORKSPACE, http_client=self.http, max_retries=0,
        )

    def handle(self, request):
        path = request.url.path
        body = json.loads(request.content) if request.headers.get("content-type", "").startswith("application/json") and request.content else None
        self.calls.append((request.method, path, dict(request.url.params), body))
        if path in self.failures:
            return httpx.Response(self.failures[path], json={"message": "Synthetic service failure"})

        def response(value):
            return httpx.Response(200, json=value)

        def page(items):
            return response({"items": items, "total": len(items), "page": int(request.url.params.get("page", 1)), "size": int(request.url.params.get("size", 25)), "pages": 1 if items else 0})

        if (request.method, path) == ("POST", "/v3/workspaces/list"):
            self.assertEqual(body, {"filters": {"id": WORKSPACE}})
            return page([{"id": WORKSPACE, "created_at": STAMP, "metadata": {}}] if self.workspace_exists else [])
        if (request.method, path) == ("POST", f"{ROOT}/sessions/list"):
            if body and body.get("filters"):
                self.assertEqual(body["filters"], {"id": SESSION})
            return page([{"id": SESSION, "workspace_id": WORKSPACE, "is_active": True, "created_at": STAMP}] if self.session_exists else [])
        peers = [{"id": name, "workspace_id": WORKSPACE, "created_at": STAMP} for name in ("human", "agent")]
        if (request.method, path) == ("POST", f"{ROOT}/peers/list") or (request.method, path) == ("GET", f"{SESSION_ROOT}/peers"):
            return page(peers)
        if (request.method, path) == ("POST", f"{SESSION_ROOT}/messages/list"):
            self.assertEqual(request.url.params.get("reverse"), "true")
            return page([self.message])
        if (request.method, path) == ("GET", f"{ROOT}/queue/status"):
            return response({"total_work_units": 9, "completed_work_units": 5, "in_progress_work_units": 1, "pending_work_units": 3})
        if (request.method, path) == ("POST", f"{ROOT}/conclusions/list"):
            self.assertEqual(body["filters"]["observer_id"], "agent")
            self.assertEqual(body["filters"]["observed_id"], "human")
            return page([self.conclusion])
        if (request.method, path) == ("GET", f"{SESSION_ROOT}/context"):
            self.assertEqual(request.url.params["peer_target"], "human")
            self.assertEqual(request.url.params["peer_perspective"], "agent")
            self.assertEqual(request.url.params["tokens"], "2048")
            if "limit_to_session" in inspect.signature(Session.context).parameters:
                self.assertEqual(request.url.params["limit_to_session"], "true")
            return response({
                "id": SESSION, "messages": [self.message],
                "summary": {"content": "Synthetic summary.", "message_id": self.message["id"], "summary_type": "short", "created_at": STAMP, "token_count": 3},
                "peer_representation": "Synthetic session context.", "peer_card": None,
            })
        if (request.method, path) == ("GET", f"{ROOT}/peers/agent/context"):
            return response({"peer_id": "agent", "target_id": "human", "representation": "Synthetic workspace context.", "peer_card": None})
        if (request.method, path) == ("POST", f"{ROOT}/peers/agent/representation"):
            self.assertEqual(body["session_id"], SESSION)
            self.assertEqual(body["target"], "human")
            return response({"representation": "Synthetic scoped representation."})
        if (request.method, path) == ("GET", f"{ROOT}/peers/human/card"):
            return response({"peer_card": None})
        if request.method == "POST" and path in (f"{SESSION_ROOT}/search", f"{ROOT}/peers/human/search", f"{ROOT}/search"):
            self.assertEqual(body["query"], "fixture")
            self.assertEqual(body["limit"], 7)
            return response([self.message])
        if (request.method, path) == ("POST", f"{ROOT}/scopes/list"):
            return page([{"id": "engineering", "metadata": {}, "created_at": STAMP}])
        if (request.method, path) == ("GET", f"{ROOT}/scopes/engineering"):
            return response({"id": "engineering", "metadata": {}, "created_at": STAMP})
        if self.upload_enabled and (request.method, path) == ("POST", f"{SESSION_ROOT}/messages/upload"):
            self.assertIn(b"fixture upload", request.content)
            self.assertIn(b"human", request.content)
            return response([self.message, {**self.message, "id": "message-second"}])
        if self.upload_enabled and request.method == "GET" and path in (f"{SESSION_ROOT}/messages/message-fixture", f"{SESSION_ROOT}/messages/message-second"):
            return response({**self.message, "id": path.rsplit("/", 1)[1]})
        self.fail(f"Unexpected request, possibly a get-or-create write: {request.method} {path}")

    def collect(self, name, **kwargs):
        request_class = getattr(plugin_api, f"{name.title()}Request")
        return getattr(plugin_api, f"_collect_{name}")(
            request_class(stored_session_id="fixture-hermes", **kwargs),
            config_factory=lambda: self.config, client_factory=lambda _: self.client,
            session_metadata_loader=lambda _: {},
        )

    def test_summary_messages_queues_and_conclusions_use_real_sdk(self):
        snapshot = self.collect("snapshot")
        self.assertEqual(snapshot["errors"], [])
        self.assertEqual(snapshot["chat"]["messages"], 1)
        self.assertEqual(snapshot["totals"], {"sessions": 1, "peers": 2, "conclusions": 1})
        messages = self.collect("messages", page=2)
        self.assertEqual(messages["items"][0]["content"], self.message["content"])
        self.assertEqual(messages["page"], 2)
        activity = self.collect("activity")
        self.assertEqual(activity["workspace_queue"]["pending"], 3)
        self.assertEqual(activity["session_queue"]["total"], 9)
        self.assertIsNone(activity["failed"])
        conclusions = self.collect("conclusions")
        self.assertEqual(conclusions["errors"], [])
        item = conclusions["items"][0]
        self.assertEqual(item["content"], self.conclusion["content"])
        if "source_ids" in inspect.signature(Conclusion).parameters:
            self.assertEqual(item["source_ids"], ["premise-fixture"])
            self.assertEqual(item["times_derived"], 4)
        else:
            self.assertIsNone(item["source_ids"])
            self.assertIsNone(item["times_derived"])
        filters = [call[3]["filters"] for call in self.calls if call[1].endswith("/conclusions/list")]
        self.assertEqual(filters[-1]["session_id"], SESSION)

    def test_context_reads_models_without_deprecated_card_api(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error", DeprecationWarning)
            result = self.collect("context")
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["session"]["summary"], "Synthetic summary.")
        self.assertEqual(result["session"]["representation"], "Synthetic session context.")
        self.assertEqual(result["peer_context"], "Synthetic workspace context.")
        self.assertEqual(result["session"]["messages"][0]["session_id"], SESSION)
        self.assertIsNone(result["session"]["token_count"])
        self.assertEqual(result["peer_card"], [])

    def test_search_preserves_selected_boundary(self):
        for scope, path in (("session", f"{SESSION_ROOT}/search"), ("peer", f"{ROOT}/peers/human/search"), ("workspace", f"{ROOT}/search")):
            with self.subTest(scope=scope):
                result = self.collect("search", scope=scope, query="fixture", limit=7)
                self.assertEqual(result["errors"], [])
                self.assertEqual(result["items"][0]["rank"], 1)
                self.assertEqual(self.calls[-1][1], path)

    def test_scopes_are_gated_and_lookup_never_creates(self):
        listing = self.collect("scopes")
        if not hasattr(Honcho, "scopes"):
            self.assertEqual(listing["state"], "unsupported_sdk")
            self.assertFalse(listing["capabilities"]["scope_search"])
            return
        self.assertEqual(listing["errors"], [])
        self.assertEqual(listing["items"][0]["id"], "engineering")
        self.calls.clear()
        result = self.collect("search", scope="honcho", scope_id="engineering", query="fixture", limit=7)
        self.assertEqual(result["errors"], [])
        self.assertEqual(self.calls[-1][3]["scope"], "engineering")
        if hasattr(Honcho, "get_scope"):
            self.assertIn(("GET", f"{ROOT}/scopes/engineering"), [(call[0], call[1]) for call in self.calls])

    def test_missing_workspace_or_session_does_not_provision(self):
        self.workspace_exists = False
        self.assertEqual(self.collect("messages")["state"], "workspace_missing")
        self.assertEqual(len(self.calls), 1)
        self.workspace_exists = True
        self.session_exists = False
        self.assertEqual(self.collect("messages")["state"], "session_missing")
        self.assertFalse(any(call[1].endswith("/messages/list") for call in self.calls))

    def test_scope_failures_do_not_enable_controls_or_broaden_search(self):
        if not hasattr(Honcho, "scopes"):
            self.assertEqual(self.collect("scopes")["state"], "unsupported_sdk")
            return
        self.failures[f"{ROOT}/scopes/list"] = 403
        result = self.collect("scopes")
        self.assertFalse(result["ok"])
        self.assertFalse(result["capabilities"]["scope_listing"])
        self.assertFalse(result["capabilities"]["scope_search"])
        if hasattr(Honcho, "get_scope"):
            for status, state in ((404, "scope_missing"), (403, "unavailable"), (503, "unavailable")):
                with self.subTest(status=status):
                    self.calls.clear()
                    self.failures[f"{ROOT}/scopes/engineering"] = status
                    result = self.collect("search", scope="honcho", scope_id="engineering", query="fixture", limit=7)
                    self.assertEqual(result["state"], state)
                    self.assertFalse(any(call[1].endswith("/search") for call in self.calls))

    def test_provider_503_preserves_unrelated_layers(self):
        self.failures[f"{ROOT}/peers/agent/context"] = 503
        result = self.collect("context")
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "partial")
        self.assertEqual(result["session"]["summary"], "Synthetic summary.")
        self.assertIsNone(result["peer_context"])
        self.assertTrue(any(error["scope"] == "context.peer" for error in result["errors"]))

    def test_confirmed_upload_reads_back_every_created_message(self):
        tickets = []
        request = plugin_api.UploadTicketRequest(stored_session_id="fixture-hermes", filename="fixture.txt", content_type="text/plain", size=len(b"fixture upload"), source_kind="file")
        deps = dict(config_factory=lambda: self.config, client_factory=lambda _: self.client, session_metadata_loader=lambda _: {})
        prepared = plugin_api._collect_upload_ticket(request, **deps, ticket_store=lambda ticket: (tickets.append(ticket), "fixture-ticket")[1])
        self.assertEqual(prepared["state"], "ready")
        self.assertFalse(any(call[1].endswith("/upload") for call in self.calls))
        self.upload_enabled = True
        result = plugin_api._collect_upload(tickets[0], filename="fixture.txt", content_type="text/plain", content=b"fixture upload", **deps)
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["state"], "verified")
        self.assertEqual(result["created_count"], 2)
        self.assertEqual([item["id"] for item in result["created"]], ["message-fixture", "message-second"])
        self.assertEqual([call[1] for call in self.calls[-2:]], [f"{SESSION_ROOT}/messages/message-fixture", f"{SESSION_ROOT}/messages/message-second"])
