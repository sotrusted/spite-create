#!/bin/bash
# One-time: turn on the support inbox (posts/inbound_email.py). On the box,
# with the Resend key already in ~/cmim/backend/.env:
#   1. enable receiving on the domain in Resend
#   2. create the webhook that calls /api/inbound-email/ (skipped if present)
#      and store its signing secret in .env as RESEND_WEBHOOK_SECRET
#   3. name the sender "Type Magazine" (was "Typing Magazine")
#   4. restart the service
# Prints the MX record Resend wants; that goes into Route 53 separately.
# Run after backend/deploy/deploy.sh has shipped the webhook code.
#   backend/deploy/setup_support_inbox.sh
set -euo pipefail
HOST=23.94.179.21

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/cmim/backend
ENV=.env
K=$(grep ^EMAIL_HOST_PASSWORD= "$ENV" | cut -d= -f2-)
DOMAIN=6072ca2f-6ea4-4590-965b-98bf1b284c39
ENDPOINT=https://api.creativemindsideasmagazine.com/api/inbound-email/
api() { curl -sS --fail-with-body -H "Authorization: Bearer $K" -H 'Content-Type: application/json' "$@"; }

api -X PATCH "https://api.resend.com/domains/$DOMAIN" -d '{"capabilities":{"receiving":"enabled"}}' >/dev/null
echo "receiving enabled"

if grep -q '^RESEND_WEBHOOK_SECRET=.' "$ENV"; then
  echo "webhook secret already in .env"
else
  SECRET=$(api -X POST https://api.resend.com/webhooks \
    -d "{\"endpoint\":\"$ENDPOINT\",\"events\":[\"email.received\"]}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["signing_secret"])')
  cp "$ENV" "$ENV.pre-inbox-$(date +%Y%m%d-%H%M%S)"
  echo "RESEND_WEBHOOK_SECRET=$SECRET" >> "$ENV"
  echo "webhook created, secret stored"
fi

sed -i 's/^DEFAULT_FROM_EMAIL=Typing Magazine/DEFAULT_FROM_EMAIL=Type Magazine/' "$ENV"
systemctl --user restart cmim
sleep 3
systemctl --user is-active cmim

echo "MX record to add:"
api "https://api.resend.com/domains/$DOMAIN" | python3 -c '
import json, sys
for r in json.load(sys.stdin).get("records", []):
    if r.get("type") == "MX":
        print(" ", r.get("record"), r.get("name"), r.get("value"), "priority", r.get("priority"), r.get("status"))'
REMOTE
