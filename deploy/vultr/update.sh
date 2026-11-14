#!/usr/bin/env bash
# Pull the latest main, rebuild and restart Framewise. Run after every merge
# or after changing keys in /opt/framewise/app/.env.local:
#
#   sudo bash /opt/framewise/app/deploy/vultr/update.sh
set -euo pipefail

APP_DIR=/opt/framewise/app
APP_USER=framewise

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

cd "$APP_DIR"
sudo -u "$APP_USER" git pull --ff-only
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npm run build
systemctl restart framewise
sleep 3
systemctl --no-pager --lines=5 status framewise || true
echo
echo "Health: $(curl -fsS http://127.0.0.1:3000/api/health || echo 'not answering yet, check: journalctl -u framewise -n 50')"
