#!/bin/sh
# Usage : ./release.sh 1.4.1  -> met à jour le numéro de version partout
V="$1"; D=$(date +%d/%m/%Y)
[ -z "$V" ] && { echo "usage: ./release.sh X.Y.Z"; exit 1; }
sed -i "s/^const APP_VERSION = '.*';/const APP_VERSION = '$V';/; s#^const APP_DATE = '.*';#const APP_DATE = '$D';#" app.js
sed -i -E "s/(styles\.css|app\.js)\?v=[^\"]*/\1?v=$V/g" index.html
sed -i -E "s/const V = 'ml-[^']*'/const V = 'ml-$V'/" sw.js
printf '{"version":"%s","date":"%s","assets":["app.js?v=%s","styles.css?v=%s"]}\n' "$V" "$D" "$V" "$V" > version.json
echo "Version $V"
