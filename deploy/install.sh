#!/usr/bin/env bash
# 서버 설치·업데이트 (docs/deploy.md 5장). dist/ 를 서버에 올린 뒤 그 안에서: sudo bash deploy/install.sh
# 처음이면 서비스 계정·폴더·환경 변수 파일을 만들고, 이미 있는 환경 변수 파일과 DB는 건드리지 않는다
set -euo pipefail

APP=coop-dungeon-island
USER_NAME=coopgame
APP_DIR=/opt/$APP
DATA_DIR=/var/lib/$APP
ENV_FILE=/etc/$APP.env
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "root로 실행: sudo bash $0"; exit 1; }
[ -f "$SRC/server.mjs" ] || { echo "$SRC 에 server.mjs가 없습니다 (dist/ 안에서 실행)"; exit 1; }
for c in node npm rsync systemctl; do
  command -v "$c" >/dev/null || { echo "$c 이(가) 필요합니다"; exit 1; }
done
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node 22 이상이 필요합니다 (지금 $(node -v))"; exit 1; }

echo "1/6 서비스 계정 $USER_NAME"
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$USER_NAME"

echo "2/6 데이터 폴더 $DATA_DIR (서비스 계정만)"
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "$DATA_DIR" "$DATA_DIR/backups"

echo "3/6 환경 변수 $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  install -m 640 -o root -g "$USER_NAME" "$SRC/.env.example" "$ENV_FILE"
  echo "  새로 만들었습니다. PUBLIC_ORIGIN을 실제 주소로 고친 뒤 다시 실행하세요: sudo nano $ENV_FILE"
  exit 0
fi
if grep -q 'game\.example\.com' "$ENV_FILE"; then
  echo "  $ENV_FILE 의 PUBLIC_ORIGIN이 아직 예시 주소입니다. 고친 뒤 다시 실행하세요"
  exit 1
fi

echo "4/6 프로그램 복사 $APP_DIR"
if [ -f "$APP_DIR/server.mjs" ]; then
  # 지난 판본 하나는 남겨 둔다 (되돌리기, docs/deploy.md 5장)
  rm -rf "$APP_DIR.prev" && cp -a "$APP_DIR" "$APP_DIR.prev"
fi
install -d -m 755 "$APP_DIR"
# node_modules는 아래에서 이 서버용으로 새로 설치 (deploy-local이 만든 윈도우 연결 제외)
rsync -a --delete --exclude node_modules "$SRC/" "$APP_DIR/"
chown -R root:root "$APP_DIR"
chmod -R u=rwX,go=rX "$APP_DIR"

echo "5/6 네이티브 모듈 설치"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund)

echo "6/6 서비스·백업 cron·관리자 명령"
install -m 644 "$APP_DIR/deploy/$APP.service" "/etc/systemd/system/$APP.service"
install -m 644 "$APP_DIR/deploy/backup.cron" "/etc/cron.d/$APP"
install -m 755 "$APP_DIR/deploy/admin.sh" /usr/local/bin/coop-admin
systemctl daemon-reload
systemctl enable "$APP" >/dev/null
systemctl restart "$APP"
sleep 2
systemctl --no-pager --lines=5 status "$APP" || true
echo "완료. 로그: journalctl -u $APP -f · 관리자 명령: sudo coop-admin users"
