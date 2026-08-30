"""Agent-side registration shim for the unified Hermes plugin package.

The operational backend is mounted from ``dashboard/plugin_api.py`` and the UI
from ``desktop/plugin.js``. Hermes's native plugin loader still requires a
package entry point for enabled user plugins, so registration is intentionally
empty.
"""

from __future__ import annotations

from typing import Any


def register(_ctx: Any) -> None:
    """Satisfy the native plugin contract; no agent tools or hooks are added."""
