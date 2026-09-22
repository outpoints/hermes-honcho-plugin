#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hermes_python="${HERMES_PYTHON:-}"

cd "$project_dir"

node --check desktop/plugin.js
node --check dashboard/dist/index.js
node --test tests/*.test.mjs

if [[ -z "$hermes_python" ]] && command -v hermes >/dev/null 2>&1; then
  hermes_python="$(dirname "$(command -v hermes)")/python"
fi
if [[ -z "$hermes_python" ]]; then
  hermes_python="$(command -v python3)"
fi

if [[ ! -x "$hermes_python" ]]; then
  printf '%s\n' 'Set HERMES_PYTHON to the Python executable that runs Hermes.' >&2
  exit 1
fi

"$hermes_python" -m unittest discover -s tests -p 'test_*.py' -v
