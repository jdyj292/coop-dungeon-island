#!/bin/sh
# 관리자 명령 (docs/deploy.md 6장). install.sh가 /usr/local/bin/coop-admin 으로 둔다
# 사용: sudo coop-admin users · suspend <닉네임> [--days N] · unsuspend · kick · backup
set -e
[ "$(id -u)" -eq 0 ] || { echo "sudo coop-admin $*"; exit 1; }
cd /opt/coop-dungeon-island
exec runuser -u coopgame -- sh -c 'set -a; . /etc/coop-dungeon-island.env; set +a; umask 077; exec node admin.mjs "$@"' coop-admin "$@"
