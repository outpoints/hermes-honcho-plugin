"""Profile-aware, read-only Honcho metrics for the Hermes desktop plugin."""

from __future__ import annotations

import asyncio
import datetime as dt
import importlib.metadata
import inspect
import re
import secrets
import threading
import time
from typing import Any, Callable, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field, field_validator

router = APIRouter()

PLUGIN_VERSION = "0.3.0"
REQUEST_TIMEOUT_SECONDS = 20
UPLOAD_TIMEOUT_SECONDS = 120
UPLOAD_TICKET_TTL_SECONDS = 120
HONCHO_DEFAULT_MAX_FILE_SIZE = 5_242_880
SUPPORTED_UPLOAD_TYPES = {"application/json", "application/pdf"}
_upload_ticket_lock = threading.Lock()
_upload_tickets: dict[str, dict[str, Any]] = {}


def _store_upload_ticket(payload: dict[str, Any]) -> str:
    now = time.time()
    token = secrets.token_urlsafe(24)
    with _upload_ticket_lock:
        expired = [
            key
            for key, candidate in _upload_tickets.items()
            if float(candidate.get("expires_at", 0)) <= now
        ]
        for key in expired:
            _upload_tickets.pop(key, None)
        _upload_tickets[token] = payload
    return token


def _take_upload_ticket(token: str) -> dict[str, Any] | None:
    with _upload_ticket_lock:
        payload = _upload_tickets.pop(token, None)
    if payload is None or float(payload.get("expires_at", 0)) <= time.time():
        return None
    return payload


class SnapshotRequest(BaseModel):
    """Desktop context needed to resolve the same Honcho session as Hermes."""

    model_config = ConfigDict(extra="forbid")

    profile: str | None = Field(default=None, max_length=128)
    focused_profile: str | None = Field(default=None, max_length=128)
    connection_id: str | None = Field(default=None, max_length=256)
    focused_connection_id: str | None = Field(default=None, max_length=256)
    runtime_session_id: str | None = Field(default=None, max_length=256)
    stored_session_id: str | None = Field(default=None, max_length=256)
    cwd: str | None = Field(default=None, max_length=4096)
    session_title: str | None = Field(default=None, max_length=512)
    session_title_source: str | None = Field(default=None, max_length=64)
    gateway_session_key: str | None = Field(default=None, max_length=512)


class MessagesRequest(SnapshotRequest):
    """A bounded page of messages for the resolved focused session."""

    page: int = Field(default=1, ge=1, le=10_000)
    size: int = Field(default=25, ge=1, le=100)


class ConclusionsRequest(SnapshotRequest):
    """A bounded page of AI-observer conclusions about the configured user."""

    scope: Literal["current", "all"] = "current"
    page: int = Field(default=1, ge=1, le=10_000)
    size: int = Field(default=25, ge=1, le=100)


class ContextRequest(SnapshotRequest):
    """A focused context preview using the installed Honcho context APIs."""

    target_peer: str | None = Field(default=None, max_length=256)
    token_budget: int = Field(default=2048, ge=256, le=32_000)


class SearchRequest(SnapshotRequest):
    """A bounded, explicitly triggered Honcho message search."""

    scope: Literal["session", "peer", "workspace", "honcho"] = "session"
    scope_id: str | None = Field(default=None, min_length=1, max_length=256)
    query: str = Field(min_length=1, max_length=2000)
    limit: int = Field(default=20, ge=1, le=100)

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("query must not be blank")
        return cleaned


class ScopesRequest(SnapshotRequest):
    """A bounded page of existing Honcho visibility scopes."""

    page: int = Field(default=1, ge=1, le=10_000)
    size: int = Field(default=25, ge=1, le=100)


class ActivityRequest(SnapshotRequest):
    """Queue and reasoning activity for the focused Honcho session."""


class UploadTicketRequest(SnapshotRequest):
    """A confirmed local file selection bound to the focused Honcho session."""

    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=127)
    size: int = Field(ge=1)
    source_kind: Literal["file", "text"]

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        cleaned = value.strip()
        forbidden = ("/", "\\", "\x00", "\r", "\n")
        if not cleaned or any(character in cleaned for character in forbidden):
            raise ValueError("filename must be a plain local filename")
        return cleaned

    @field_validator("content_type")
    @classmethod
    def normalize_content_type(cls, value: str) -> str:
        return value.split(";", 1)[0].strip().lower()


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
        if ":" in host:
            host = f"[{host}]"
        if parsed.port:
            host = f"{host}:{parsed.port}"
        path = parsed.path.rstrip("/")
        return f"{parsed.scheme or 'http'}://{host}{path}"
    except (TypeError, ValueError):
        return "custom endpoint"


_BEARER_RE = re.compile(r"(?i)(?:bearer|basic)\s+[a-z0-9._~+/=-]+")
_SECRET_ASSIGNMENT_RE = re.compile(
    r'''(?i)(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}&]+)'''
)
_SECRET_QUERY_RE = re.compile(
    r"(?i)(api[_-]?key|access[_-]?token|token|secret)=([^&\s]+)"
)
_URL_USERINFO_RE = re.compile(r"(https?://)[^/@\s]+@", re.IGNORECASE)
_SECRET_KEY_RE = re.compile(
    r"(?i)(api[_-]?key|access[_-]?token|authorization|bearer|cookie|password|secret|token)"
)
MAX_MESSAGE_CONTENT_CHARS = 25_000
MAX_METADATA_STRING_CHARS = 2_000


def _redact_text(value: str, *, limit: int) -> str:
    message = value.replace("\x00", "")
    message = _BEARER_RE.sub("Bearer [redacted]", message)
    message = _SECRET_QUERY_RE.sub(lambda m: f"{m.group(1)}=[redacted]", message)
    message = _URL_USERINFO_RE.sub(r"\1[redacted]@", message)
    message = _SECRET_ASSIGNMENT_RE.sub(lambda m: f"{m.group(1)}[redacted]", message)
    return message[:limit]


def _safe_json(value: Any, *, depth: int = 0) -> Any:
    """Return a bounded JSON-compatible value with credential fields redacted."""

    if depth >= 5:
        return "[truncated]"
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for raw_key, item in list(value.items())[:100]:
            key = str(raw_key)[:128]
            result[key] = (
                "[redacted]"
                if _SECRET_KEY_RE.search(key)
                else _safe_json(item, depth=depth + 1)
            )
        return result
    if isinstance(value, (list, tuple)):
        return [_safe_json(item, depth=depth + 1) for item in list(value)[:100]]
    if isinstance(value, str):
        return _redact_text(value, limit=MAX_METADATA_STRING_CHARS)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _redact_text(str(value), limit=MAX_METADATA_STRING_CHARS)


def _safe_error(exc: BaseException) -> str:
    """Bound and redact SDK/network errors before returning them to the UI."""

    message = str(exc).replace("\n", " ").replace("\r", " ")
    return _redact_text(message, limit=240) or exc.__class__.__name__


def _queue_payload(status: Any) -> dict[str, int]:
    return {
        "total": int(getattr(status, "total_work_units", 0) or 0),
        "completed": int(getattr(status, "completed_work_units", 0) or 0),
        "in_progress": int(getattr(status, "in_progress_work_units", 0) or 0),
        "pending": int(getattr(status, "pending_work_units", 0) or 0),
    }


def _verify_existing_workspace(client: Any, workspace_id: str) -> bool:
    """Verify a workspace through the SDK's non-creating list operation.

    honcho-ai 2.2.0 calls a workspace get-or-create preflight from ordinary
    scoped reads. Listing workspaces is the one public operation that does not.
    After an exact match, mark this client as already verified so later reads
    skip that mutating preflight. Unknown SDK shapes fail closed.
    """

    list_workspaces = getattr(client, "workspaces", None)
    if not callable(list_workspaces):
        raise RuntimeError(
            "Installed honcho-ai cannot verify an existing workspace without creating it."
        )

    page = list_workspaces(filters={"id": workspace_id}, page=1, size=1)
    items = getattr(page, "items", None)
    if not isinstance(items, list):
        raise RuntimeError("Honcho returned a malformed workspace list response.")

    found = any(
        (item if isinstance(item, str) else getattr(item, "id", None)) == workspace_id
        for item in items
    )
    if not found:
        return False

    if hasattr(client, "_workspace_ensured"):
        client._workspace_ensured = True
    elif callable(getattr(client, "_ensure_workspace", None)):
        raise RuntimeError(
            "Installed honcho-ai workspace reads cannot be made safely in read-only mode."
        )
    return True


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
        # SessionDB resolves the worker's home at call time. Unlike the
        # dashboard's bootstrap helper, read_only never creates/heals a DB.
        from hermes_state import SessionDB

        db = SessionDB(read_only=True)
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


def _operation_base(request: SnapshotRequest) -> dict[str, Any]:
    return {
        "ok": False,
        "state": "checking",
        "checked_at": dt.datetime.now(dt.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "profile": _clean(request.profile) or "default",
        "connection_id": _clean(request.connection_id),
        "workspace_id": None,
        "session_id": None,
        "mapping_source": None,
        "found": None,
        "errors": [],
    }


def _is_route_mismatch(request: SnapshotRequest) -> bool:
    active_profile = _clean(request.profile)
    focused_profile = _clean(request.focused_profile)
    active_connection = _clean(request.connection_id)
    focused_connection = _clean(request.focused_connection_id)
    return bool(
        (active_profile and focused_profile and active_profile != focused_profile)
        or (
            active_connection
            and focused_connection
            and active_connection != focused_connection
        )
    )


def _existing_session(client: Any, session_id: str) -> Any | None:
    """Never trust server-side filtering as proof of an exact session match."""
    page = client.sessions(filters={"id": session_id}, page=1, size=1)
    items = getattr(page, "items", None)
    if not isinstance(items, list):
        raise RuntimeError("Honcho returned a malformed session list response.")
    if not items:
        return None
    if len(items) != 1 or getattr(items[0], "id", None) != session_id:
        raise RuntimeError("Honcho returned a session that did not match the requested ID.")
    return items[0]


def _resolve_focused_session(
    request: SnapshotRequest,
    *,
    config: Any,
    client: Any,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None,
    result: dict[str, Any],
) -> Any | None:
    session_id = _clean(request.stored_session_id) or _clean(request.runtime_session_id)
    metadata_loader = session_metadata_loader or _load_hermes_session_metadata
    session_metadata = metadata_loader(session_id)
    cwd = _clean(session_metadata.get("cwd")) or _clean(request.cwd)
    title = _clean(session_metadata.get("title")) or _clean(request.session_title)
    title_source = _clean(session_metadata.get("title_source")) or _clean(
        request.session_title_source
    )
    gateway_key = _clean(request.gateway_session_key)
    # An empty draft must not inherit the serve process's cwd from the resolver.
    honcho_session_id = None
    if any((cwd, title, session_id, gateway_key)) or config.session_strategy == "global":
        honcho_session_id = config.resolve_session_name(
            cwd=cwd,
            session_title=title,
            session_title_source=title_source,
            session_id=session_id,
            gateway_session_key=gateway_key,
        )
    result["session_id"] = honcho_session_id
    result["mapping_source"] = _mapping_source(
        config,
        cwd=cwd,
        title=title,
        title_source=title_source,
        session_id=session_id,
        gateway_key=gateway_key,
    )
    if not honcho_session_id:
        result["state"] = "session_unresolved"
        result["errors"].append(
            {"scope": "session", "message": "The focused chat has no resolvable Honcho session."}
        )
        return None

    current_session = _existing_session(client, honcho_session_id)
    result["found"] = current_session is not None
    if current_session is None:
        result["state"] = "session_missing"
        return None
    return current_session


def _prepare_read(
    request: SnapshotRequest,
    *,
    config_factory: Callable[[], Any] | None,
    client_factory: Callable[[Any], Any] | None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None,
) -> tuple[dict[str, Any], Any | None, Any | None, Any | None]:
    result = _operation_base(request)
    if config_factory is None or client_factory is None:
        from plugins.memory.honcho.client import (
            HonchoClientConfig,
            get_honcho_client,
        )

        config_factory = config_factory or HonchoClientConfig.from_global_config
        client_factory = client_factory or get_honcho_client

    config = config_factory()
    result["workspace_id"] = getattr(config, "workspace_id", None)
    if _is_route_mismatch(request):
        result["state"] = "route_mismatch"
        result["errors"].append(
            {
                "scope": "routing",
                "message": "Focused chat belongs to a different Hermes profile or connection; Honcho reads were blocked.",
            }
        )
        return result, config, None, None
    if not bool(getattr(config, "api_key", None) or getattr(config, "base_url", None)):
        result["state"] = "not_configured"
        result["errors"].append(
            {"scope": "configuration", "message": "Honcho is not configured for this Hermes profile."}
        )
        return result, config, None, None
    if not bool(getattr(config, "enabled", False)):
        result["state"] = "disabled"
        result["errors"].append(
            {"scope": "configuration", "message": "Honcho is configured but disabled for this Hermes profile."}
        )
        return result, config, None, None

    try:
        client = client_factory(config)
        if not _verify_existing_workspace(client, config.workspace_id):
            result["state"] = "workspace_missing"
            result["errors"].append(
                {
                    "scope": "workspace",
                    "message": "The configured Honcho workspace does not exist; read-only mode will not create it.",
                }
            )
            return result, config, client, None
        current_session = _resolve_focused_session(
            request,
            config=config,
            client=client,
            session_metadata_loader=session_metadata_loader,
            result=result,
        )
    except Exception as exc:
        result["state"] = "unreachable"
        result["errors"].append({"scope": "session", "message": _safe_error(exc)})
        return result, config, locals().get("client"), None

    if current_session is not None:
        result["ok"] = True
        result["state"] = "connected"
    return result, config, client, current_session


def _message_payload(message: Any) -> dict[str, Any]:
    required = ("id", "content", "peer_id", "session_id", "created_at")
    if any(not hasattr(message, field) for field in required):
        raise ValueError("Honcho returned a malformed message item.")
    raw_content = str(message.content or "")
    return {
        "id": str(message.id),
        "content": raw_content[:MAX_MESSAGE_CONTENT_CHARS],
        "content_truncated": len(raw_content) > MAX_MESSAGE_CONTENT_CHARS,
        "peer_id": str(message.peer_id),
        "session_id": str(message.session_id),
        "created_at": _iso(message.created_at),
        "token_count": getattr(message, "token_count", None),
        "metadata": _safe_json(getattr(message, "metadata", {}) or {}),
    }


def _is_supported_upload_type(content_type: str) -> bool:
    return content_type in SUPPORTED_UPLOAD_TYPES or content_type.startswith("text/")


def _collect_upload_ticket(
    request: UploadTicketRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
    ticket_store: Callable[[dict[str, Any]], str] | None = None,
) -> dict[str, Any]:
    result, config, _client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    result.update(
        {
            "ticket": None,
            "expires_at": None,
            "target": {
                "workspace_id": result.get("workspace_id"),
                "session_id": result.get("session_id"),
                "peer_id": getattr(config, "peer_name", None),
            },
            "file": {
                "filename": request.filename,
                "content_type": request.content_type,
                "size": request.size,
                "source_kind": request.source_kind,
            },
            "capabilities": {
                "upload_file": False,
                "exact_message_readback": False,
                "honcho_default_max_file_size": HONCHO_DEFAULT_MAX_FILE_SIZE,
                "server_max_file_size": None,
            },
        }
    )
    if current_session is None:
        return result
    if not _is_supported_upload_type(request.content_type):
        result["ok"] = False
        result["state"] = "unsupported_file_type"
        result["errors"].append(
            {
                "scope": "upload.file",
                "message": "Honcho file ingestion supports PDF, JSON, and text content.",
            }
        )
        return result
    upload_file = getattr(current_session, "upload_file", None)
    get_message = getattr(current_session, "get_message", None)
    result["capabilities"]["upload_file"] = callable(upload_file)
    result["capabilities"]["exact_message_readback"] = callable(get_message)
    if not callable(upload_file) or not callable(get_message):
        result["ok"] = False
        result["state"] = "unsupported_sdk"
        result["errors"].append(
            {
                "scope": "upload.sdk",
                "message": "The installed honcho-ai SDK does not expose upload with exact message readback.",
            }
        )
        return result

    peer_id = _clean(getattr(config, "peer_name", None))
    peers = current_session.peers()
    peer_ids = {
        str(peer if isinstance(peer, str) else getattr(peer, "id", ""))
        for peer in peers
    }
    if not peer_id or peer_id not in peer_ids:
        result["ok"] = False
        result["state"] = "peer_unavailable"
        result["errors"].append(
            {
                "scope": "upload.peer",
                "message": "The configured user peer is not attached to the focused Honcho session.",
            }
        )
        return result
    ticket_store = ticket_store or _store_upload_ticket

    expires_at = time.time() + UPLOAD_TICKET_TTL_SECONDS
    ticket_payload = {
        "request": request.model_dump(),
        "workspace_id": result["workspace_id"],
        "session_id": result["session_id"],
        "peer_id": peer_id,
        "filename": request.filename,
        "content_type": request.content_type,
        "size": request.size,
        "source_kind": request.source_kind,
        "expires_at": expires_at,
    }
    result["ticket"] = ticket_store(ticket_payload)
    result["expires_at"] = dt.datetime.fromtimestamp(
        expires_at, tz=dt.timezone.utc
    ).isoformat().replace("+00:00", "Z")
    result["ok"] = True
    result["state"] = "ready"
    return result


def _collect_upload(
    ticket: dict[str, Any],
    *,
    filename: str,
    content_type: str,
    content: bytes,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    request = UploadTicketRequest.model_validate(ticket["request"])
    result, config, _client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    result.update(
        {
            "committed": False,
            "created_count": 0,
            "created": [],
            "file": {
                "filename": filename,
                "content_type": content_type,
                "size": len(content),
                "source_kind": ticket.get("source_kind"),
            },
            "verified_count": 0,
            "target": {
                "workspace_id": ticket.get("workspace_id"),
                "session_id": ticket.get("session_id"),
                "peer_id": ticket.get("peer_id"),
            },
        }
    )
    if current_session is None:
        return result

    expected = (
        ticket.get("workspace_id"),
        ticket.get("session_id"),
        ticket.get("peer_id"),
        ticket.get("filename"),
        ticket.get("content_type"),
        ticket.get("size"),
    )
    actual = (
        result.get("workspace_id"),
        result.get("session_id"),
        _clean(getattr(config, "peer_name", None)),
        filename,
        content_type,
        len(content),
    )
    if expected != actual:
        result["ok"] = False
        result["state"] = "ticket_mismatch"
        result["errors"].append(
            {"scope": "upload.ticket", "message": "The selected file no longer matches the confirmed upload target."}
        )
        return result

    peer_id = str(ticket["peer_id"])
    peer_ids = {
        str(peer if isinstance(peer, str) else getattr(peer, "id", ""))
        for peer in current_session.peers()
    }
    if peer_id not in peer_ids:
        result["ok"] = False
        result["state"] = "peer_unavailable"
        result["errors"].append(
            {"scope": "upload.peer", "message": "The confirmed user peer is no longer attached to this session."}
        )
        return result

    try:
        # A lost response is not evidence of a failed non-idempotent write.
        result["committed"] = None
        uploaded = current_session.upload_file(
            file=(filename, content, content_type),
            peer=peer_id,
            metadata={
                "source": "hermes-desktop",
                "source_kind": str(ticket.get("source_kind") or "file"),
            },
        )
        if not isinstance(uploaded, list) or not uploaded:
            raise RuntimeError("Honcho returned no created messages for the upload.")
        result["committed"] = True
        result["created_count"] = len(uploaded)

        for created in uploaded:
            message_id = str(getattr(created, "id", ""))
            if not message_id:
                raise RuntimeError("Honcho returned a created message without an ID.")
            readback = current_session.get_message(message_id)
            if (
                str(getattr(readback, "id", "")) != message_id
                or str(getattr(readback, "session_id", "")) != str(ticket["session_id"])
                or str(getattr(readback, "peer_id", "")) != peer_id
            ):
                raise RuntimeError("Created message readback did not match the confirmed session and peer.")
            result["created"].append(_message_payload(readback))
            result["verified_count"] = len(result["created"])
        result.update(
            {
                "ok": True,
                "state": "verified",
            }
        )
    except Exception as exc:
        result["ok"] = False
        result["state"] = "verification_failed" if result["committed"] else "outcome_unknown"
        result["errors"].append({
            "scope": "upload",
            "message": f"{_safe_error(exc)} Check this session's Messages before retrying.",
        })
    return result


def _collect_messages(
    request: MessagesRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    result, _config, _client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    result.update(
        {"page": request.page, "size": request.size, "pages": 0, "total": 0, "items": []}
    )
    if current_session is None:
        return result

    try:
        page = current_session.messages(
            page=request.page, size=request.size, reverse=True
        )
        items = getattr(page, "items", None)
        if not isinstance(items, list):
            raise RuntimeError("Honcho returned a malformed message page.")
        safe_items = []
        for item in items[: request.size]:
            try:
                safe_items.append(_message_payload(item))
            except Exception as exc:
                result["errors"].append(
                    {"scope": "messages.item", "message": _safe_error(exc)}
                )
        result.update(
            {
                "page": int(getattr(page, "page", request.page) or request.page),
                "size": int(getattr(page, "size", request.size) or request.size),
                "pages": int(getattr(page, "pages", 0) or 0),
                "total": int(getattr(page, "total", len(safe_items)) or 0),
                "items": safe_items,
            }
        )
    except Exception as exc:
        result["ok"] = False
        result["state"] = "unavailable"
        result["errors"].append({"scope": "messages", "message": _safe_error(exc)})
    return result


def _collect_activity(
    request: ActivityRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    result, _config, client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    try:
        sdk_version = importlib.metadata.version("honcho-ai")
    except importlib.metadata.PackageNotFoundError:
        sdk_version = None
    result.update(
        {
            "sdk_version": sdk_version,
            "workspace_queue": None,
            "session_queue": None,
            "failed": None,
            "recent_tasks": [],
            "stale_at": result["checked_at"],
            "capabilities": {
                "aggregate_queue": False,
                "failed_task_detail": False,
                "recent_task_detail": False,
            },
            "capability_note": (
                "The installed Honcho queue API exposes aggregate totals only; "
                "failed counts and recent task or error records are unavailable."
            ),
        }
    )
    if current_session is None:
        return result

    successful_reads = 0
    try:
        queue_status = getattr(client, "queue_status", None)
        if not callable(queue_status):
            raise RuntimeError("Installed honcho-ai does not expose workspace queue status.")
        status = queue_status()
        result["workspace_queue"] = _queue_payload(status)
        result["capabilities"]["aggregate_queue"] = True
        if hasattr(status, "failed_work_units"):
            result["failed"] = int(getattr(status, "failed_work_units", 0) or 0)
            result["capabilities"]["failed_task_detail"] = True
        successful_reads += 1
    except Exception as exc:
        result["errors"].append(
            {"scope": "activity.workspace", "message": _safe_error(exc)}
        )

    try:
        queue_status = getattr(current_session, "queue_status", None)
        if not callable(queue_status):
            raise RuntimeError("Installed honcho-ai does not expose session queue status.")
        result["session_queue"] = _queue_payload(queue_status())
        successful_reads += 1
    except Exception as exc:
        result["errors"].append(
            {"scope": "activity.session", "message": _safe_error(exc)}
        )

    if successful_reads:
        result["ok"] = True
        result["state"] = "partial" if result["errors"] else "connected"
    else:
        result["ok"] = False
        result["state"] = "unavailable"
    return result


def _existing_scope(client: Any, scope_id: str) -> bool:
    """Never provision recall boundaries or treat a partial list as absence."""
    get_scope = getattr(client, "get_scope", None)
    if callable(get_scope):
        try:
            scope = get_scope(scope_id)
        except Exception as exc:
            if getattr(exc, "status", None) == 404:
                return False
            raise
        if str(getattr(scope, "id", "")) != scope_id:
            raise RuntimeError("Honcho returned a mismatched scope.")
        return True

    # SDK 2.4 has only the non-creating list API. Bound work on large fleets,
    # reporting an incomplete lookup instead of falsely claiming absence.
    for page_number in range(1, 101):
        page = client.scopes(page=page_number, size=100)
        items = getattr(page, "items", None)
        if not isinstance(items, list):
            raise RuntimeError("Honcho returned a malformed scope page.")
        if any(str(getattr(item, "id", "")) == scope_id for item in items):
            return True
        if page_number >= int(getattr(page, "pages", 0) or 0):
            return False
    raise RuntimeError("Scope lookup exceeded its page budget; existence is unknown.")


def _collect_search(
    request: SearchRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    result, config, client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    result.update(
        {
            "scope": request.scope,
            "scope_id": request.scope_id,
            "query": request.query,
            "limit": request.limit,
            "target_peer_id": getattr(config, "peer_name", None),
            "ordering": "honcho_relevance",
            "items": [],
        }
    )
    if current_session is None:
        return result

    try:
        operation_kwargs: dict[str, Any] = {}
        if request.scope == "session":
            operation = getattr(current_session, "search", None)
        elif request.scope == "peer":
            peer_id = _clean(getattr(config, "peer_name", None))
            list_peers = getattr(current_session, "peers", None)
            if not peer_id or not callable(list_peers):
                result["ok"] = False
                result["state"] = "peer_unavailable"
                result["errors"].append(
                    {
                        "scope": "search",
                        "message": "The configured user peer could not be resolved safely.",
                    }
                )
                return result
            peers = list_peers()
            if not isinstance(peers, list):
                raise RuntimeError("Honcho returned a malformed session peer response.")
            peer = next(
                (item for item in peers if str(getattr(item, "id", "")) == peer_id),
                None,
            )
            if peer is None:
                result["ok"] = False
                result["state"] = "peer_unavailable"
                result["errors"].append(
                    {
                        "scope": "search",
                        "message": "The configured user peer is not attached to this Honcho session.",
                    }
                )
                return result
            operation = getattr(peer, "search", None)
        elif request.scope == "workspace":
            operation = getattr(client, "search", None)
        else:
            scope_id = _clean(request.scope_id)
            list_scopes = getattr(client, "scopes", None)
            operation = getattr(client, "search", None)
            if not scope_id:
                result["ok"] = False
                result["state"] = "invalid_scope"
                result["errors"].append(
                    {"scope": "search.scope", "message": "Select an existing Honcho scope."}
                )
                return result
            if not callable(list_scopes) or not callable(operation) or not _supports_parameter(
                operation, "scope"
            ):
                result["ok"] = False
                result["state"] = "unsupported_sdk"
                result["errors"].append(
                    {
                        "scope": "search.scope",
                        "message": "The installed honcho-ai SDK does not expose scope-qualified search.",
                    }
                )
                return result
            if not _existing_scope(client, scope_id):
                result["ok"] = False
                result["state"] = "scope_missing"
                result["errors"].append(
                    {"scope": "search.scope", "message": "The selected Honcho scope does not exist."}
                )
                return result
            operation_kwargs["scope"] = scope_id

        if not callable(operation) or any(
            not _supports_parameter(operation, name) for name in ("query", "limit")
        ):
            raise RuntimeError(
                f"Installed honcho-ai does not support {request.scope} search."
            )
        items = operation(query=request.query, limit=request.limit, **operation_kwargs)
        if not isinstance(items, list):
            raise RuntimeError("Honcho returned a malformed search response.")
        safe_items = []
        for rank, item in enumerate(items[: request.limit], start=1):
            try:
                payload = _message_payload(item)
                payload.update({"rank": rank, "relevance_score": None})
                safe_items.append(payload)
            except Exception as exc:
                result["errors"].append(
                    {"scope": "search.item", "message": _safe_error(exc)}
                )
        result["items"] = safe_items
        result["ok"] = True
        result["state"] = "partial" if result["errors"] else "connected"
    except Exception as exc:
        result["ok"] = False
        result["state"] = "unavailable"
        result["errors"].append({"scope": "search", "message": _safe_error(exc)})
    return result


def _collect_scopes(
    request: ScopesRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    result, _config, client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    result.update(
        {
            "page": request.page,
            "size": request.size,
            "pages": 0,
            "total": 0,
            "items": [],
            "capabilities": {"scope_listing": False, "scope_search": False},
        }
    )
    if current_session is None:
        return result

    try:
        operation = getattr(client, "scopes", None)
        search = getattr(client, "search", None)
        if not callable(operation) or any(
            not _supports_parameter(operation, name) for name in ("page", "size")
        ):
            result["ok"] = False
            result["state"] = "unsupported_sdk"
            result["errors"].append(
                {
                    "scope": "scopes.sdk",
                    "message": "The installed honcho-ai SDK does not expose read-only scope listing.",
                }
            )
            return result
        page = operation(page=request.page, size=request.size)
        items = getattr(page, "items", None)
        if not isinstance(items, list):
            raise RuntimeError("Honcho returned a malformed scope page.")
        result["capabilities"]["scope_listing"] = True
        result["capabilities"]["scope_search"] = bool(
            callable(search) and _supports_parameter(search, "scope")
        )
        safe_items = []
        for item in items[: request.size]:
            if not hasattr(item, "id"):
                result["errors"].append(
                    {"scope": "scopes.item", "message": "Honcho returned a malformed scope item."}
                )
                continue
            safe_items.append(
                {
                    "id": str(item.id),
                    "workspace_id": str(getattr(item, "workspace_id", result["workspace_id"])),
                    "created_at": _iso(getattr(item, "created_at", None)),
                    "metadata": _safe_json(getattr(item, "metadata", None) or {}),
                }
            )
        result.update(
            {
                "page": int(getattr(page, "page", request.page) or request.page),
                "size": int(getattr(page, "size", request.size) or request.size),
                "pages": int(getattr(page, "pages", 0) or 0),
                "total": int(getattr(page, "total", len(safe_items)) or 0),
                "items": safe_items,
                "ok": True,
                "state": "partial" if result["errors"] else "connected",
            }
        )
    except Exception as exc:
        result["ok"] = False
        result["state"] = "unavailable"
        result["errors"].append({"scope": "scopes", "message": _safe_error(exc)})
    return result


def _collect_context(
    request: ContextRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    result, config, _client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    target_id = _clean(request.target_peer) or _clean(
        getattr(config, "peer_name", None)
    )
    observer_id = (
        _clean(getattr(config, "ai_peer", None))
        if getattr(config, "ai_observe_others", True)
        else target_id
    )
    result.update(
        {
            "target_peer_id": target_id,
            "observer_peer_id": observer_id,
            "token_budget": request.token_budget,
            "session": None,
            "peer_context": None,
            "session_representation": None,
            "peer_card": [],
            "layers": {
                "peer_card": False,
                "conclusions": False,
                "summaries": False,
                "messages": False,
            },
            "capabilities": {"native_session_scope": False},
            "preview": None,
            "copy_text": "",
            "character_count": 0,
            "token_estimate": 0,
            "scope_explanation": (
                "Session context is limited to the resolved Honcho session. "
                "Peer context and the peer card are workspace-wide memory for the target peer."
            ),
        }
    )
    if current_session is None:
        return result
    if not target_id or not observer_id:
        result["ok"] = False
        result["state"] = "peer_unavailable"
        result["errors"].append(
            {
                "scope": "context",
                "message": "The context target or observer peer is not configured.",
            }
        )
        return result

    try:
        list_peers = getattr(current_session, "peers", None)
        if not callable(list_peers):
            raise RuntimeError("Installed honcho-ai does not expose session peers.")
        peers = list_peers()
        if not isinstance(peers, list):
            raise RuntimeError("Honcho returned a malformed session peer response.")
        by_id = {str(getattr(peer, "id", "")): peer for peer in peers}
    except Exception as exc:
        result["ok"] = False
        result["state"] = "unavailable"
        result["errors"].append({"scope": "context.peers", "message": _safe_error(exc)})
        return result

    target = by_id.get(target_id)
    observer = by_id.get(observer_id)
    if target is None or observer is None:
        result["ok"] = False
        result["state"] = "peer_unavailable"
        result["errors"].append(
            {
                "scope": "context",
                "message": "The selected target or observer is not attached to this Honcho session.",
            }
        )
        return result

    successful_reads = 0
    session_context = None
    try:
        context_operation = getattr(current_session, "context", None)
        required = ("summary", "tokens", "peer_target", "peer_perspective")
        if not callable(context_operation) or any(
            not _supports_parameter(context_operation, name) for name in required
        ):
            raise RuntimeError(
                "Installed honcho-ai does not support bounded focused-session context."
            )
        context_kwargs = {
            "summary": True,
            "tokens": request.token_budget,
            "peer_target": target_id,
            "peer_perspective": observer_id,
        }
        if _supports_parameter(context_operation, "limit_to_session"):
            context_kwargs["limit_to_session"] = True
            result["capabilities"]["native_session_scope"] = True
            result["scope_explanation"] = (
                "Session context uses Honcho's native session boundary for the resolved "
                "session. Peer context and the peer card remain workspace-wide memory "
                "for the target peer."
            )
        session_context = context_operation(**context_kwargs)
        raw_messages = getattr(session_context, "messages", []) or []
        if not isinstance(raw_messages, list):
            raise RuntimeError("Honcho returned malformed context messages.")
        messages = []
        for item in raw_messages[:100]:
            try:
                messages.append(_message_payload(item))
            except Exception as exc:
                result["errors"].append(
                    {"scope": "context.message", "message": _safe_error(exc)}
                )
        raw_summary = getattr(session_context, "summary", None)
        summary = str(getattr(raw_summary, "content", raw_summary) or "")
        representation = str(
            getattr(session_context, "peer_representation", None)
            or getattr(session_context, "representation", "") or ""
        )
        result["session"] = {
            "summary": summary[:MAX_MESSAGE_CONTENT_CHARS],
            "summary_truncated": len(summary) > MAX_MESSAGE_CONTENT_CHARS,
            "representation": representation[:MAX_MESSAGE_CONTENT_CHARS],
            "representation_truncated": len(representation)
            > MAX_MESSAGE_CONTENT_CHARS,
            "messages": messages,
            # SessionContext does not expose a total token count in SDK 2.x.
            # The summary count alone is not a total for all context layers.
            "token_count": getattr(session_context, "token_count", None),
        }
        result["layers"]["summaries"] = bool(summary)
        result["layers"]["conclusions"] = bool(representation)
        result["layers"]["messages"] = bool(messages)
        successful_reads += 1
    except Exception as exc:
        result["errors"].append(
            {"scope": "context.session", "message": _safe_error(exc)}
        )

    try:
        peer_context_operation = getattr(observer, "context", None)
        if not callable(peer_context_operation) or not _supports_parameter(
            peer_context_operation, "target"
        ):
            raise RuntimeError("Installed honcho-ai does not expose peer context.")
        raw_peer_context = peer_context_operation(target=target_id)
        peer_context = str(
            getattr(raw_peer_context, "representation", raw_peer_context) or ""
        )
        result["peer_context"] = peer_context[:MAX_MESSAGE_CONTENT_CHARS]
        successful_reads += 1
    except Exception as exc:
        result["errors"].append(
            {"scope": "context.peer", "message": _safe_error(exc)}
        )

    try:
        representation_operation = getattr(observer, "representation", None)
        if not callable(representation_operation) or any(
            not _supports_parameter(representation_operation, name)
            for name in ("session", "target")
        ):
            raise RuntimeError("Installed honcho-ai does not expose session representation.")
        representation = str(
            representation_operation(session=result["session_id"], target=target_id)
            or ""
        )
        result["session_representation"] = representation[
            :MAX_MESSAGE_CONTENT_CHARS
        ]
        result["layers"]["conclusions"] = bool(
            representation or result["layers"]["conclusions"]
        )
        successful_reads += 1
    except Exception as exc:
        result["errors"].append(
            {"scope": "context.representation", "message": _safe_error(exc)}
        )

    try:
        card_operation = getattr(target, "get_card", None)
        if not callable(card_operation):
            card_operation = getattr(target, "card", None)
        if not callable(card_operation):
            raise RuntimeError("Installed honcho-ai does not expose peer cards.")
        card = card_operation()
        if card is None:
            card = []
        if not isinstance(card, list):
            raise RuntimeError("Honcho returned a malformed peer card.")
        result["peer_card"] = [str(entry)[:4000] for entry in card[:100]]
        result["layers"]["peer_card"] = bool(result["peer_card"])
        successful_reads += 1
    except Exception as exc:
        result["errors"].append(
            {"scope": "context.peer_card", "message": _safe_error(exc)}
        )

    session_payload = result["session"] or {}
    copy_sections: list[str] = []
    seen_sections: set[str] = set()

    def append_copy_section(label: str, value: Any) -> None:
        content = str(value or "").strip()
        if not content or content in seen_sections:
            return
        seen_sections.add(content)
        copy_sections.append(f"[{label}]\n{content}")

    append_copy_section("SESSION REPRESENTATION", result["session_representation"])
    append_copy_section("SESSION CONTEXT", session_payload.get("representation"))
    append_copy_section("SESSION SUMMARY", session_payload.get("summary"))
    if session_payload.get("messages"):
        append_copy_section(
            "SESSION MESSAGES",
            "\n\n".join(
                f"{message['peer_id']}: {message['content']}"
                for message in session_payload["messages"]
            ),
        )
    append_copy_section("PEER CONTEXT", result["peer_context"])
    if result["peer_card"]:
        append_copy_section("PEER CARD", "\n".join(result["peer_card"]))
    result["copy_text"] = "\n\n".join(copy_sections)
    result["character_count"] = len(result["copy_text"])
    result["token_estimate"] = (
        (result["character_count"] + 3) // 4 if result["character_count"] else 0
    )
    result["preview"] = next(
        (
            value
            for value in (
                result["session_representation"],
                session_payload.get("representation"),
                session_payload.get("summary"),
                result["peer_context"],
            )
            if value
        ),
        None,
    )
    if successful_reads:
        result["ok"] = True
        result["state"] = "partial" if result["errors"] else "connected"
    else:
        result["ok"] = False
        result["state"] = "unavailable"
    return result


def _supports_parameter(operation: Callable[..., Any], name: str) -> bool:
    try:
        return name in inspect.signature(operation).parameters
    except (TypeError, ValueError):
        return False


def _conclusion_payload(item: Any, current_session_id: str) -> dict[str, Any]:
    required = (
        "id",
        "content",
        "observer_id",
        "observed_id",
        "created_at",
    )
    if any(not hasattr(item, field) for field in required):
        raise ValueError("Honcho returned a malformed conclusion item.")
    source_session = getattr(item, "session_id", None)
    content = str(item.content or "")
    source_ids = getattr(item, "source_ids", None)
    times_derived = getattr(item, "times_derived", None)
    if source_ids is not None and (
        not isinstance(source_ids, list)
        or any(not isinstance(source, str) for source in source_ids)
    ):
        raise ValueError("Honcho returned malformed conclusion source IDs.")
    if times_derived is not None and (
        type(times_derived) is not int or times_derived < 0
    ):
        raise ValueError("Honcho returned a malformed derivation count.")
    return {
        "id": str(item.id),
        "content": content[:MAX_MESSAGE_CONTENT_CHARS],
        "content_truncated": len(content) > MAX_MESSAGE_CONTENT_CHARS,
        "observer_id": str(item.observer_id),
        "observed_id": str(item.observed_id),
        "level": str(getattr(item, "level", "unknown") or "unknown"),
        "source_session_id": str(source_session) if source_session else None,
        # These are parent CONCLUSION IDs, not message IDs (Honcho 3.2).
        "source_ids": source_ids[:100] if source_ids is not None else None,
        "source_ids_truncated": bool(source_ids and len(source_ids) > 100),
        "times_derived": times_derived,
        "created_at": _iso(item.created_at),
        "belongs_to_current_session": source_session == current_session_id,
    }


def _collect_conclusions(
    request: ConclusionsRequest,
    *,
    config_factory: Callable[[], Any] | None = None,
    client_factory: Callable[[Any], Any] | None = None,
    session_metadata_loader: Callable[[str | None], dict[str, str]] | None = None,
) -> dict[str, Any]:
    result, config, _client, current_session = _prepare_read(
        request,
        config_factory=config_factory,
        client_factory=client_factory,
        session_metadata_loader=session_metadata_loader,
    )
    result.update(
        {
            "scope": request.scope,
            "observer_id": getattr(config, "ai_peer", None),
            "observed_id": getattr(config, "peer_name", None),
            "page": request.page,
            "size": request.size,
            "pages": 0,
            "total": 0,
            "items": [],
        }
    )
    if current_session is None:
        return result

    observer_id = _clean(getattr(config, "ai_peer", None))
    observed_id = _clean(getattr(config, "peer_name", None))
    if not observer_id or not observed_id:
        result["ok"] = False
        result["state"] = "peer_unavailable"
        result["errors"].append(
            {
                "scope": "conclusions",
                "message": "The configured AI observer and user peer could not be resolved safely.",
            }
        )
        return result

    try:
        list_peers = getattr(current_session, "peers", None)
        if not callable(list_peers):
            raise RuntimeError("Installed honcho-ai does not expose session peers.")
        peers = list_peers()
        if not isinstance(peers, list):
            raise RuntimeError("Honcho returned a malformed session peer response.")
        by_id = {str(getattr(peer, "id", "")): peer for peer in peers}
        observer = by_id.get(observer_id)
        if observer is None or observed_id not in by_id:
            result["ok"] = False
            result["state"] = "peer_unavailable"
            result["errors"].append(
                {
                    "scope": "conclusions",
                    "message": "The configured AI observer or user peer is not attached to this Honcho session.",
                }
            )
            return result

        conclusions_of = getattr(observer, "conclusions_of", None)
        if not callable(conclusions_of):
            raise RuntimeError("Installed honcho-ai does not expose conclusion provenance.")
        list_conclusions = getattr(conclusions_of(observed_id), "list", None)
        if not callable(list_conclusions):
            raise RuntimeError("Installed honcho-ai cannot list conclusions.")
        kwargs: dict[str, Any] = {"page": request.page, "size": request.size}
        if request.scope == "current":
            if not _supports_parameter(list_conclusions, "session"):
                raise RuntimeError(
                    "Installed honcho-ai cannot scope conclusions to the current session."
                )
            kwargs["session"] = result["session_id"]
        if _supports_parameter(list_conclusions, "reverse"):
            kwargs["reverse"] = True
        page = list_conclusions(**kwargs)
        items = getattr(page, "items", None)
        if not isinstance(items, list):
            raise RuntimeError("Honcho returned a malformed conclusion page.")
        safe_items = []
        for item in items[: request.size]:
            try:
                safe_items.append(_conclusion_payload(item, result["session_id"]))
            except Exception as exc:
                result["errors"].append(
                    {"scope": "conclusions.item", "message": _safe_error(exc)}
                )
        result.update(
            {
                "page": int(getattr(page, "page", request.page) or request.page),
                "size": int(getattr(page, "size", request.size) or request.size),
                "pages": int(getattr(page, "pages", 0) or 0),
                "total": int(getattr(page, "total", len(safe_items)) or 0),
                "items": safe_items,
            }
        )
    except Exception as exc:
        result["ok"] = False
        result["state"] = "unavailable"
        result["errors"].append(
            {"scope": "conclusions", "message": _safe_error(exc)}
        )
    return result


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
    active_profile = _clean(request.profile)
    focused_profile = _clean(request.focused_profile)
    active_connection = _clean(request.connection_id)
    focused_connection = _clean(request.focused_connection_id)
    if (
        active_profile
        and focused_profile
        and active_profile != focused_profile
    ) or (
        active_connection
        and focused_connection
        and active_connection != focused_connection
    ):
        result["state"] = "route_mismatch"
        result["errors"].append(
            {
                "scope": "routing",
                "message": "Focused chat belongs to a different Hermes profile or connection; Honcho reads were blocked.",
            }
        )
        result["latency_ms"] = round((time.monotonic() - started) * 1000)
        return result

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

    try:
        workspace_exists = _verify_existing_workspace(client, config.workspace_id)
    except Exception as exc:
        result["state"] = "unavailable"
        result["errors"].append(
            {"scope": "workspace", "message": _safe_error(exc)}
        )
        result["latency_ms"] = round((time.monotonic() - started) * 1000)
        return result
    if not workspace_exists:
        result["state"] = "workspace_missing"
        result["errors"].append(
            {
                "scope": "workspace",
                "message": "The configured Honcho workspace does not exist; read-only mode will not create it.",
            }
        )
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

    # Decode inside each guarded read too. A malformed metric must not discard
    # all the independently successful reads.
    result["totals"]["sessions"] = read("sessions", lambda: client.sessions(page=1, size=1).total)
    result["totals"]["peers"] = read("peers", lambda: client.peers(page=1, size=1).total)
    result["queue"] = read("queue", lambda: _queue_payload(client.queue_status()))

    session_id = _clean(request.stored_session_id) or _clean(request.runtime_session_id)
    metadata_loader = session_metadata_loader or _load_hermes_session_metadata
    session_metadata = metadata_loader(session_id)
    cwd = _clean(session_metadata.get("cwd")) or _clean(request.cwd)
    title = _clean(session_metadata.get("title")) or _clean(request.session_title)
    title_source = _clean(session_metadata.get("title_source")) or _clean(
        request.session_title_source
    )
    gateway_key = _clean(request.gateway_session_key)
    # An empty draft must not inherit the serve process's cwd from the resolver.
    honcho_session_id = None
    if any((cwd, title, session_id, gateway_key)) or config.session_strategy == "global":
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
        current_session = read(
            "current_session",
            lambda: _existing_session(client, honcho_session_id),
        )
        result["chat"]["found"] = current_session is not None

    if current_session is not None:
        def latest_messages() -> dict[str, Any]:
            page = current_session.messages(page=1, size=1, reverse=True)
            latest = page.items[0] if page.items else None
            return {
                "messages": page.total,
                "latest_message_at": _iso(latest.created_at) if latest else None,
                "latest_peer_id": latest.peer_id if latest else None,
            }

        messages = read("current_session.messages", latest_messages)
        if messages is not None:
            result["chat"].update(messages)

        session_peers = read("current_session.peers", lambda: {
            str(peer.id): peer for peer in current_session.peers()
        })
        if session_peers is not None:
            result["chat"]["peers"] = sorted(session_peers)

            if config.peer_name:
                observer = session_peers.get(config.ai_peer)
                if observer is not None:
                    conclusions = read(
                        "conclusions",
                        lambda: observer.conclusions_of(config.peer_name).list(
                            page=1, size=1
                        ).total,
                    )
                    if conclusions is not None:
                        result["totals"]["conclusions"] = conclusions

        result["chat"]["queue"] = read(
            "current_session.queue", lambda: _queue_payload(current_session.queue_status())
        )

    result["ok"] = successful_reads > 0
    result["state"] = ("partial" if result["errors"] else "connected") if result["ok"] else "unreachable"
    result["latency_ms"] = round((time.monotonic() - started) * 1000)
    return result


def _failure_payload(
    request: SnapshotRequest,
    *,
    state: str,
    scope: str,
    message: str,
    latency_ms: int,
) -> dict[str, Any]:
    return {
        "ok": False,
        "state": state,
        "version": PLUGIN_VERSION,
        "checked_at": dt.datetime.now(dt.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "latency_ms": latency_ms,
        "profile": _clean(request.profile) or "default",
        "errors": [{"scope": scope, "message": message}],
    }


def _collect_in_profile(
    profile: str | None,
    request: SnapshotRequest,
    operation: Callable[[Any], dict[str, Any]],
) -> dict[str, Any]:
    """Bind Hermes's routed home and credentials for the worker's full lifetime.

    ctx.rest routes to a profile-owned backend or supplies ?profile= on a
    shared backend. The JSON body is UI provenance, never a scope selector.
    Enter in the worker so a timed-out/cancelled await cannot tear down a
    scope while the synchronous SDK call is still running.
    """
    from hermes_cli.plugins_cmd import _get_disabled_set, _get_enabled_set
    from hermes_cli.profiles import get_active_profile_name
    from hermes_cli.web_server_profiles import _config_profile_scope, _is_current_profile

    # An already scoped host may supply a home ContextVar rather than a query.
    # Passing None to Hermes's helper would retain that home but bind LAUNCH
    # credentials, so name the inherited home explicitly when it is a profile.
    if _is_current_profile(profile):
        bound_profile = get_active_profile_name()
        if bound_profile != "custom":
            profile = bound_profile
    with _config_profile_scope(profile):
        backend_profile = get_active_profile_name()
        if _is_route_mismatch(request) or any(
            label and label != backend_profile
            for label in (_clean(request.profile), _clean(request.focused_profile))
        ):
            raise HTTPException(409, "Focused chat does not match the routed Hermes profile or connection.")
        # Core's mount/runtime gates protect the process home. A shared remote
        # can route to another home, which must independently enable the plugin.
        if (
            "hermes-honcho-plugin" not in _get_enabled_set()
            or "hermes-honcho-plugin" in _get_disabled_set()
        ):
            raise HTTPException(404, "Plugin not found")
        return operation(request.model_copy(update={"profile": backend_profile}))


async def _run_collector(
    request: SnapshotRequest,
    collector: Callable[[Any], dict[str, Any]],
    profile: str | None = None,
) -> dict[str, Any]:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_collect_in_profile, profile, request, collector),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        return _failure_payload(
            request,
            state="unreachable",
            scope="connection",
            message="Honcho did not respond before the request timed out.",
            latency_ms=REQUEST_TIMEOUT_SECONDS * 1000,
        )
    except Exception as exc:
        return _failure_payload(
            request,
            state="error",
            scope="plugin",
            message=_safe_error(exc),
            latency_ms=0,
        )


@router.post("/snapshot")
async def snapshot(request: SnapshotRequest, profile: str | None = None) -> dict[str, Any]:
    """Return a safe point-in-time view for the currently focused desktop chat."""

    return await _run_collector(request, _collect_snapshot, profile)


@router.post("/messages")
async def messages(request: MessagesRequest, profile: str | None = None) -> dict[str, Any]:
    """Return one newest-first page of messages for the resolved focused session."""

    return await _run_collector(request, _collect_messages, profile)


@router.post("/conclusions")
async def conclusions(request: ConclusionsRequest, profile: str | None = None) -> dict[str, Any]:
    """Return observer-to-user conclusions with explicit source provenance."""

    return await _run_collector(request, _collect_conclusions, profile)


@router.post("/context")
async def context(request: ContextRequest, profile: str | None = None) -> dict[str, Any]:
    """Return a bounded inspector view of the focused session's recall layers."""

    return await _run_collector(request, _collect_context, profile)


@router.post("/search")
async def search(request: SearchRequest, profile: str | None = None) -> dict[str, Any]:
    """Run an explicitly triggered Honcho-native scoped message search."""

    return await _run_collector(request, _collect_search, profile)


@router.post("/scopes")
async def scopes(request: ScopesRequest, profile: str | None = None) -> dict[str, Any]:
    """Return a bounded page of existing Honcho visibility scopes."""

    return await _run_collector(request, _collect_scopes, profile)


@router.post("/activity")
async def activity(request: ActivityRequest, profile: str | None = None) -> dict[str, Any]:
    """Return aggregate reasoning activity exposed by the installed SDK."""

    return await _run_collector(request, _collect_activity, profile)


@router.post("/upload-ticket")
async def upload_ticket(request: UploadTicketRequest, profile: str | None = None) -> dict[str, Any]:
    """Validate and bind a one-time upload to the existing focused session."""

    return await _run_collector(request, _collect_upload_ticket, profile)


@router.post("/uploads/{ticket}")
async def upload(
    ticket: str, file: UploadFile = File(...), profile: str | None = None,
) -> dict[str, Any]:
    """Consume one confirmed ticket and upload a single file to Honcho."""

    payload = _take_upload_ticket(ticket)
    if payload is None:
        await file.close()
        return {
            "ok": False,
            "state": "ticket_expired",
            "committed": False,
            "created_count": 0,
            "created": [],
            "errors": [
                {
                    "scope": "upload.ticket",
                    "message": "The upload confirmation expired or was already used.",
                }
            ],
        }

    request = UploadTicketRequest.model_validate(payload["request"])
    filename = str(file.filename or "file")
    content_type = str(file.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    try:
        content = await file.read(request.size + 1)
        if len(content) != request.size:
            result = _failure_payload(
                request, state="ticket_mismatch", scope="upload.ticket",
                message="The uploaded file size does not match the confirmed selection.", latency_ms=0,
            )
            result.update({"committed": False, "created_count": 0, "created": []})
            return result
        return await asyncio.wait_for(
            asyncio.to_thread(
                _collect_in_profile,
                profile,
                request,
                lambda _: _collect_upload(
                    payload,
                    filename=filename,
                    content_type=content_type,
                    content=content,
                ),
            ),
            timeout=UPLOAD_TIMEOUT_SECONDS,
        )
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        result = _failure_payload(
            request,
            state="outcome_unknown",
            scope="upload",
            message="Honcho did not confirm the upload before the timeout; do not retry without checking Messages.",
            latency_ms=UPLOAD_TIMEOUT_SECONDS * 1000,
        )
        result.update({"committed": None, "created_count": 0, "created": []})
        return result
    except Exception as exc:
        result = _failure_payload(
            request,
            state="upload_failed",
            scope="upload",
            message=_safe_error(exc),
            latency_ms=0,
        )
        result.update({"committed": False, "created_count": 0, "created": []})
        return result
    finally:
        await file.close()
