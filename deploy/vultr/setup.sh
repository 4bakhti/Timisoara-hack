#!/usr/bin/env bash
# One-time setup of Framewise on a fresh Vultr Ubuntu 24.04 server.
#
#   curl -fsSL https://raw.githubusercontent.com/4bakhti/Timisoara-hack/main/deploy/vultr/setup.sh -o setup.sh
#   sudo bash setup.sh
#
# What it does: installs Node.js 22, git and Caddy; creates a "framewise" user;
# clones the public repository into /opt/framewise/app; builds the app; runs it as
# a service on 127.0.0.1:3000; and puts Caddy in front of it with automatic HTTPS
# on https://<your-ip-with-dashes>.sslip.io (or on DOMAIN if you set it).
#
# It contains no keys. Put them in /opt/framewise/app/.env.local afterwards
# (see docs/DEPLOY-VULTR.md), then run update.sh.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/4bakhti/Timisoara-hack.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/framewise/app
APP_USER=framewise

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo bash setup.sh" >&2
  exit 1
fi

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "==> Swap (the production build needs more memory than small plans have)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> App user and code"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/framewise --shell /usr/sbin/nologin "$APP_USER"
mkdir -p /opt/framewise
chown "$APP_USER:$APP_USER" /opt/framewise
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
if [ ! -f "$APP_DIR/.env.local" ]; then
  sudo -u "$APP_USER" cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
fi
chmod 600 "$APP_DIR/.env.local"

echo "==> Build (a few minutes)"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npm run build

echo "==> Service"
install -m 644 "$APP_DIR/deploy/vultr/framewise.service" /etc/systemd/system/framewise.service
systemctl daemon-reload
systemctl enable --now framewise

echo "==> HTTPS"
if [ -z "${DOMAIN:-}" ]; then
  PUBLIC_IP="$(curl -4fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  DOMAIN="${PUBLIC_IP//./-}.sslip.io"
fi
sed "s/__DOMAIN__/$DOMAIN/" "$APP_DIR/deploy/vultr/Caddyfile.template" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

echo
echo "Done. In a minute the app will answer at: https://$DOMAIN"
echo "Next: put your keys in $APP_DIR/.env.local (sudo nano $APP_DIR/.env.local),"
echo "then run: sudo bash $APP_DIR/deploy/vultr/update.sh"
