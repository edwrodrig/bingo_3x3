#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${BINGO_DOMAIN:-bingo.labo86.cl}"
HOST="${BINGO_SSH_HOST:-152.74.160.41}"
USER="${BINGO_SSH_USER:-edwin}"
PORT="${BINGO_PORT:-3013}"
REMOTE="${USER}@${HOST}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes)
if [[ -n "${BINGO_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$BINGO_SSH_KEY" -o IdentitiesOnly=yes -o IdentityAgent=none)
elif [[ -n "${BINGO_SSH_PUBKEY:-}" ]]; then
  SSH_OPTS+=(-i "$BINGO_SSH_PUBKEY" -o IdentitiesOnly=yes)
fi
ssh_bingo() { ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"; }

[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || { echo 'BINGO_PORT inválido' >&2; exit 1; }
for cmd in go npm python3 rsync ssh dig curl; do command -v "$cmd" >/dev/null; done
ssh_bingo 'set -e; sudo -n true; command -v nginx; command -v certbot; command -v python3; command -v rsync; command -v systemctl; test "$(uname -s)" = Linux' >/dev/null
[[ "$(ssh_bingo 'uname -m')" == x86_64 ]] || { echo 'Se esperaba dti_Server x86_64' >&2; exit 1; }
ssh_bingo "if ss -ltn | grep -qE '[:.]${PORT}[[:space:]]'; then systemctl is-active --quiet bingo.service || { echo 'Puerto ${PORT} ocupado' >&2; exit 1; }; fi"

cd "$ROOT"
npm ci --no-audit --no-fund
npm test
npm run build
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o "$STAGE/bingo-server" ./server
mkdir -p "$STAGE/dist"
cp -R dist/. "$STAGE/dist/"
cp bingo_generator.py compact_pdf.py "$STAGE/"

RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
ssh_bingo "sudo install -d -o '$USER' -g '$USER' -m 0750 /srv/bingo /srv/bingo/releases /srv/bingo/data; mkdir -p '/srv/bingo/releases/$RELEASE'"
printf -v SSH_COMMAND '%q ' ssh "${SSH_OPTS[@]}"
rsync -a --delete -e "$SSH_COMMAND" "$STAGE/" "$REMOTE:/srv/bingo/releases/$RELEASE/"

mkdir -p "$ROOT/.local/backups"
chmod 700 "$ROOT/.local" "$ROOT/.local/backups"
if ssh_bingo 'test -f /srv/bingo/data/games.json'; then
  BACKUP="$ROOT/.local/backups/bingo-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  ssh_bingo 'tar -C /srv/bingo -czf - data' > "$BACKUP"
  chmod 600 "$BACKUP"
fi
if ! ssh_bingo 'test -f /srv/bingo/data/owner.hash'; then
  PASSWORD_FILE="$ROOT/.local/bingo-owner-password"
  if [[ ! -f "$PASSWORD_FILE" ]]; then
    python3 - "$PASSWORD_FILE" <<'PY'
import os, pathlib, secrets, sys
p = pathlib.Path(sys.argv[1])
fd = os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(secrets.token_urlsafe(32) + '\n')
PY
  fi
  [[ "$(stat -f %Lp "$PASSWORD_FILE" 2>/dev/null || stat -c %a "$PASSWORD_FILE")" == 600 ]] || { echo 'La contraseña local debe tener permisos 600' >&2; exit 1; }
  ssh "${SSH_OPTS[@]}" "$REMOTE" "BINGO_DATA_DIR=/srv/bingo/data /srv/bingo/releases/$RELEASE/bingo-server owner bootstrap" < "$PASSWORD_FILE"
fi

ssh_bingo "bash -s -- '$RELEASE' '$USER' '$PORT' '$DOMAIN'" <<'REMOTE_SCRIPT'
set -euo pipefail
release="$1"; service_user="$2"; port="$3"; domain="$4"
previous="$(readlink -f /srv/bingo/current 2>/dev/null || true)"
rollback() {
  if [ -n "$previous" ] && [ -x "$previous/bingo-server" ]; then
    sudo ln -sfn "$previous" /srv/bingo/current
    sudo systemctl restart bingo.service
  fi
}
trap rollback ERR
sudo tee /etc/systemd/system/bingo.service >/dev/null <<EOF
[Unit]
Description=Bingo Fantástico
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
Group=$service_user
WorkingDirectory=/srv/bingo/current
Environment=PORT=$port
Environment=BINGO_BIND=127.0.0.1
Environment=BINGO_DATA_DIR=/srv/bingo/data
Environment=BINGO_DIST_DIR=/srv/bingo/current/dist
Environment=BINGO_ROOT_DIR=/srv/bingo/current
Environment=BINGO_SECURE_COOKIES=1
ExecStart=/srv/bingo/current/bingo-server
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/bingo/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo ln -sfn "/srv/bingo/releases/$release" /srv/bingo/current
sudo systemctl daemon-reload
sudo systemctl enable --now bingo.service
sudo systemctl restart bingo.service
for attempt in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null
trap - ERR
if [ ! -e /etc/nginx/sites-available/bingo ]; then
sudo tee /etc/nginx/sites-available/bingo >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
EOF
fi
sudo ln -sfn /etc/nginx/sites-available/bingo /etc/nginx/sites-enabled/bingo
sudo nginx -t
sudo systemctl reload nginx
REMOTE_SCRIPT

DNS_IP="$(dig +short "$DOMAIN" A @1.1.1.1 | tail -1)"
if [[ "$DNS_IP" != "$HOST" ]]; then
  echo "Release activo; DNS pendiente: $DOMAIN debe apuntar a $HOST"
  exit 0
fi
if ! ssh_bingo "sudo openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem -checkend 604800 -noout" >/dev/null 2>&1; then
  CERT_CONTACT=(--register-unsafely-without-email)
  if [[ -n "${BINGO_CERT_EMAIL:-}" ]]; then CERT_CONTACT=(-m "$BINGO_CERT_EMAIL"); fi
  printf -v CERT_COMMAND '%q ' sudo certbot --nginx --non-interactive --agree-tos --keep-until-expiring --redirect "${CERT_CONTACT[@]}" -d "$DOMAIN"
  ssh_bingo "$CERT_COMMAND"
fi
ssh_bingo 'sudo nginx -t && sudo systemctl reload nginx'
curl -fsS --resolve "$DOMAIN:443:$HOST" "https://$DOMAIN/api/health" >/dev/null
echo "Bingo publicado en https://$DOMAIN/"
