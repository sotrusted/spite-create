#!/usr/bin/env bash
# Point production media at Cloudflare R2. Run on the box with R2_ENDPOINT,
# R2_BUCKET, R2_PUBLIC_DOMAIN, R2_KEY and R2_SECRET in the environment, and
# deploy/s3_to_r2.py copied to /tmp/s3_to_r2.py. Stops the service for a final
# sync so no post lands in S3 after the copy, backs up .env, rewrites the
# storage settings, restarts; restores the backup if any step fails.
set -euo pipefail
cd ~/cmim/backend
STAMP=$(date +%Y%m%d-%H%M%S)
systemctl --user stop cmim
cp .env ".env.pre-r2-$STAMP"
chmod 600 ".env.pre-r2-$STAMP"
trap 'echo "!! failed - restoring .env and restarting"; cp ".env.pre-r2-$STAMP" .env; systemctl --user start cmim' ERR

# final sync, still reading S3 through the current .env
venv/bin/python /tmp/s3_to_r2.py

venv/bin/python - <<'PY'
import os
updates = {
    'AWS_STORAGE_BUCKET_NAME': os.environ['R2_BUCKET'],
    'AWS_ACCESS_KEY_ID': os.environ['R2_KEY'],
    'AWS_SECRET_ACCESS_KEY': os.environ['R2_SECRET'],
    'AWS_S3_REGION_NAME': 'auto',
    'AWS_S3_ENDPOINT_URL': os.environ['R2_ENDPOINT'],
    'AWS_S3_CUSTOM_DOMAIN': os.environ['R2_PUBLIC_DOMAIN'],
}
out, seen = [], set()
for line in open('.env').read().splitlines():
    key = line.split('=', 1)[0].strip()
    if key in updates:
        out.append(f'{key}={updates[key]}')
        seen.add(key)
    else:
        out.append(line)
out += [f'{k}={v}' for k, v in updates.items() if k not in seen]
open('.env', 'w').write('\n'.join(out) + '\n')
PY
chmod 600 .env

systemctl --user start cmim
sleep 5
systemctl --user is-active cmim
trap - ERR
echo "switched ($STAMP); rollback: cp .env.pre-r2-$STAMP .env && systemctl --user restart cmim"
