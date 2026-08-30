from __future__ import annotations

import datetime as dt
import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).parents[1] / "dashboard" / "plugin_api.py"
SPEC = importlib.util.spec_from_file_location("hermes_honcho_plugin_api_test", MODULE_PATH)
assert SPEC and SPEC.loader
plugin_api = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = plugin_api
SPEC.loader.exec_module(plugin_api)


class FakePage:
    def __init__(self, items=None, total=0):
        self.items = list(items or [])
        self.total = total


class FakeQueue:
    total_work_units = 7
    completed_work_units = 5
    in_progress_work_units = 1
    pending_work_units = 1


class FakeConclusions:
    def list(self, page=1, size=50):
        return FakePage(total=14)


class FakePeer:
    def __init__(self, peer_id):
        self.id = peer_id

    def conclusions_of(self, target):
        if target != "human":
            raise AssertionError("unexpected conclusion target")
        return FakeConclusions()


class FakeSession:
    id = "hermes-honcho-plugin"

    def messages(self, page=1, size=50, reverse=False):
        message = SimpleNamespace(
            created_at=dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc),
            peer_id="hermes",
        )
        return FakePage([message], total=42)

    def peers(self):
        return [FakePeer("human"), FakePeer("hermes")]

    def queue_status(self):
        return FakeQueue()


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
    def __init__(self, session=None, fail_peers=False):
        self.session = session or FakeSession()
        self.fail_peers = fail_peers

    def sessions(self, filters=None, page=1, size=50):
        if filters:
            return FakePage([self.session], total=1)
        return FakePage(total=9)

    def peers(self, page=1, size=50):
        if self.fail_peers:
            raise RuntimeError("Bearer top-secret token=also-secret")
        return FakePage(total=3)

    def queue_status(self):
        return FakeQueue()


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
