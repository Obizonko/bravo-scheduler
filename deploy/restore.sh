#!/usr/bin/env bash
#
# Відновлення бази з резервної копії.
#
#   deploy/restore.sh                        - остання копія у /var/backups/scheduler
#   deploy/restore.sh /шлях/до/копії.gz      - конкретний файл
#   CHECK_ONLY=1 deploy/restore.sh           - лише перевірити копію, нічого не міняти
#
# За замовчуванням спершу відновлює копію в ТИМЧАСОВУ базу й показує, що в ній
# лежить. Бойову базу перезаписує лише після явного підтвердження - інакше
# помилковий запуск скрипта відновлення сам став би причиною втрати даних.
set -euo pipefail

CONTAINER="${CONTAINER:-scheduler-mongo-1}"
DB="${DB:-hr_scheduler}"
DEST="${DEST:-/var/backups/scheduler}"
PROBE="${DB}_restore_probe"

log() { echo "[restore] $*"; }
fail() { echo "[restore][ПОМИЛКА] $*" >&2; exit 1; }

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(ls -1t "$DEST/${DB}-"*.gz 2>/dev/null | head -1) || true
  [ -n "$ARCHIVE" ] || fail "у $DEST немає жодної копії"
  log "беру найновішу: $ARCHIVE"
fi
[ -f "$ARCHIVE" ] || fail "файл не знайдено: $ARCHIVE"

docker inspect "$CONTAINER" >/dev/null 2>&1 || fail "контейнер $CONTAINER не запущено"

# Крок 1 - розгорнути копію збоку й переконатися, що вона ціла.
log "перевіряю копію на тимчасовій базі $PROBE"
docker exec -i "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$PROBE').dropDatabase()" >/dev/null
docker exec -i "$CONTAINER" mongorestore --archive --gzip \
  --nsFrom="${DB}.*" --nsTo="${PROBE}.*" < "$ARCHIVE" >/dev/null 2>&1 \
  || fail "копія пошкоджена - відновити з неї не вийде"

docker exec "$CONTAINER" mongosh --quiet --eval "
const p = db.getSiblingDB('$PROBE'), l = db.getSiblingDB('$DB');
print('  колекція'.padEnd(26) + 'у копії'.padEnd(10) + 'зараз у базі');
new Set([...p.getCollectionNames(), ...l.getCollectionNames()]).forEach(c => {
  print('  ' + c.padEnd(24) + String(p.getCollection(c).countDocuments()).padEnd(10) + l.getCollection(c).countDocuments());
});
"

if [ "${CHECK_ONLY:-0}" = "1" ]; then
  docker exec -i "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$PROBE').dropDatabase()" >/dev/null
  log "копія ціла. нічого не змінював (CHECK_ONLY=1)"
  exit 0
fi

# Крок 2 - підтвердження. --drop нижче видалить поточні дані, тож питаємо явно.
printf '\nПерезаписати базу %s даними з копії? Поточні дані буде втрачено. [напишіть yes]: ' "$DB"
read -r ANSWER
if [ "$ANSWER" != "yes" ]; then
  docker exec -i "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$PROBE').dropDatabase()" >/dev/null
  fail "скасовано користувачем - нічого не змінено"
fi

# Страхувальна копія поточного стану: якщо відновлення виявиться помилкою,
# буде куди повернутись.
SAFETY="$DEST/${DB}-before-restore-$(date +%Y%m%d-%H%M%S).gz"
mkdir -p "$DEST"
docker exec "$CONTAINER" mongodump --archive --gzip --db="$DB" > "$SAFETY" 2>/dev/null \
  && log "поточний стан збережено у $SAFETY"

docker exec -i "$CONTAINER" mongorestore --archive --gzip --drop < "$ARCHIVE" >/dev/null 2>&1 \
  || fail "відновлення не вдалося - поточні дані лишились у $SAFETY"

docker exec -i "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$PROBE').dropDatabase()" >/dev/null
log "готово, база $DB відновлена з $ARCHIVE"
