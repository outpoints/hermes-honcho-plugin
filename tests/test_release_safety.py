"""Release regressions. All identities and content are synthetic fixtures."""
from __future__ import annotations

import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from test_plugin_api import FakeClient, FakeConfig, FakeSession, collect, plugin_api


def upload_with(session, config_factory=FakeConfig):
    request = plugin_api.UploadTicketRequest(
        cwd="/work/hermes-honcho-plugin", filename="fixture.txt",
        content_type="text/plain", size=1, source_kind="text",
    )
    ticket = {
        "request": request.model_dump(), "workspace_id": "agents",
        "session_id": "hermes-honcho-plugin", "peer_id": "human",
        "filename": request.filename, "content_type": request.content_type,
        "size": request.size, "source_kind": request.source_kind,
    }
    return plugin_api._collect_upload(
        ticket, filename=request.filename, content_type=request.content_type, content=b"x",
        config_factory=config_factory, client_factory=lambda _: FakeClient(session=session),
        session_metadata_loader=lambda _: {},
    )


class ReleaseSafetyTests(unittest.TestCase):
    def test_mismatched_session_is_never_read_or_offered_as_an_upload_target(self):
        session = FakeSession()
        session.id = "unrelated-session"
        reads = []
        def messages(*args, **kwargs):
            reads.append("messages")
            return FakeSession.messages(session, *args, **kwargs)
        session.messages = messages
        deps = dict(config_factory=FakeConfig, client_factory=lambda _: FakeClient(session=session), session_metadata_loader=lambda _: {})
        request = dict(cwd="/work/hermes-honcho-plugin")
        result = plugin_api._collect_messages(plugin_api.MessagesRequest(**request), **deps)
        self.assertFalse(result["ok"])
        self.assertEqual(result["items"], [])
        prepared = plugin_api._collect_upload_ticket(plugin_api.UploadTicketRequest(
            **request, filename="fixture.txt", content_type="text/plain", size=1, source_kind="file",
        ), **deps)
        self.assertIsNone(prepared["ticket"])
        snapshot = collect(FakeConfig(), FakeClient(session=session))
        self.assertIsNone(snapshot["chat"]["messages"])
        self.assertTrue(snapshot["errors"])
        self.assertEqual(reads, [], "must not dispatch reads to a mismatched session")

    def test_upload_transport_failure_or_malformed_receipt_has_unknown_outcome(self):
        for outcome in (TimeoutError("response lost"), [], None, {"bad": "receipt"}):
            with self.subTest(outcome=outcome):
                class Session(FakeSession):
                    calls = 0

                    def upload_file(self, **kwargs):
                        self.calls += 1
                        if isinstance(outcome, Exception):
                            raise outcome
                        return outcome

                session = Session()
                result = upload_with(session)
                self.assertEqual(result["state"], "outcome_unknown")
                self.assertIsNone(result["committed"])
                self.assertFalse(result["ok"])
                self.assertEqual(session.calls, 1)
                self.assertIn("before retrying", result["errors"][-1]["message"])

    def test_upload_readback_failure_preserves_verified_records(self):
        class Session(FakeSession):
            def upload_file(self, **kwargs):
                return [SimpleNamespace(id="one"), SimpleNamespace(id="two")]

            def get_message(self, message_id):
                if message_id == "two":
                    raise RuntimeError("readback unavailable")
                return SimpleNamespace(id=message_id, session_id=self.id, peer_id="human",
                                       content="Fixture", created_at=None)

        result = upload_with(Session())
        self.assertTrue(result["committed"])
        self.assertEqual(result["state"], "verification_failed")
        self.assertEqual(result["created_count"], 2)
        self.assertEqual(result["verified_count"], 1)
        self.assertEqual([m["id"] for m in result["created"]], ["one"])
        self.assertEqual(result["target"]["session_id"], "hermes-honcho-plugin")

    def test_upload_rejects_changed_configured_peer_before_writing(self):
        class Config(FakeConfig):
            peer_name = "other-human"

        class Session(FakeSession):
            calls = 0

            def upload_file(self, **kwargs):
                self.calls += 1
                return []

        session = Session()
        result = upload_with(session, Config)
        self.assertEqual(result["state"], "ticket_mismatch")
        self.assertIs(result["committed"], False)
        self.assertEqual(session.calls, 0)

    def test_malformed_snapshot_metric_preserves_independent_results(self):
        client = FakeClient()
        client.queue_status = lambda: SimpleNamespace(total_work_units="not-a-count")
        result = collect(FakeConfig(), client)
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "partial")
        self.assertIsNone(result["queue"])
        self.assertEqual(result["chat"]["messages"], 42)
        self.assertTrue(any(e["scope"] == "queue" for e in result["errors"]))

    def test_sdk_errors_redact_quoted_credentials_and_basic_auth(self):
        marker = "synthetic" + "-credential"
        for value in (f'{{"api_key": "{marker}"}}', f"password='{marker}'", f"Authorization: Basic {marker}"):
            self.assertNotIn(marker, plugin_api._safe_error(RuntimeError(value)))
            self.assertNotIn(marker, plugin_api._safe_json({"detail": value})["detail"])

    def test_safe_endpoint_preserves_ipv6_brackets_without_auth_or_query(self):
        self.assertEqual(plugin_api._safe_endpoint("http://user:pass@[::1]:8000/v3?token=fixture", "local"), "http://[::1]:8000/v3")


class UploadBodyTests(unittest.IsolatedAsyncioTestCase):
    async def test_ticket_rejection_closes_file_and_never_reads_it(self):
        file = plugin_api.UploadFile(io.BytesIO(b"x"), filename="fixture.txt")
        result = await plugin_api.upload("missing-ticket", file)
        self.assertEqual(result["state"], "ticket_expired")
        self.assertTrue(file.file.closed)

    async def test_upload_reads_at_most_confirmed_size_plus_one(self):
        class File(plugin_api.UploadFile):
            sizes = []

            async def read(self, size=-1):
                self.sizes.append(size)
                return await super().read(size)

        request = plugin_api.UploadTicketRequest(filename="fixture.txt", content_type="text/plain", size=1, source_kind="file")
        payload = {"request": request.model_dump()}
        file = File(io.BytesIO(b"oversized body"), filename="fixture.txt")
        with patch.object(plugin_api, "_take_upload_ticket", return_value=payload), patch.object(plugin_api, "_collect_in_profile") as collect:
            result = await plugin_api.upload("fixture-ticket", file)
        self.assertEqual(file.sizes, [2])
        self.assertEqual(result["state"], "ticket_mismatch")
        self.assertIs(result["committed"], False)
        self.assertTrue(file.file.closed)
        collect.assert_not_called()
