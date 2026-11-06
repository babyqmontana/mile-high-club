#!/bin/bash
# Первая настройка VPS на Ubuntu: Node.js, nginx, пользователь и служба. Запуск от root.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl nginx certbot python3-certbot-nginx ufw
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_24.x | bash -; apt-get install -y -q nodejs; }
id mhc >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin mhc
mkdir -p /opt/mhc
install -m 644 /opt/mhc/deploy/mhc.service /etc/systemd/system/mhc.service
install -m 644 /opt/mhc/deploy/nginx.conf /etc/nginx/sites-available/mhc
ln -sf /etc/nginx/sites-available/mhc /etc/nginx/sites-enabled/mhc
rm -f /etc/nginx/sites-enabled/default
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null
cd /opt/mhc && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
chmod 600 /opt/mhc/.env
chown -R mhc:mhc /opt/mhc
systemctl daemon-reload; systemctl enable --now mhc; systemctl restart mhc
nginx -t && systemctl reload nginx
node -v; systemctl is-active mhc
