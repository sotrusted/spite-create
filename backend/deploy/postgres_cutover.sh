#!/usr/bin/env bash
# SQLite -> Postgres, Daphne -> uvicorn (3 workers). Aborts back to the old
# setup unless every table's row count matches after the copy.
set -euo pipefail
cd ~/cmim/backend
STAMP=$(date +%Y%m%d-%H%M%S)
PG=postgres:///cmim
UNIT=~/.config/systemd/user/cmim.service
PY=venv/bin/python

counts() {
  "$PY" manage.py shell -c "
from django.apps import apps
for m in sorted(apps.get_models(), key=lambda m: m._meta.label):
    if m._meta.app_label in ('posts', 'users', 'auth'):
        print(m._meta.label, m.objects.count())
"
}

restore_old() {
  echo "!! aborting: restoring previous setup"
  systemctl --user start cmim
  exit 1
}

echo "== stopping service"
systemctl --user stop cmim
cp db.sqlite3 "db.sqlite3.pre-postgres-$STAMP"
cp .env ".env.pre-postgres-$STAMP"
cp "$UNIT" "$UNIT.pre-uvicorn-$STAMP"

echo "== dumping SQLite"
counts > /tmp/cmim-counts-sqlite.txt
"$PY" manage.py dumpdata --natural-foreign --natural-primary \
  -e contenttypes -e auth.permission -e admin.logentry -e sessions \
  -o "/tmp/cmim-dump-$STAMP.json" || restore_old

echo "== loading Postgres"
DATABASE_URL=$PG "$PY" manage.py migrate --noinput > /tmp/cmim-migrate.log || restore_old
DATABASE_URL=$PG "$PY" manage.py loaddata "/tmp/cmim-dump-$STAMP.json" || restore_old
# loaddata writes explicit ids; advance every sequence past them or the next
# insert collides
DATABASE_URL=$PG "$PY" manage.py sqlsequencereset posts users auth | psql -q -d cmim || restore_old

echo "== verifying row counts"
DATABASE_URL=$PG counts > /tmp/cmim-counts-pg.txt
if ! diff /tmp/cmim-counts-sqlite.txt /tmp/cmim-counts-pg.txt; then
  echo "!! row counts differ"
  restore_old
fi
cat /tmp/cmim-counts-pg.txt

echo "== switching config"
printf '\nDATABASE_URL=%s\nCACHE_URL=redis://localhost:6379/4\n' "$PG" >> .env
sed -i \
  -e 's|^Description=.*|Description=Creative Minds Ideas Magazine backend (uvicorn)|' \
  -e 's|^ExecStart=.*|ExecStart=%h/cmim/backend/venv/bin/uvicorn tbd_backend.asgi:application --host 127.0.0.1 --port 8010 --workers 3 --lifespan off --no-server-header|' \
  "$UNIT"
systemctl --user daemon-reload
systemctl --user start cmim
sleep 5
systemctl --user is-active cmim
echo "== done ($STAMP). Rollback: restore .env.pre-postgres-$STAMP and $UNIT.pre-uvicorn-$STAMP, daemon-reload, restart"
