#!/bin/bash
# Runs ON the box (deploy.sh copies it there): the one-time support inbox
# setup - see setup_support_inbox.sh, which just runs this over ssh.
#   ssh 23.94.179.21 'bash ~/cmim/backend/deploy/support_inbox_remote.sh'
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
