#!/bin/bash
# One-time, after deploy.sh has shipped migration 0022: re-render the posts
# whose bounds were cut at the old 5:4 cap (see uncap_tall_posts).
#   backend/deploy/uncap_tall_posts.sh
set -euo pipefail
ssh 23.94.179.21 'cd ~/cmim/backend && venv/bin/python manage.py uncap_tall_posts'
