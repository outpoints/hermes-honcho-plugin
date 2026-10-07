"""Compatibility with catalog-installed and legacy bundled Honcho providers."""
from __future__ import annotations

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from plugins import memory

from test_plugin_api import FakeClient, FakeConfig, plugin_api


class ProviderLoadingTests(unittest.TestCase):
    def test_legacy_host_without_resolver_uses_bundled_provider(self):
        module = SimpleNamespace()
        with patch.object(memory, "import_provider_module", create=True):
            del memory.import_provider_module
            with patch.dict(sys.modules, {"plugins.memory.honcho.client": module}):
                self.assertIs(plugin_api._honcho_client_module(), module)

    def test_host_resolution_failure_never_falls_back_to_bundled_provider(self):
        for error in (ImportError("provider not installed"), ModuleNotFoundError("provider dependency missing")):
            with self.subTest(error=type(error).__name__):
                with patch.object(memory, "import_provider_module", side_effect=error, create=True):
                    with patch.dict(sys.modules, {"plugins.memory.honcho.client": SimpleNamespace()}):
                        with self.assertRaises(type(error)) as caught:
                            plugin_api._honcho_client_module()
                self.assertIs(caught.exception, error)

    def test_provider_resolution_is_not_cached_across_requests(self):
        first, second = SimpleNamespace(), SimpleNamespace()
        with patch.object(memory, "import_provider_module", side_effect=[first, second], create=True):
            self.assertIs(plugin_api._honcho_client_module(), first)
            self.assertIs(plugin_api._honcho_client_module(), second)

    def test_read_and_workbench_use_host_provider_resolver(self):
        for operation in ("read", "workbench"):
            with self.subTest(operation=operation):
                config = FakeConfig()
                client = FakeClient()
                transport = SimpleNamespace(max_retries=2, timeout=10)
                setattr(client, "_http", transport)
                module = SimpleNamespace(
                    HonchoClientConfig=SimpleNamespace(from_global_config=lambda: config),
                    get_honcho_client=lambda supplied: client,
                )
                request = plugin_api.SnapshotRequest(cwd="/work/hermes-honcho-plugin")
                with patch.object(memory, "import_provider_module", return_value=module, create=True) as resolve:
                    with patch.dict(sys.modules, {"plugins.memory.honcho.client": None}):
                        if operation == "read":
                            result, _, _, session = plugin_api._prepare_read(
                                request, config_factory=None, client_factory=None,
                                session_metadata_loader=lambda _: {},
                            )
                            self.assertEqual(session.id, "hermes-honcho-plugin")
                        else:
                            result, isolated, _, scope = plugin_api._workbench_target(
                                request, session_metadata_loader=lambda _: {},
                            )
                            self.assertIsNotNone(scope)
                            self.assertEqual(isolated._http.max_retries, 0)
                            self.assertEqual(transport.max_retries, 2)
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["state"], "connected")
                self.assertEqual(result["session_id"], "hermes-honcho-plugin")
                self.assertTrue(resolve.called)
                for call in resolve.call_args_list:
                    self.assertEqual(call.args, ("honcho", "client"))

    def test_snapshot_uses_host_provider_resolver_without_bundled_honcho(self):
        config = FakeConfig()
        client = FakeClient()
        module = SimpleNamespace(
            HonchoClientConfig=SimpleNamespace(from_global_config=lambda: config),
            get_honcho_client=lambda supplied: client,
        )
        request = plugin_api.SnapshotRequest(cwd="/work/hermes-honcho-plugin")
        with patch.object(memory, "import_provider_module", return_value=module, create=True) as resolve:
            with patch.dict(sys.modules, {"plugins.memory.honcho.client": None}):
                result = plugin_api._collect_snapshot(
                    request, session_metadata_loader=lambda _: {},
                )
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["state"], "connected")
        self.assertEqual(result["chat"]["honcho_session_id"], "hermes-honcho-plugin")
        resolve.assert_called_once_with("honcho", "client")
