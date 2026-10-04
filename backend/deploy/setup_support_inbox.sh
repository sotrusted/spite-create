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
ssh 23.94.179.21 'bash ~/cmim/backend/deploy/support_inbox_remote.sh'
