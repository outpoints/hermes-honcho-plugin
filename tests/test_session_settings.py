"""Session settings against the real SDK and an offline Honcho that merges like 3.5.

The handler copies the server's write semantics: a session update merges
top-level configuration keys only, and a session-peer update merges the
fields it is sent. Synthetic data only.
"""
import json
import unittest
from typing import Any
from unittest.mock import patch

import httpx
import test_sdk_compatibility as sdk_fixture
from test_sdk_compatibility import ROOT, SESSION, SESSION_ROOT, STAMP
from test_plugin_api import plugin_api


class SessionSettingsTests(unittest.TestCase):
    def setUp(self):
        self.fixture = sdk_fixture.SDKCompatibilityTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.http._transport = httpx.MockTransport(self.handle)
        self.fixture.server_version = "3.5.0"
        self.fixture.session_config = {
            "reasoning": {"custom_instructions": "Session reasoning text."},
            "summary": {"enabled": False, "messages_per_short_summary": 20, "messages_per_long_summary": 60},
            "dialectic": {"custom_instructions": "Session answers."},
        }
        self.fixture.workspace_config = {"dream": {"enabled": False}}
        self.peer_level = {"human": {}, "agent": {"observe_me": True}}
        self.session_peers = {"human": {"observe_me": True, "observe_others": False}, "agent": {"observe_me": None, "observe_others": True}}
        self.writes = []
        self.fail_puts = {}
        self.lose_after_write = False

    def handle(self, request):
        path = request.url.path
        body: Any = json.loads(request.content) if request.content else {}
        if path == f"{SESSION_ROOT}/peers" and path in self.fixture.failures:
            return httpx.Response(self.fixture.failures[path], json={"message": "Synthetic failure"})
        if (request.method, path) == ("GET", f"{SESSION_ROOT}/peers"):
            self.fixture.calls.append((request.method, path, {}, None))
            items = [{"id": name, "workspace_id": "fixture-workspace", "created_at": STAMP, "metadata": {}, "configuration": self.peer_level[name]} for name in self.session_peers]
            items.append({"id": "scope.engineering", "workspace_id": "fixture-workspace", "created_at": STAMP, "metadata": {}, "configuration": {"observe_me": False}})
            return httpx.Response(200, json={"items": items, "total": len(items), "page": 1, "size": 50, "pages": 1})
        if path.startswith(f"{SESSION_ROOT}/peers/") and path.endswith("/config"):
            peer = path[len(f"{SESSION_ROOT}/peers/"):-len("/config")]
            if request.method == "GET":
                return httpx.Response(200, json=dict(self.session_peers[peer]))
            self.writes.append(("peer", peer, body))
            if self.fail_puts.get(path):
                return httpx.Response(self.fail_puts[path], json={"detail": "Synthetic observer limit"})
            self.session_peers[peer].update({key: value for key, value in body.items() if value is not None})
            return httpx.Response(204)
        if (request.method, path) == ("PUT", SESSION_ROOT):
            self.writes.append(("session", SESSION, body))
            if self.fail_puts.get(path):
                return httpx.Response(self.fail_puts[path], json={"detail": "Synthetic failure"})
            merged = {**self.fixture.session_config, **body["configuration"]}
            self.fixture.session_config = merged
            if self.lose_after_write:
                # The write landed but every later read fails.
                self.fixture.failures[f"{ROOT}/sessions/list"] = 503
                self.fixture.failures[f"{SESSION_ROOT}/peers"] = 503
            return httpx.Response(200, json={"id": SESSION, "workspace_id": "fixture-workspace", "is_active": True, "metadata": {}, "configuration": merged, "created_at": STAMP})
        return self.fixture.handle(request)

    def deps(self):
        return dict(config_factory=lambda: self.fixture.config, client_factory=lambda _: self.fixture.client, session_metadata_loader=lambda _: {})

    def read(self):
        return plugin_api._collect_session_settings(plugin_api.SessionSettingsRequest(stored_session_id="fixture-hermes"), **self.deps())

    def ticket(self, revision=None, **changes):
        revision = revision or self.read()["revision"]
        request = plugin_api.SessionSettingsTicketRequest(stored_session_id="fixture-hermes", revision=revision, **changes)
        return plugin_api._collect_session_settings_ticket(request, **self.deps())

    def save(self, ticket, **focus):
        request = plugin_api.SessionSettingsSaveRequest(stored_session_id="fixture-hermes", ticket=ticket, **focus)
        return plugin_api._collect_session_settings_save(request, **self.deps())

    def test_read_resolves_each_switch_and_its_source(self):
        result = self.read()
        self.assertEqual(result["errors"], [])
        self.assertTrue(result["ok"])
        self.assertEqual(result["capabilities"], {"learning": True, "observation": True})
        rows = {row["key"]: (row["choice"], row["effective"], row["source"]) for row in result["learning"]}
        self.assertEqual(rows, {
            "reasoning": ("inherit", None, "server"),
            "summary": ("off", False, "session"),
            "dream": ("inherit", False, "workspace"),
            "peer_card": ("inherit", None, "server"),
        })
        self.assertEqual(result["queue"]["pending"], 3)
        self.assertRegex(result["revision"], r"^[0-9a-f]{64}$")
        self.assertEqual(self.read()["revision"], result["revision"])

    def test_peers_list_user_then_hermes_and_skip_scope_members(self):
        peers = self.read()["peers"]
        self.assertEqual([(peer["id"], peer["role"]) for peer in peers], [("human", "user"), ("agent", "ai")])
        human, agent = peers
        self.assertEqual((human["effective_observe_me"], human["observe_me_source"]), (True, "session"))
        self.assertEqual((human["effective_observe_others"], human["observe_others_source"]), (False, "session"))
        self.assertEqual((agent["effective_observe_me"], agent["observe_me_source"]), (True, "peer"))
        self.assertFalse(any(call[1].endswith("/scope.engineering/config") for call in self.fixture.calls))

    def test_unset_observe_others_is_off_and_peer_level_off_is_inherited(self):
        self.session_peers["human"] = {"observe_me": None, "observe_others": None}
        self.peer_level["human"] = {"observe_me": False}
        human = self.read()["peers"][0]
        self.assertEqual((human["effective_observe_me"], human["observe_me_source"]), (False, "peer"))
        self.assertEqual((human["effective_observe_others"], human["observe_others_source"]), (False, "unset"))

    def test_legacy_deriver_setting_still_decides(self):
        self.fixture.session_config = {"deriver": {"enabled": False}}
        row = self.read()["learning"][0]
        self.assertEqual((row["choice"], row["effective"], row["source"], row["legacy"]), ("inherit", False, "session", True))
        self.fixture.session_config = {"skip_deriver": True}
        self.assertEqual(self.read()["learning"][0]["effective"], False)

    def test_failed_workspace_read_keeps_session_values(self):
        # The preflight's workspace check passed; only the configuration read
        # (an admin-key list on 3.x) fails.
        real = plugin_api._exact_configuration

        def exact(client, path, resource_id):
            if path == plugin_api.WORKSPACES_LIST_PATH:
                raise RuntimeError("Synthetic 403")
            return real(client, path, resource_id)

        with patch.object(plugin_api, "_exact_configuration", side_effect=exact):
            result = self.read()
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "partial")
        self.assertEqual([error["scope"] for error in result["errors"]], ["settings.workspace"])
        rows = {row["key"]: (row["effective"], row["source"]) for row in result["learning"]}
        self.assertEqual(rows["summary"], (False, "session"))
        self.assertEqual(rows["dream"], (None, "unknown"))
        self.assertTrue(result["capabilities"]["learning"])

    def test_failed_peer_read_disables_only_observation(self):
        self.fixture.failures[f"{SESSION_ROOT}/peers"] = 503
        result = self.read()
        self.assertTrue(result["ok"])
        self.assertEqual(result["peers"], [])
        self.assertEqual(result["capabilities"], {"learning": True, "observation": False})
        self.assertIn("peers", result["reasons"]["observation"])

    def test_capabilities_follow_the_server_version(self):
        for version, learning, observation, reason in (
            ("3.0.0", True, True, ""),
            ("2.5.0", False, False, "3.0.0 or later"),
            ("development", False, False, "Couldn't confirm"),
        ):
            with self.subTest(version=version):
                self.fixture.server_version = version
                result = self.read()
                self.assertEqual(result["capabilities"], {"learning": learning, "observation": observation})
                self.assertIn(reason, " ".join(result["reasons"].values()))
                # Values stay readable.
                self.assertEqual(len(result["learning"]), 4)

    def test_ticket_validates_without_writing(self):
        ticket = self.ticket(learning={"reasoning": "off", "summary": "off"}, observation={"human": {"observe_me": "off", "observe_others": "off"}})
        self.assertTrue(ticket["ok"], ticket)
        self.assertEqual(ticket["state"], "ready")
        # summary was already off and human observe_others already off.
        self.assertEqual([change["id"] for change in ticket["changes"]], ["learning.reasoning", "observation.human.observe_me"])
        self.assertEqual(ticket["target"], {"workspace_id": "fixture-workspace", "session_id": SESSION})
        self.assertEqual(self.writes, [])

    def test_ticket_rejects_stale_unknown_unsupported_and_no_op_changes(self):
        cases = [
            ({"revision": "0" * 64, "learning": {"reasoning": "off"}}, "stale"),
            ({"observation": {"nobody": {"observe_me": "off"}}}, "rejected"),
            ({"learning": {"summary": "off"}}, "rejected"),
            ({}, "rejected"),
        ]
        for changes, state in cases:
            with self.subTest(changes=changes):
                self.assertEqual(self.ticket(**changes)["state"], state)
        self.fixture.server_version = "2.5.0"
        result = self.ticket(observation={"human": {"observe_me": "off"}})
        self.assertEqual(result["state"], "rejected")
        self.assertIn("3.0.0", result["errors"][-1]["message"])
        self.assertEqual(self.writes, [])

    def test_save_rewrites_whole_sections_and_keeps_their_other_fields(self):
        ticket = self.ticket(learning={"reasoning": "off", "summary": "inherit", "dream": "on"})["ticket"]
        result = self.save(ticket)
        self.assertEqual(result["outcome"], "verified", result)
        self.assertTrue(result["verified"])
        self.assertEqual(self.writes, [("session", SESSION, {"configuration": {
            "reasoning": {"custom_instructions": "Session reasoning text.", "enabled": False},
            "summary": {"messages_per_short_summary": 20, "messages_per_long_summary": 60},
            "dream": {"enabled": True},
        }})])
        # The section the plugin did not touch survives the server's merge.
        self.assertEqual(self.fixture.session_config["dialectic"], {"custom_instructions": "Session answers."})
        self.assertEqual({change["id"]: change["status"] for change in result["changes"]}, {
            "learning.reasoning": "verified", "learning.summary": "verified", "learning.dream": "verified",
        })
        rows = {row["key"]: row["choice"] for row in result["learning"]}
        self.assertEqual(rows, {"reasoning": "off", "summary": "inherit", "dream": "on", "peer_card": "inherit"})

    def test_save_sends_only_changed_peer_fields(self):
        ticket = self.ticket(observation={"human": {"observe_me": "off"}, "agent": {"observe_others": "off"}})["ticket"]
        result = self.save(ticket)
        self.assertEqual(result["outcome"], "verified", result)
        self.assertEqual(self.writes, [("peer", "human", {"observe_me": False}), ("peer", "agent", {"observe_others": False})])
        self.assertEqual(self.session_peers["human"], {"observe_me": False, "observe_others": False})
        self.assertEqual(self.session_peers["agent"], {"observe_me": None, "observe_others": False})

    def test_ticket_is_single_use_and_bound_to_focus(self):
        ticket = self.ticket(learning={"reasoning": "off"})["ticket"]
        self.assertEqual(self.save(ticket, cwd="/other")["state"], "ticket_mismatch")
        self.assertEqual(self.save(ticket)["state"], "ticket_expired")
        ticket = self.ticket(learning={"reasoning": "off"})["ticket"]
        with patch.object(plugin_api.time, "time", return_value=10**12):
            self.assertEqual(self.save(ticket)["state"], "ticket_expired")
        self.assertEqual(self.writes, [])

    def test_change_after_review_writes_nothing(self):
        ticket = self.ticket(learning={"reasoning": "off"})["ticket"]
        self.session_peers["agent"]["observe_others"] = False
        result = self.save(ticket)
        self.assertEqual(result["state"], "stale")
        self.assertEqual(result["outcome"], "rejected")
        self.assertEqual(self.writes, [])

    def test_missing_session_at_save_never_sends_a_get_or_create_update(self):
        ticket = self.ticket(learning={"reasoning": "off"})["ticket"]
        self.fixture.session_exists = False
        result = self.save(ticket)
        self.assertEqual(result["state"], "session_missing")
        self.assertEqual(self.writes, [])

    def test_failed_write_is_not_retried_and_stops_later_writes(self):
        self.fixture.client._http.max_retries = 2
        self.fail_puts[SESSION_ROOT] = 503
        ticket = self.ticket(learning={"reasoning": "off"}, observation={"human": {"observe_me": "off"}})["ticket"]
        result = self.save(ticket)
        self.assertEqual(result["outcome"], "rejected")
        self.assertEqual(len(self.writes), 1)
        self.assertEqual({change["id"]: change["status"] for change in result["changes"]}, {
            "learning.reasoning": "not_applied", "observation.human.observe_me": "not_sent",
        })
        self.assertEqual(result["errors"][0]["scope"], "settings.save")
        # The shared client's retry policy is untouched.
        self.assertEqual(self.fixture.client._http.max_retries, 2)

    def test_partial_save_reports_each_change(self):
        self.fail_puts[f"{SESSION_ROOT}/peers/agent/config"] = 409
        ticket = self.ticket(learning={"reasoning": "off"}, observation={"agent": {"observe_others": "off"}})["ticket"]
        result = self.save(ticket)
        self.assertEqual(result["outcome"], "partial")
        self.assertFalse(result["verified"])
        self.assertEqual({change["id"]: change["status"] for change in result["changes"]}, {
            "learning.reasoning": "verified", "observation.agent.observe_others": "not_applied",
        })

    def test_lost_readback_is_unknown_not_success(self):
        self.lose_after_write = True
        ticket = self.ticket(learning={"reasoning": "off"})["ticket"]
        result = self.save(ticket)
        self.assertEqual(result["outcome"], "unknown")
        self.assertEqual(result["state"], "outcome_unknown")
        self.assertEqual(result["changes"][0]["status"], "unknown")
        self.assertEqual(len(self.writes), 1)

    def test_disconnected_or_missing_session_never_writes(self):
        self.fixture.failures["/v3/workspaces/list"] = 503
        result = self.read()
        self.assertFalse(result["ok"])
        self.assertEqual(result["learning"], [])
        request = plugin_api.SessionSettingsTicketRequest(stored_session_id="fixture-hermes", revision="0" * 64, learning={"reasoning": "off"})
        self.assertFalse(plugin_api._collect_session_settings_ticket(request, **self.deps())["ok"])
        self.assertEqual(self.writes, [])

    def test_request_models_reject_malformed_and_extra_input(self):
        good = {"revision": "a" * 64}
        for values in (
            {**good, "learning": {"reasoning": "maybe"}},
            {**good, "learning": {"deriver": "off"}},
            {**good, "observation": {"../agent": {"observe_me": "off"}}},
            {**good, "observation": {"scope.engineering": {"observe_me": "off"}}},
            {**good, "observation": {"agent": {}}},
            {**good, "observation": {"agent": {"observe_me": "inherit"}}},
            {**good, "observation": {"agent": {"observe_me": "off", "admin": True}}},
            {**good, "observation": {f"peer{index}": {"observe_me": "off"} for index in range(21)}},
            {"revision": "not-a-revision"},
            {**good, "configuration": {"reasoning": {"enabled": False}}},
        ):
            with self.subTest(values=values), self.assertRaises(ValueError):
                plugin_api.SessionSettingsTicketRequest(**values)
        with self.assertRaises(ValueError):
            plugin_api.SessionSettingsSaveRequest(ticket="fixture", learning={"reasoning": "off"})

    def test_rendered_routes_exist(self):
        paths = {route.path for route in plugin_api.router.routes}
        self.assertTrue({"/session-settings", "/session-settings-ticket", "/session-settings-save"} <= paths)


if __name__ == "__main__":
    unittest.main()
