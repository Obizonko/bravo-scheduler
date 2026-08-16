#!/usr/bin/env bash
#
# Резервне копіювання бази планувальника.
#
# Запускається systemd-таймером (deploy/scheduler-backup.timer), але спокійно
# працює і руками. Пише в /var/backups/scheduler, тримає останні RETENTION
# копій.
#
# Головна властивість: СПЕРШУ створити й перевірити нову копію, і лише потім
# видаляти старі. Якщо дамп не вдався або вийшов підозріло малим - скрипт
# виходить з помилкою й НІЧОГО не чіпає. Інакше один зламаний запуск міг би
# вичистити всю історію копій саме тоді, коли вона найпотрібніша.
set -euo pipefail

CONTAINER="${CONTAINER:-scheduler-mongo-1}"
DB="${DB:-hr_scheduler}"
DEST="${DEST:-/var/backups/scheduler}"
# Знімки йдуть кожні 30 хв, тож 96 штук - це дві доби детальної історії.
# Копія важить ~4 КБ, місця це не коштує.
RETENTION="${RETENTION:-96}"
# Окремо тримаємо по одній копії на добу в daily/ - вони НЕ витісняються
# частими знімками. Без цього дві доби були б усією доступною глибиною, і
# пошкодження, помічене на третій день, не було б чим лікувати.
DAILY_DIR="$DEST/daily"
DAILY_RETENTION="${DAILY_RETENTION:-30}"
# Порожній gzip-архів - близько 20 байт. Усе, менше за це, означає, що дамп
# насправді не відбувся, навіть якщо mongodump повернув нуль.
MIN_BYTES="${MIN_BYTES:-200}"

log() { echo "[backup] $*"; }
fail() { echo "[backup][ПОМИЛКА] $*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker не знайдено"
docker inspect "$CONTAINER" >/dev/null 2>&1 || fail "контейнер $CONTAINER не запущено"

mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$DEST/.in-progress-$STAMP.gz"
OUT="$DEST/${DB}-${STAMP}.gz"

# Пишемо у тимчасове імʼя: перерваний на півдорозі дамп не має виглядати як
# готова копія для ротації нижче.
if ! docker exec "$CONTAINER" mongodump --archive --gzip --db="$DB" > "$TMP" 2>/dev/null; then
  rm -f "$TMP"
  fail "mongodump завершився помилкою"
fi

SIZE=$(stat -c%s "$TMP" 2>/dev/null || echo 0)
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  rm -f "$TMP"
  fail "копія підозріло мала ($SIZE байт) - вважаю невдалою, старі копії не чіпаю"
fi

mv "$TMP" "$OUT"
log "створено $OUT ($SIZE байт)"

# Перша копія за добу дублюється в daily/ - решта дня туди не потрапляє.
mkdir -p "$DAILY_DIR"
DAILY="$DAILY_DIR/${DB}-$(date +%Y%m%d).gz"
if [ ! -f "$DAILY" ]; then
  cp "$OUT" "$DAILY"
  log "перша копія за сьогодні продубльована у daily/"
fi

# Ротація - тільки після успішного створення нової копії.
rotate() {
  local dir="$1" keep="$2"
  mapfile -t OLD < <(ls -1t "$dir/${DB}-"*.gz 2>/dev/null | tail -n +$((keep + 1)))
  for f in "${OLD[@]:-}"; do
    [ -n "$f" ] || continue
    rm -f "$f"
    log "прибрано $(basename "$f")"
  done
}
rotate "$DEST" "$RETENTION"
rotate "$DAILY_DIR" "$DAILY_RETENTION"

log "готово. копій: $(ls -1 "$DEST/${DB}-"*.gz 2>/dev/null | wc -l) частих + $(ls -1 "$DAILY_DIR/${DB}-"*.gz 2>/dev/null | wc -l) добових"
