#!/usr/bin/env bash
#
# Сторож бази: раз на пів години дивиться, чи дані на місці.
#
#   є дані   -> знімає копію (deploy/backup.sh) і виходить
#   порожньо -> відновлює з найновішої НЕПОРОЖНЬОЇ копії
#
# Порядок саме такий і він принциповий. Якби скрипт спершу знімав копію, а вже
# потім перевіряв - порожня база потрапила б в архів, і за кілька годин ротація
# витіснила б усі справжні копії порожніми. Тому з порожньої бази копія не
# знімається НІКОЛИ.
#
# Пауза: створіть /opt/scheduler/.watchdog-disabled, і сторож нічого не робитиме
# (потрібно, якщо ви свідомо чистите базу й не хочете, щоб її відновлювали).
set -euo pipefail

CONTAINER="${CONTAINER:-scheduler-mongo-1}"
DB="${DB:-hr_scheduler}"
DEST="${DEST:-/var/backups/scheduler}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAUSE_FLAG="${PAUSE_FLAG:-$HERE/../.watchdog-disabled}"
PROBE="${DB}_watchdog_probe"

log() { echo "[watchdog] $*"; }
fail() { echo "[watchdog][ПОМИЛКА] $*" >&2; exit 1; }

if [ -f "$PAUSE_FLAG" ]; then
  log "знайдено $PAUSE_FLAG - на паузі, нічого не роблю"
  exit 0
fi

docker inspect "$CONTAINER" >/dev/null 2>&1 || fail "контейнер $CONTAINER не запущено"

# Скільки "живих" записів у базі. users і shifts разом: seedSuperAdmin гарантує
# щонайменше одного користувача щоразу, коли бекенд стартував, тож нуль по обох
# означає саме втрату даних, а не свіжу порожню установку.
count_live() {
  docker exec "$CONTAINER" mongosh --quiet --eval "
    const d = db.getSiblingDB('$DB');
    print(d.users.countDocuments() + d.shifts.countDocuments());
  " 2>/dev/null | tr -d '[:space:]'
}

LIVE="$(count_live)"
[ -n "$LIVE" ] || fail "не вдалося прочитати стан бази"

if [ "$LIVE" -gt 0 ]; then
  log "дані на місці ($LIVE записів у users+shifts) - знімаю копію"
  exec "$HERE/backup.sh"
fi

# --- Далі тільки якщо база порожня ---
log "УВАГА: база порожня. Шукаю копію для відновлення."

# Найновіша копія, у якій реально щось є. Перебираємо від нової до старої:
# якщо остання копія теж виявиться порожньою (наприклад, її зняли до того, як
# цей сторож зʼявився), беремо попередню.
RESTORED=""
while IFS= read -r ARCHIVE; do
  [ -n "$ARCHIVE" ] || continue
  docker exec -i "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$PROBE').dropDatabase()" >/dev/null 2>&1
  if ! docker exec -i "$CONTAINER" mongorestore --archive --gzip \
        --nsFrom="${DB}.*" --nsTo="${PROBE}.*" < "$ARCHIVE" >/dev/null 2>&1; then
    log "копія $(basename "$ARCHIVE") пошкоджена - пропускаю"
    continue
  fi
  PROBE_COUNT=$(docker exec "$CONTAINER" mongosh --quiet --eval "
    const d = db.getSiblingDB('$PROBE');
    print(d.users.countDocuments() + d.shifts.countDocuments());
  " 2>/dev/null | tr -d '[:space:]')
  if [ "${PROBE_COUNT:-0}" -gt 0 ]; then
    log "відновлюю з $(basename "$ARCHIVE") ($PROBE_COUNT записів)"
    docker exec -i "$CONTAINER" mongorestore --archive --gzip --drop < "$ARCHIVE" >/dev/null 2>&1 \
      || fail "відновлення з $ARCHIVE не вдалося"
    RESTORED="$ARCHIVE"
    break
  fi
  log "копія $(basename "$ARCHIVE") порожня - пропускаю"
done < <(ls -1t "$DEST/${DB}-"*.gz "$DEST/daily/${DB}-"*.gz 2>/dev/null)

docker exec -i "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$PROBE').dropDatabase()" >/dev/null 2>&1

if [ -z "$RESTORED" ]; then
  fail "база порожня, але жодної придатної копії не знайдено - відновлювати нема з чого"
fi

AFTER="$(count_live)"
log "готово: у базі тепер $AFTER записів (users+shifts), джерело: $(basename "$RESTORED")"
