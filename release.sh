#!/bin/sh
# Usage : ./release.sh 1.4.1  -> vérifie le code, met à jour le numéro de version partout
V="$1"; D=$(date +%d/%m/%Y)
[ -z "$V" ] && { echo "usage: ./release.sh X.Y.Z"; exit 1; }
# 1. Vérification de syntaxe de tous les fichiers (appli, service worker, relais)
for f in js/*.js sw.js relay/server.js; do node --check "$f" || { echo "ERREUR de syntaxe dans $f : version non publiée"; exit 1; }; done
# 2. Test de fumée (si l'environnement de test est disponible) : chaque écran s'ouvre sans erreur
if [ -x tests/run.sh ] && [ -z "$SKIP_TESTS" ]; then tests/run.sh || { echo "Tests en échec : version non publiée (SKIP_TESTS=1 pour forcer)"; exit 1; }; fi
sed -i "s/^const APP_VERSION = '.*';/const APP_VERSION = '$V';/; s#^const APP_DATE = '.*';#const APP_DATE = '$D';#" js/core.js
sed -i -E "s/(styles\.css|js\/[a-z-]+\.js)\?v=[^\"]*/\1?v=$V/g" index.html
sed -i -E "s/const V = 'ml-[^']*'/const V = 'ml-$V'/" sw.js
[ -n "$BUMP_RELAY" ] && sed -i "s/^const RELAY_V = '.*';/const RELAY_V = '$V';/" relay/server.js
ASSETS=$(grep -oE '(js/[a-z-]+\.js|styles\.css)\?v=[^"]*' index.html | sed 's/.*/"&"/' | paste -sd, -)
printf '{"version":"%s","date":"%s","assets":[%s]}\n' "$V" "$D" "$ASSETS" > version.json
echo "Version $V"
