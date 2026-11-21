#!/bin/sh
# Test de fumée complet : faux serveurs (IMAP Free, TimeTree, IA), vrai relais, appli servie en local, puis tests/smoke.py.
# Prérequis : node, python3 + playwright (pip install playwright && playwright install chromium). Sans eux, les tests sont ignorés.
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd); T=$(mktemp -d)
python3 -c "import playwright" 2>/dev/null || { echo "Tests ignorés : playwright absent"; exit 0; }
[ -d tests/node_modules/hoodiecrow-imap ] || npm i --prefix tests --silent >/dev/null 2>&1 || { echo "Tests ignorés : dépendances de test absentes"; exit 0; }
[ -d relay/node_modules ] || (cd relay && npm ci --silent >/dev/null 2>&1)
PIDS=""
start() { "$@" >>"$T/log" 2>&1 & PIDS="$PIDS $!"; }
NODE_PATH="$ROOT/tests/node_modules" start node tests/fake/imap.js
start node tests/fake/timetree.js
start node tests/fake/ai.js
start python3 -m http.server 8765
sleep 1
PORT=8899 RELAY_TOKEN=s DATA_DIR="$T/data" PUBLIC_URL=http://localhost:8899 APP_URL=http://localhost:8765/ GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y \
VAPID_PUBLIC=BKHlxRD22tWecylvGKhIrPA4MtWqU3btOZ7sXJvE25WtlIRr8vP2WD0wNDASiS4l0vq579InppYsR-lY_lTgJjM VAPID_PRIVATE=VDZf5ij3KKs5Ro6JNdah9KWlTg1bbT8g2P9ksUMTiZY \
FREE_IMAP_HOST=localhost FREE_IMAP_PORT=1143 FREE_IMAP_SECURE=false FREE_SMTP_HOST=localhost FREE_SMTP_PORT=1025 FREE_SMTP_SECURE=false \
AI_URL=http://localhost:8977/v1/chat/completions TT_URL=http://localhost:8980/api/v1 ENC_KEY=ae5f5c0c7ee768fb907caf058ce00e6f90c89877dc5884d2da5333f72e71f961 \
start node relay/server.js
sleep 3
curl -s -X POST localhost:8899/free/account -H 'Authorization: Bearer s' -H 'Content-Type: application/json' -d '{"email":"testuser","password":"testpass"}' >/dev/null
curl -s -X POST localhost:8899/timetree/account -H 'Authorization: Bearer s' -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"ok"}' >/dev/null
curl -s -X POST localhost:8899/ai/key -H 'Authorization: Bearer s' -H 'Content-Type: application/json' -d '{"key":"gsk_test"}' >/dev/null
sleep 2
python3 tests/smoke.py; R=$?
kill $PIDS 2>/dev/null; rm -rf "$T"
exit $R
