#!/bin/bash
# Before launch: back the database up, then hide every post so the feed
# starts empty. Nothing is deleted. Run after deploy.sh has shipped the
# hide_all_posts command.
#   backend/deploy/hide_all_posts.sh
# Left on the box, in ~/cmim/backups/:
#   cmim-<stamp>.dump          the whole database (restore: pg_restore -d cmim)
#   hidden-posts-<stamp>.txt   the ids hidden here
# To bring those posts back:
#   ssh 23.94.179.21 'cd ~/cmim/backend && venv/bin/python manage.py hide_all_posts --restore ~/cmim/backups/hidden-posts-<stamp>.txt'
set -euo pipefail
ssh 23.94.179.21 'set -euo pipefail
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/cmim/backups && chmod 700 ~/cmim/backups
pg_dump -Fc cmim > ~/cmim/backups/cmim-$stamp.dump
ls -la ~/cmim/backups/cmim-$stamp.dump
cd ~/cmim/backend
venv/bin/python manage.py hide_all_posts --apply > ~/cmim/backups/hidden-posts-$stamp.txt
echo "ids saved to ~/cmim/backups/hidden-posts-$stamp.txt"'
