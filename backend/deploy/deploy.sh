#!/bin/bash
# Deploy the backend (and the shared fonts) to spite-prod: copy, test on the
# box, migrate, restart. Stops at the first failure, so nothing restarts on
# a red test run. The app update (OTA) goes out after this, never before.
#   backend/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=23.94.179.21

rsync -az \
  --exclude venv --exclude 'db.sqlite3*' --exclude media --exclude .env \
  --exclude '*.actual.png' --exclude __pycache__ \
  backend/ "$HOST:cmim/backend/"
rsync -az frontend/assets/fonts/ "$HOST:cmim/frontend/assets/fonts/"

ssh "$HOST" 'set -e
cd ~/cmim/backend
USE_S3=False venv/bin/python manage.py test posts
venv/bin/python manage.py migrate
systemctl --user restart cmim
sleep 3
systemctl --user is-active cmim'
echo "deployed"
