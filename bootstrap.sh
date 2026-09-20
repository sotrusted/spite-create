#!/bin/bash
# One-time setup from a fresh clone. After this, ./dev.sh runs the stack.
set -e
cd "$(dirname "$0")"

echo "[bootstrap] backend venv + dependencies"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
uv venv backend/venv --python 3.12 2>/dev/null || uv venv backend/venv
uv pip install --python backend/venv/bin/python -r backend/requirements.txt

echo "[bootstrap] database"
(cd backend && ./venv/bin/python manage.py migrate)

echo "[bootstrap] frontend dependencies"
(cd frontend && npm install)

if ! command -v redis-server >/dev/null 2>&1; then
  echo "[bootstrap] NOTE: redis-server not found - install it (brew install redis"
  echo "            or apt install redis-server); dev.sh starts it automatically."
fi

echo "[bootstrap] done. Run ./dev.sh to start everything."
echo "            Production config template: backend/.env.example"
