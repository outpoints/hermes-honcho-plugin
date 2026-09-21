"""Exercise the plugin against Hermes's real scopes, config and session store.

Only Honcho network services are faked. All homes and credentials are fixtures.
Run with the Hermes interpreter, as scripts/check.sh does.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import io
import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import FastAPI, UploadFile

from test_plugin_api import FakeClient, FakePage, plugin_api


class ProfileScopeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / ".hermes"
        self.homes = {"default": self.root, "research": self.root / "profiles" / "research"}
        self.enterContext(patch.dict(os.environ, {
            "HOME": self.temp.name,
            "HERMES_HOME": str(self.root),
            "PATH": os.defpath,
        }, clear=True))
        for name, home in self.homes.items():
            home.mkdir(parents=True, exist_ok=True)
            (home / ".env").write_text(f"HONCHO_API_KEY=fixture-{name}\n")
            (home / "config.yaml").write_text(
                "plugins:\n  enabled: [hermes-honcho-plugin]\n  disabled: []\n"
            )
            (home / "honcho.json").write_text(json.dumps({
                "enabled": True,
                "workspace": f"workspace-{name}",
                "peerName": f"user-{name}",
                "aiPeer": f"agent-{name}",
                "sessionStrategy": "per-session",
            }))

        from agent import secret_scope
        from hermes_constants import reset_hermes_home_override, set_hermes_home_override
        from tui_gateway import launch_profile_policy
        self.secrets = secret_scope
        self.enterContext(patch.object(secret_scope, "_MULTIPLEX_ACTIVE", True))
        self.enterContext(patch.object(launch_profile_policy, "_snapshot", dict(os.environ)))
        token = secret_scope.set_secret_scope(None)
        self.addCleanup(secret_scope.reset_secret_scope, token)
        token = set_hermes_home_override(None)
        self.addCleanup(reset_hermes_home_override, token)

        from plugins.memory.honcho import client as honcho_client
        self.honcho = honcho_client
        self.seen = []

        def client_factory(config):
            # An assertion on fixtures, never return credentials in an API response.
            name = config.hermes_home.name if config.hermes_home != self.root else "default"
            self.assertEqual(config.api_key, f"fixture-{name}")
            self.assertEqual(config.workspace_id, f"workspace-{name}")
            self.assertEqual(config.peer_name, f"user-{name}")
            self.assertEqual(config.ai_peer, f"agent-{name}")
            self.seen.append(name)
            client = FakeClient()
            client.workspaces = lambda filters=None, page=1, size=50: FakePage([config.workspace_id], total=1)
            # A new draft has no Honcho session. No get-or-create operation exists.
            client.sessions = lambda filters=None, page=1, size=50: FakePage([], total=0)
            return client

        self.client_factory = client_factory
        self.enterContext(patch.object(honcho_client, "get_honcho_client", client_factory))
        self.app = FastAPI()
        self.app.include_router(plugin_api.router, prefix="/api/plugins/hermes-honcho-plugin")

    async def post(self, profile, body=None, endpoint="snapshot"):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
            return await client.post(
                f"/api/plugins/hermes-honcho-plugin/{endpoint}",
                params={"profile": profile} if profile is not None else {},
                json=body if body is not None else {"profile": profile, "focused_profile": profile},
            )

    async def test_snapshot_resolves_real_honcho_config_under_routed_profile(self):
        # Prove that the guard is active before dispatch, not just an empty config.
        with self.assertRaises(self.secrets.UnscopedSecretError):
            self.honcho.HonchoClientConfig.from_global_config()
        for name in ("default", "research", "default"):
            response = await self.post(name)
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertTrue(result["ok"], result)
            self.assertEqual(result["config"]["workspace_id"], f"workspace-{name}")
            self.assertEqual(result["config"]["ai_peer"], f"agent-{name}")
            self.assertEqual(result["profile"], name)
            self.assertIsNone(result["chat"]["honcho_session_id"])
            self.assertIsNone(result["chat"]["found"])
            self.assertNotIn("fixture-", response.text)
            self.assertIsNone(self.secrets.current_secret_scope())
        self.assertEqual(self.seen, ["default", "research", "default"])

    async def test_body_cannot_select_or_mislabel_the_backend_profile(self):
        for route, body in (
            (None, {"profile": "research", "focused_profile": "research"}),
            ("research", {"profile": "default", "focused_profile": "default"}),
            ("research", {"profile": "research", "focused_profile": "default"}),
            ("research", {"profile": "research", "connection_id": "one", "focused_connection_id": "two"}),
        ):
            with self.subTest(route=route, body=body):
                response = await self.post(route, body)
                self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.seen, [])

    async def test_host_rejects_invalid_missing_and_disabled_profile_routes(self):
        for route, status in (("../research", 400), ("missing", 404)):
            with self.subTest(route=route):
                response = await self.post(route)
                self.assertEqual(response.status_code, status, response.text)
        (self.homes["research"] / "config.yaml").write_text(
            "plugins:\n  enabled: [hermes-honcho-plugin]\n  disabled: [hermes-honcho-plugin]\n"
        )
        response = await self.post("research")
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(self.seen, [])

    async def test_profile_owned_backends_bind_their_own_launch_scope(self):
        # Each subtest models a separate serve --profile process, without a query selector.
        for name, home in self.homes.items():
            with self.subTest(name=name), patch.dict(os.environ, {"HERMES_HOME": str(home)}):
                response = await self.post(None, {})
                result = response.json()
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["profile"], name)
                self.assertEqual(result["config"]["workspace_id"], f"workspace-{name}")

    async def test_each_route_uses_its_profiles_real_session_metadata(self):
        from hermes_state import SessionDB

        def create_stores():
            for name, home in self.homes.items():
                db = SessionDB(home / "state.db")
                try:
                    db.create_session("same-id", "desktop", cwd=f"/fixture/{name}")
                    db.set_session_title("same-id", f"Title for {name}")
                    db.set_session_title_source("same-id", "user")
                finally:
                    db.close()

        await asyncio.to_thread(create_stores)

        endpoints = {
            "snapshot": {}, "messages": {}, "conclusions": {}, "context": {},
            "search": {"query": "fixture"}, "scopes": {}, "activity": {},
            "upload-ticket": {"filename": "fixture.txt", "content_type": "text/plain", "size": 1, "source_kind": "file"},
        }
        original_loader = plugin_api._load_hermes_session_metadata
        loaded = []

        def load(session_id):
            from hermes_cli.profiles import get_active_profile_name
            name = get_active_profile_name()
            metadata = original_loader(session_id)
            self.assertEqual(metadata, {"cwd": f"/fixture/{name}", "title": f"Title for {name}", "title_source": "user"})
            loaded.append(name)
            return metadata

        with patch.object(plugin_api, "_load_hermes_session_metadata", load):
            for endpoint, extra in endpoints.items():
                for name in self.homes:
                    with self.subTest(endpoint=endpoint, name=name):
                        response = await self.post(name, {"profile": name, "stored_session_id": "same-id", **extra}, endpoint)
                        self.assertEqual(response.status_code, 200, response.text)
                        result = response.json()
                        self.assertNotIn(result["state"], ("error", "unreachable"), result)
                        self.assertEqual(result.get("workspace_id", result.get("config", {}).get("workspace_id")), f"workspace-{name}")
        self.assertEqual(len(loaded), len(endpoints) * len(self.homes))

    async def test_concurrent_threaded_requests_never_share_identity(self):
        barrier = threading.Barrier(2, timeout=5)
        before_env = dict(os.environ)
        before_scope = []
        original = plugin_api._collect_in_profile

        def entering(*args):
            before_scope.append(self.secrets.current_secret_scope())
            return original(*args)

        def probe(request):
            first = self.honcho.HonchoClientConfig.from_global_config()
            barrier.wait()
            second = self.honcho.HonchoClientConfig.from_global_config()
            self.assertEqual(first.api_key, f"fixture-{request.profile}")
            self.assertEqual(second.api_key, first.api_key)
            self.assertEqual(second.hermes_home, self.homes[request.profile])
            return {"ok": True, "profile": request.profile, "workspace": second.workspace_id}

        with patch.object(plugin_api, "_collect_snapshot", probe), patch.object(plugin_api, "_collect_in_profile", entering):
            responses = await asyncio.gather(self.post("default"), self.post("research"))
        self.assertEqual(before_scope, [None, None])
        for name, response in zip(self.homes, responses):
            self.assertEqual(response.json(), {"ok": True, "profile": name, "workspace": f"workspace-{name}"})
        self.assertEqual(dict(os.environ), before_env)
        self.assertIsNone(self.secrets.current_secret_scope())

    async def test_thread_scope_lives_until_worker_exit_even_after_timeout_or_cancel(self):
        from hermes_constants import get_hermes_home, get_hermes_home_override
        from hermes_cli.web_server_profiles import _config_profile_scope

        original = plugin_api._collect_in_profile
        for outcome in ("success", "exception", "timeout", "cancel"):
            with self.subTest(outcome=outcome):
                started, release, finished = (threading.Event() for _ in range(3))
                observed = []

                def worker(request):
                    observed.append((get_hermes_home(), self.secrets.get_secret("HONCHO_API_KEY")))
                    started.set()
                    if not release.wait(5):
                        raise AssertionError("worker was not released")
                    observed.append((get_hermes_home(), self.secrets.get_secret("HONCHO_API_KEY")))
                    if outcome == "exception":
                        raise RuntimeError("fixture failure")
                    return {"ok": True}

                def wrapping(*args):
                    # to_thread has propagated the PARENT scope before we enter.
                    self.assertEqual(self.secrets.get_secret("HONCHO_API_KEY"), "fixture-default")
                    try:
                        return original(*args)
                    finally:
                        observed.append((get_hermes_home(), self.secrets.get_secret("HONCHO_API_KEY")))
                        finished.set()

                with _config_profile_scope("default"), patch.object(plugin_api, "_collect_in_profile", wrapping), patch.object(plugin_api, "REQUEST_TIMEOUT_SECONDS", 0.2 if outcome == "timeout" else 5):
                    task = asyncio.create_task(plugin_api._run_collector(plugin_api.SnapshotRequest(profile="research"), worker, "research"))
                    try:
                        self.assertTrue(await asyncio.to_thread(started.wait, 5))
                        if outcome == "cancel":
                            task.cancel()
                            with self.assertRaises(asyncio.CancelledError):
                                await task
                        elif outcome == "timeout":
                            self.assertEqual((await task)["state"], "unreachable")
                        else:
                            release.set()
                            result = await task
                            self.assertEqual(result.get("state", "success"), "error" if outcome == "exception" else "success")
                        self.assertEqual(self.secrets.get_secret("HONCHO_API_KEY"), "fixture-default")
                    finally:
                        release.set()
                        self.assertTrue(await asyncio.to_thread(finished.wait, 5))
                self.assertEqual(observed, [(self.homes["research"], "fixture-research")] * 2 + [(self.root, "fixture-default")])
                self.assertIsNone(self.secrets.current_secret_scope())
                self.assertIsNone(get_hermes_home_override())

    async def test_missing_metadata_store_is_never_created(self):
        response = await self.post("research", {"profile": "research", "stored_session_id": "unknown"})
        self.assertTrue(response.json()["ok"], response.text)
        self.assertFalse((self.homes["research"] / "state.db").exists())

    async def test_upload_tickets_cannot_cross_profiles_and_writes_are_scoped(self):
        writes = []

        def factory(config):
            client = self.client_factory(config)
            session_id = config.resolve_session_name(session_id="same-id")
            created = {}

            def upload_file(file, peer, metadata=None):
                self.assertEqual(self.secrets.get_secret("HONCHO_API_KEY"), config.api_key)
                writes.append((config.hermes_home, peer, file))
                message = SimpleNamespace(
                    id="fixture-message", content="x", peer_id=peer, session_id=session_id,
                    created_at=dt.datetime.now(dt.timezone.utc), metadata={},
                )
                created[message.id] = message
                return [message]

            session = SimpleNamespace(
                id=session_id, peers=lambda: [SimpleNamespace(id=config.peer_name)],
                upload_file=upload_file, get_message=lambda message_id: created[message_id],
            )
            client.sessions = lambda filters=None, page=1, size=50: FakePage([session], total=1)
            return client

        async def mint(name):
            response = await self.post(name, {
                "stored_session_id": "same-id", "filename": "fixture.txt",
                "content_type": "text/plain", "size": 1, "source_kind": "file",
            }, "upload-ticket")
            self.assertEqual(response.json()["state"], "ready", response.text)
            return response.json()["ticket"]

        async def send(ticket, name):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
                return await client.post(f"/api/plugins/hermes-honcho-plugin/uploads/{ticket}", params={"profile": name}, files={"file": ("fixture.txt", b"x", "text/plain")})

        with patch.object(self.honcho, "get_honcho_client", factory):
            ticket = await mint("research")
            self.assertEqual((await send(ticket, "default")).status_code, 409)
            self.assertEqual(writes, [])
            for name in self.homes:
                ticket = await mint(name)
                result = (await send(ticket, name)).json()
                self.assertEqual(result["state"], "verified", result)
                self.assertEqual(result["created_count"], 1)
                self.assertEqual(result["created"][0]["peer_id"], f"user-{name}")
                self.assertEqual((await send(ticket, name)).json()["state"], "ticket_expired")
        self.assertEqual(writes, [(home, f"user-{name}", ("fixture.txt", b"x", "text/plain")) for name, home in self.homes.items()])

    async def test_upload_worker_keeps_scope_after_timeout_and_cancellation(self):
        for outcome in ("success", "exception", "timeout", "cancel"):
            with self.subTest(outcome=outcome):
                started, release, finished = (threading.Event() for _ in range(3))
                observed = []
                original = plugin_api._collect_in_profile

                def worker(payload, **kwargs):
                    observed.append(self.secrets.get_secret("HONCHO_API_KEY"))
                    started.set()
                    if not release.wait(5):
                        raise AssertionError("upload worker was not released")
                    observed.append(self.secrets.get_secret("HONCHO_API_KEY"))
                    if outcome == "exception":
                        raise RuntimeError("fixture upload failure")
                    return {"ok": True}

                def wrapping(*args):
                    try:
                        return original(*args)
                    finally:
                        observed.append(self.secrets.current_secret_scope())
                        finished.set()

                request = plugin_api.UploadTicketRequest(profile="research", filename="fixture.txt", content_type="text/plain", size=1, source_kind="file")
                ticket = plugin_api._store_upload_ticket({"request": request.model_dump(), "expires_at": time.time() + 120})
                file = UploadFile(io.BytesIO(b"x"), filename="fixture.txt")
                with patch.object(plugin_api, "_collect_upload", worker), patch.object(plugin_api, "_collect_in_profile", wrapping), patch.object(plugin_api, "UPLOAD_TIMEOUT_SECONDS", 0.2 if outcome == "timeout" else 5):
                    task = asyncio.create_task(plugin_api.upload(ticket, file, "research"))
                    try:
                        self.assertTrue(await asyncio.to_thread(started.wait, 5))
                        if outcome == "cancel":
                            task.cancel()
                            with self.assertRaises(asyncio.CancelledError):
                                await task
                        elif outcome == "timeout":
                            result = await task
                            self.assertEqual(result["state"], "outcome_unknown")
                            self.assertIsNone(result["committed"])
                        else:
                            release.set()
                            result = await task
                            self.assertEqual(result.get("state", "success"), "upload_failed" if outcome == "exception" else "success")
                        self.assertTrue(file.file.closed)
                        self.assertIsNone(self.secrets.current_secret_scope())
                    finally:
                        release.set()
                        self.assertTrue(await asyncio.to_thread(finished.wait, 5))
                self.assertEqual(observed, ["fixture-research", "fixture-research", None])

    async def test_unconfigured_named_profile_never_uses_launch_credentials(self):
        (self.homes["research"] / ".env").unlink()
        response = await self.post("research")
        self.assertEqual(response.json()["state"], "not_configured", response.text)
        self.assertEqual(self.seen, [])

    async def test_existing_host_context_is_preserved_when_no_query_is_supplied(self):
        from hermes_cli.web_server_profiles import _config_profile_scope

        for selector in (None, "", "current"):
            with self.subTest(selector=selector), _config_profile_scope("research"):
                response = await self.post(selector, {"profile": "research"})
                self.assertTrue(response.json()["ok"], response.text)
                self.assertEqual(response.json()["config"]["workspace_id"], "workspace-research")
                self.assertEqual(self.secrets.get_secret("HONCHO_API_KEY"), "fixture-research")
        self.assertIsNone(self.secrets.current_secret_scope())


if __name__ == "__main__":
    unittest.main()
