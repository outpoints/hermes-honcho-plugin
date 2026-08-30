"""Profile-aware, read-only Honcho metrics for the Hermes desktop plugin."""

from __future__ import annotations

import asyncio
import datetime as dt
import re
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

PLUGIN_VERSION = "0.1.0"
REQUEST_TIMEOUT_SECONDS = 20


class SnapshotRequest(BaseModel):
    """Desktop context needed to resolve the same Honcho session as Hermes."""

    profile: str | None = Field(default=None, max_length=128)
    connection_id: str | None = Field(default=None, max_length=256)
    runtime_session_id: str | None = Field(default=None, max_length=256)
    stored_session_id: str | None = Field(default=None, max_length=256)
    cwd: str | None = Field(default=None, max_length=4096)
    session_title: str | None = Field(default=None, max_length=512)
    session_title_source: str | None = Field(default=None, max_length=64)
    gateway_session_key: str | None = Field(default=None, max_length=512)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def _safe_endpoint(base_url: str | None, environment: str) -> str:
    """Return useful endpoint provenance without credentials or query values."""

    if not base_url:
        return f"Honcho Cloud ({environment})"
    try:
        parsed = urlsplit(base_url)
        host = parsed.hostname or "custom endpoint"
        if parsed.port:
            host = f"{host}:{parsed.port}"
        path = parsed.path.rstrip("/")
        return f"{parsed.scheme or 'http'}://{host}{path}"
    except (TypeError, ValueError):
        return "custom endpoint"


_BEARER_RE = re.compile(r"(?i)bearer\s+[a-z0-9._~+/=-]+")
_SECRET_QUERY_RE = re.compile(
    r"(?i)(api[_-]?key|access[_-]?token|token|secret)=([^&\s]+)"
)
_URL_USERINFO_RE = re.compile(r"(https?://)[^/@\s]+@", re.IGNORECASE)


def _safe_error(exc: BaseException) -> str:
    """Bound and redact SDK/network errors before returning them to the UI."""

    message = str(exc).replace("\n", " ").replace("\r", " ")
    message = _BEARER_RE.sub("Bearer [redacted]", message)
    message = _SECRET_QUERY_RE.sub(lambda m: f"{m.group(1)}=[redacted]", message)
    message = _URL_USERINFO_RE.sub(r"\1[redacted]@", message)
    return message[:240] or exc.__class__.__name__


def _queue_payload(status: Any) -> dict[str, int]:
    return {
        "total": int(getattr(status, "total_work_units", 0) or 0),
        "completed": int(getattr(status, "completed_work_units", 0) or 0),
        "in_progress": int(getattr(status, "in_progress_work_units", 0) or 0),
        "pending": int(getattr(status, "pending_work_units", 0) or 0),
    }


def _mapping_source(
    config: Any,
    *,
    cwd: str | None,
    title: str | None,
    title_source: str | None,
    session_id: str | None,
    gateway_key: str | None,
) -> str:
    if gateway_key:
        return "gateway session"
    if config.session_strategy == "per-session" and session_id:
        return "Hermes session"
    if cwd and config.sessions.get(cwd):
        return "directory override"
    if title and title_source not in {"derived", "llm"}:
        return "explicit title"
    if config.session_strategy == "per-repo":
        return "Git repository"
    if config.session_strategy in {"per-directory", "per-session"}:
        return "working directory"
    return "workspace"


def _load_hermes_session_metadata(session_id: str | None) -> dict[str, str]:
    """Read the active profile's session row without crossing profile scope."""

    if not session_id:
        return {}
    db = None
    try:
        # The dashboard process owns the profile-scoped DB resolver. `late`
        # avoids a circular import while plugin APIs are mounted at startup.
        from hermes_cli.web_deps import late

        open_db = late("_open_session_db_for_profile")
        db = open_db(None, read_only=True)
        resolved_id = db.resolve_session_id(session_id) or session_id
        row = db.get_session(resolved_id) or db.get_session(session_id) or {}
        return {
            key: str(row[key]).strip()
            for key in ("cwd", "title", "title_source")
            if row.get(key) is not None and str(row[key]).strip()
        }
    except Exception:
        # Desktop-provided identifiers remain a valid fallback on older Hermes
        # versions or while the state DB is still bootstrapping.
        return {}
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


def _base_snapshot(request: SnapshotRequest, config: Any) -> dict[str, Any]:
    configured = bool(config.api_key or config.base_url)
    return {
        "ok": False,
        "state": "checking",
        "version": PLUGIN_VERSION,
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "latency_ms": 0,
        "profile": _clean(request.profile) or "default",
        "connection_id": _clean(request.connection_id),
        "config": {
            "enabled": bool(config.enabled),
            "configured": configured,
            "host": config.host,
            "workspace_id": config.workspace_id,
            "endpoint": _safe_endpoint(config.base_url, config.environment),
            "session_strategy": config.session_strategy,
            "recall_mode": config.recall_mode,
            "save_messages": bool(config.save_messages),
            "write_frequency": config.write_frequency,
            "user_peer": config.peer_name,
            "ai_peer": config.ai_peer,
        },
        "totals": {"sessions": None, "peers": None, "conclusions": None},
        "queue": None,
        "chat": {
            "hermes_session_id": _clean(request.stored_session_id)
            or _clean(request.runtime_session_id),
            "cwd": _clean(request.cwd),
            "honcho_session_id": None,
            "mapping_source": None,
            "found": None,
            "messages": None,
            "peers": [],
            "latest_message_at": None,
            "latest_peer_id": None,
            "queue": None,
        },
        "errors": [],
    }


def _collect_snapshot(
    request: SnapshotRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Collect independently degradable metrics using Hermes's bound config."""

    started = time.monotonic()
    if config_factory is None or client_factory is None:
        from plugins.memory.honcho.client import (  # imported inside request context
            HonchoClientConfig,
            get_honcho_client,
        )

        config_factory = config_factory or HonchoClientConfig.from_global_config
        client_factory = client_factory or get_honcho_client

    config = config_factory()
    result = _base_snapshot(request, config)
    configured = result["config"]["configured"]
    if not configured:
        result["state"] = "not_configured"
        result["errors"].append(
            {
                "scope": "configuration",
                "message": "Honcho is not configured for this Hermes profile.",
            }
        )
        result["latency_ms"] = round((time.monotonic() - started) * 1000)
        return result
    if not config.enabled:
        result["state"] = "disabled"
        result["errors"].append(
            {
                "scope": "configuration",
                "message": "Honcho is configured but disabled for this Hermes profile.",
            }
        )
        result["latency_ms"] = round((time.monotonic() - started) * 1000)
        return result

    try:
        client = client_factory(config)
    except Exception as exc:
        result["state"] = "unreachable"
        result["errors"].append({"scope": "connection", "message": _safe_error(exc)})
        result["latency_ms"] = round((time.monotonic() - started) * 1000)
        return result

    successful_reads = 0

    def read(scope: str, operation: Callable[[], Any]) -> Any:
        nonlocal successful_reads
        try:
            value = operation()
            successful_reads += 1
            return value
        except Exception as exc:
            result["errors"].append({"scope": scope, "message": _safe_error(exc)})
            return None

    sessions_page = read("sessions", lambda: client.sessions(page=1, size=1))
    if sessions_page is not None:
        result["totals"]["sessions"] = sessions_page.total

    peers_page = read("peers", lambda: client.peers(page=1, size=1))
    if peers_page is not None:
        result["totals"]["peers"] = peers_page.total

    workspace_queue = read("queue", client.queue_status)
    if workspace_queue is not None:
        result["queue"] = _queue_payload(workspace_queue)

    session_id = _clean(request.stored_session_id) or _clean(request.runtime_session_id)
    metadata_loader = session_metadata_loader or _load_hermes_session_metadata
    session_metadata = metadata_loader(session_id)
    cwd = _clean(session_metadata.get("cwd")) or _clean(request.cwd)
    title = _clean(session_metadata.get("title")) or _clean(request.session_title)
    title_source = _clean(session_metadata.get("title_source")) or _clean(
        request.session_title_source
    )
    gateway_key = _clean(request.gateway_session_key)
    honcho_session_id = config.resolve_session_name(
        cwd=cwd,
        session_title=title,
        session_title_source=title_source,
        session_id=session_id,
        gateway_session_key=gateway_key,
    )
    result["chat"]["honcho_session_id"] = honcho_session_id
    result["chat"]["cwd"] = cwd
    result["chat"]["mapping_source"] = _mapping_source(
        config,
        cwd=cwd,
        title=title,
        title_source=title_source,
        session_id=session_id,
        gateway_key=gateway_key,
    )

    current_session = None
    if honcho_session_id:
        matching = read(
            "current_session",
            lambda: client.sessions(
                filters={"id": honcho_session_id}, page=1, size=1
            ),
        )
        if matching is not None:
            current_session = matching.items[0] if matching.items else None
            result["chat"]["found"] = current_session is not None

    if current_session is not None:
        messages = read(
            "current_session.messages",
            lambda: current_session.messages(page=1, size=1, reverse=True),
        )
        if messages is not None:
            result["chat"]["messages"] = messages.total
            if messages.items:
                latest = messages.items[0]
                result["chat"]["latest_message_at"] = _iso(latest.created_at)
                result["chat"]["latest_peer_id"] = latest.peer_id

        session_peers = read("current_session.peers", current_session.peers)
        if session_peers is not None:
            peer_ids = sorted({peer.id for peer in session_peers})
            result["chat"]["peers"] = peer_ids

            if config.peer_name:
                observer = next(
                    (peer for peer in session_peers if peer.id == config.ai_peer), None
                )
                if observer is not None:
                    conclusions = read(
                        "conclusions",
                        lambda: observer.conclusions_of(config.peer_name).list(
                            page=1, size=1
                        ),
                    )
                    if conclusions is not None:
                        result["totals"]["conclusions"] = conclusions.total

        session_queue = read("current_session.queue", current_session.queue_status)
        if session_queue is not None:
            result["chat"]["queue"] = _queue_payload(session_queue)

    result["ok"] = successful_reads > 0
    result["state"] = "connected" if result["ok"] else "unreachable"
    result["latency_ms"] = round((time.monotonic() - started) * 1000)
    return result


@router.post("/snapshot")
async def snapshot(request: SnapshotRequest) -> dict[str, Any]:
    """Return a safe point-in-time view for the currently focused desktop chat."""

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_collect_snapshot, request),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        return {
            "ok": False,
            "state": "unreachable",
            "version": PLUGIN_VERSION,
            "checked_at": dt.datetime.now(dt.timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "latency_ms": REQUEST_TIMEOUT_SECONDS * 1000,
            "profile": _clean(request.profile) or "default",
            "errors": [
                {
                    "scope": "connection",
                    "message": "Honcho did not respond before the request timed out.",
                }
            ],
        }
    except Exception as exc:
        return {
            "ok": False,
            "state": "error",
            "version": PLUGIN_VERSION,
            "checked_at": dt.datetime.now(dt.timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "latency_ms": 0,
            "profile": _clean(request.profile) or "default",
            "errors": [{"scope": "plugin", "message": _safe_error(exc)}],
        }
