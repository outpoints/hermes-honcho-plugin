#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hermes_python="${HERMES_PYTHON:-python3}"

cd "$project_dir"

node --check desktop/plugin.js
node --check dashboard/dist/index.js
node --test tests/*.test.mjs

if [[ ! -x "$hermes_python" ]]; then
  hermes_python="$(command -v python3)"
fi

"$hermes_python" -m unittest discover -s tests -p 'test_*.py' -v
