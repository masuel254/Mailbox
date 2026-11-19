#!/usr/bin/env bash
# Installation / mise à jour du relais MailBox sur le VPS (à côté de n8n, derrière Caddy).
# Usage : curl -fsSL https://raw.githubusercontent.com/masuel254/Mailbox/main/relay/install.sh | sudo bash
set -euo pipefail

REPO="https://github.com/masuel254/Mailbox.git"
SRC=/opt/mailbox
ENV_FILE=/opt/mailbox-relay.env
NAME=mailbox-relay
DEFAULT_DOMAIN="vps-444b360b.vps.ovh.net"
DEFAULT_CLIENT_ID="601151754509-qh74iug9181hvj0ll1po3o4jc8265bju.apps.googleusercontent.com"

vert() { printf '\033[1;32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[1;33m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }
ask() { local q="$1" def="${2:-}" v; if [ -n "$def" ]; then read -r -p "$q [$def] : " v </dev/tty; echo "${v:-$def}"; else read -r -p "$q : " v </dev/tty; echo "$v"; fi; }

[ "$(id -u)" -eq 0 ] || { rouge "Lance la commande avec sudo."; exit 1; }
command -v docker >/dev/null || { rouge "Docker est introuvable sur ce serveur. Arrêt."; exit 1; }
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }

vert "1/6  Récupération du code"
if [ -d "$SRC/.git" ]; then git -C "$SRC" pull -q --ff-only; else git clone -q --depth 1 "$REPO" "$SRC"; fi

vert "2/6  Configuration"
if [ -f "$ENV_FILE" ]; then
  jaune "Configuration existante conservée ($ENV_FILE)."
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  DOMAIN=$(echo "$PUBLIC_URL" | sed -E 's#https://([^/]+)/.*#\1#')
else
  DOMAIN=$(ask "Adresse de ton VPS" "$DEFAULT_DOMAIN")
  CLIENT_ID=$(ask "ID client Google" "$DEFAULT_CLIENT_ID")
  read -r -s -p "Code secret du client Google (il ne s'affiche pas) : " CLIENT_SECRET </dev/tty; echo
  [ -n "$CLIENT_SECRET" ] || { rouge "Code secret vide. Arrêt."; exit 1; }
  RELAY_TOKEN=$(openssl rand -hex 16)
  ENC_KEY=$(openssl rand -hex 32)
  KEYS=$(docker run --rm node:20-alpine npx -y web-push@3 generate-vapid-keys --json 2>/dev/null)
  VAPID_PUBLIC=$(echo "$KEYS" | sed -E 's/.*"publicKey":"([^"]+)".*/\1/')
  VAPID_PRIVATE=$(echo "$KEYS" | sed -E 's/.*"privateKey":"([^"]+)".*/\1/')
  [ -n "$VAPID_PUBLIC" ] && [ -n "$VAPID_PRIVATE" ] || { rouge "Génération des clés de notification impossible."; exit 1; }
  umask 077
  cat > "$ENV_FILE" <<EOF
RELAY_TOKEN=$RELAY_TOKEN
PUBLIC_URL=https://$DOMAIN/mailbox
APP_URL=https://masuel254.github.io/Mailbox/
GOOGLE_CLIENT_ID=$CLIENT_ID
GOOGLE_CLIENT_SECRET=$CLIENT_SECRET
ENC_KEY=$ENC_KEY
VAPID_PUBLIC=$VAPID_PUBLIC
VAPID_PRIVATE=$VAPID_PRIVATE
VAPID_SUBJECT=mailto:noreply@$DOMAIN
POLL_SECONDS=60
EOF
  chmod 600 "$ENV_FILE"
fi

vert "3/6  Construction du relais"
docker build -q -t "$NAME" "$SRC/relay" >/dev/null

vert "4/6  Détection de Caddy"
CADDY_CT=$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($0) ~ /caddy/ {print $1; exit}')
PUBLISH=""; NET_ARG=""
if [ -n "$CADDY_CT" ]; then
  NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY_CT" | awk '{print $1}')
  CADDYFILE=$(docker inspect -f '{{range .Mounts}}{{.Source}}|{{.Destination}}{{"\n"}}{{end}}' "$CADDY_CT" | awk -F'|' '$2=="/etc/caddy/Caddyfile"{print $1; exit}')
  [ -z "$CADDYFILE" ] && CADDYFILE=$(docker inspect -f '{{range .Mounts}}{{.Source}}|{{.Destination}}{{"\n"}}{{end}}' "$CADDY_CT" | awk -F'|' '$2=="/etc/caddy"{print $1"/Caddyfile"; exit}')
  if [ "$NET" = "host" ]; then PUBLISH="-p 127.0.0.1:8787:8787"; UPSTREAM="127.0.0.1:8787"; else NET_ARG="--network $NET"; UPSTREAM="$NAME:8787"; fi
  validate() { docker exec "$CADDY_CT" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; }
  reload() { docker exec "$CADDY_CT" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; }
  echo "Caddy en conteneur : $CADDY_CT (réseau $NET)"
elif systemctl is-active --quiet caddy 2>/dev/null; then
  CADDYFILE=/etc/caddy/Caddyfile; PUBLISH="-p 127.0.0.1:8787:8787"; UPSTREAM="127.0.0.1:8787"
  validate() { caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; }
  reload() { systemctl reload caddy; }
  echo "Caddy installé comme service système"
else
  rouge "Caddy introuvable. Arrêt (rien n'a été modifié côté web)."; exit 1
fi
[ -n "${CADDYFILE:-}" ] && [ -f "$CADDYFILE" ] || { rouge "Fichier Caddyfile introuvable. Arrêt."; exit 1; }

vert "5/6  Démarrage du relais"
docker rm -f "$NAME" >/dev/null 2>&1 || true
# Le dossier de données doit appartenir à l'utilisateur du conteneur (node, uid 1000)
docker run --rm -v mailbox-relay-data:/data alpine:3 chown -R 1000:1000 /data >/dev/null
# shellcheck disable=SC2086
docker run -d --name "$NAME" --restart unless-stopped $NET_ARG $PUBLISH --env-file "$ENV_FILE" -v mailbox-relay-data:/data "$NAME" >/dev/null
sleep 3
docker ps --filter "name=^/$NAME$" --format '{{.Status}}' | grep -q Up || { rouge "Le relais ne démarre pas :"; docker logs --tail 20 "$NAME"; exit 1; }

vert "6/6  Route /mailbox dans Caddy"
if grep -q "handle_path /mailbox/\*" "$CADDYFILE"; then
  jaune "Route déjà présente, Caddyfile inchangé."
else
  BACKUP="$CADDYFILE.avant-mailbox-$(date +%Y%m%d-%H%M%S)"
  cp "$CADDYFILE" "$BACKUP"
  DOM_RE=$(printf '%s' "$DOMAIN" | sed 's/[.]/\\./g')
  TMP=$(mktemp)
  awk -v re="^[[:space:]]*(https?://)?$DOM_RE([:, ].*)?\\{[[:space:]]*$" -v up="$UPSTREAM" '
    !done && $0 ~ re { print; print "\thandle_path /mailbox/* {"; print "\t\treverse_proxy " up; print "\t}"; done=1; next } { print }
    END { if (!done) exit 3 }' "$CADDYFILE" > "$TMP" || { rm -f "$TMP"; rouge "Bloc du site $DOMAIN introuvable dans $CADDYFILE. Rien n'a été modifié."; exit 1; }
  cat "$TMP" > "$CADDYFILE"; rm -f "$TMP"   # écriture en place : garde le montage Docker
  if validate && reload; then
    echo "Caddyfile mis à jour (sauvegarde : $BACKUP)"
  else
    cat "$BACKUP" > "$CADDYFILE"; reload || true
    rouge "Caddy refuse la nouvelle configuration : ancienne version restaurée. Arrêt."; exit 1
  fi
fi

sleep 2
if curl -fsS "https://$DOMAIN/mailbox/health" >/dev/null 2>&1; then vert "Relais joignable sur https://$DOMAIN/mailbox"; else jaune "Le relais tourne mais ne répond pas encore en HTTPS. Réessaie dans une minute : curl https://$DOMAIN/mailbox/health"; fi

# shellcheck disable=SC1090
. "$ENV_FILE"
echo
vert "===================== À RECOPIER ====================="
echo "Adresse du relais  : https://$DOMAIN/mailbox"
echo "Code d'accès       : $RELAY_TOKEN"
echo "URI à ajouter chez Google (redirection autorisée) :"
echo "  https://$DOMAIN/mailbox/auth/google/callback"
vert "======================================================"
echo "n8n n'a pas été touché. Pour mettre à jour plus tard : relance la même commande."
