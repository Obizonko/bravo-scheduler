'use strict';

/**
 * Чиста математика часу для рушія правил. Жодних залежностей від БД чи
 * Express — усе тут детерміноване і легко тестується без Mongo.
 *
 * Домовленості:
 *  - "Абсолютна хвилина" = dayIndex(date) * 1440 + хвилини_від_півночі.
 *    Це суцільна числова шкала без розривів, тому арифметика перетинів/
 *    розривів між днями працює так само просто, як у межах одного дня.
 *  - dayIndex рахується через Date.UTC(...), тому переведення годинників
 *    (DST) на цю арифметику не впливає — усюди "настінний час локації",
 *    жодних конвертацій часових поясів не виконується.
 *  - Усі інтервали напіввідкриті [start, end): дотичні межі НЕ перетинаються.
 *  - time_end < time_start означає перехід зміни через північ.
 *    time_end === time_start вважається невалідним (нульова/24-годинна
 *    тривалість неоднозначна) — toInterval поверне null.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86400000;

/** Чи є рядок реальною календарною датою (відкидає, наприклад, 2026-02-31). */
function isValidCalendarDate(dateStr) {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/** 'YYYY-MM-DD' -> цілий номер дня (UTC-арифметика, без DST). null якщо невалідно. */
function dayIndex(dateStr) {
  if (!isValidCalendarDate(dateStr)) return null;
  const match = DATE_PATTERN.exec(dateStr);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Номер дня -> 'YYYY-MM-DD'. */
function dateStrFromDayIndex(idx) {
  const d = new Date(idx * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' зі зсувом на delta днів (може бути відʼємним). null якщо dateStr невалідний. */
function addDays(dateStr, delta) {
  const idx = dayIndex(dateStr);
  if (idx === null) return null;
  return dateStrFromDayIndex(idx + delta);
}

/** 'HH:mm' (24-год) -> хвилини від півночі. null якщо формат невалідний. */
function hhmmToMinutes(timeStr) {
  const match = TIME_PATTERN.exec(timeStr);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Хвилини (можуть виходити за межі доби) -> 'HH:mm' у межах доби. */
function minutesToHhmm(totalMinutes) {
  const wrapped = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Будує інтервал у просторі абсолютних хвилин з канонічних date/time_start/time_end.
 * @returns {{start:number, end:number, crossesMidnight:boolean, date:string}|null}
 */
function toInterval(dateStr, startStr, endStr) {
  const idx = dayIndex(dateStr);
  if (idx === null) return null;
  const startMin = hhmmToMinutes(startStr);
  const endMin = hhmmToMinutes(endStr);
  if (startMin === null || endMin === null || startMin === endMin) return null;

  const base = idx * MINUTES_PER_DAY;
  const crossesMidnight = endMin < startMin;
  const start = base + startMin;
  const end = crossesMidnight ? base + MINUTES_PER_DAY + endMin : base + endMin;
  return { start, end, crossesMidnight, date: dateStr };
}

/** Half-open перетин: [a.start,a.end) x [b.start,b.end). Дотичні межі не перетинаються. */
function overlaps(a, b) {
  if (!a || !b) return false;
  return a.start < b.end && b.start < a.end;
}

/**
 * Підписаний розрив у хвилинах між кінцем a і початком b (b.start - a.end).
 * Додатне значення = a закінчується раніше, ніж починається b.
 * Відʼємне/нуль = перетин або дотичність — це вже не "розрив", а overlap.
 */
function gapMinutes(a, b) {
  if (!a || !b) return null;
  return b.start - a.end;
}

/**
 * Чи потрапляє точка (в абсолютних хвилинах) у вікно, що діє щодня
 * (наприклад, вікно кейтерингу чи нічне вікно). Window = {start:'HH:mm', end:'HH:mm'},
 * саме вікно теж може переходити через північ (23:00-06:00).
 * Перевіряє матеріалізацію вікна на сусідніх календарних днях, щоб коректно
 * впіймати випадок, коли точка належить "вчорашньому" екземпляру нічного вікна.
 */
function pointInWindow(absoluteMinutePoint, window) {
  const pointDay = Math.floor(absoluteMinutePoint / MINUTES_PER_DAY);
  for (const delta of [-1, 0, 1]) {
    const dateStr = dateStrFromDayIndex(pointDay + delta);
    const w = toInterval(dateStr, window.start, window.end);
    if (w && absoluteMinutePoint >= w.start && absoluteMinutePoint < w.end) return true;
  }
  return false;
}

/** Чи перетинається інтервал із будь-яким щоденним екземпляром вікна. */
function intersectsWindow(interval, window) {
  if (!interval) return false;
  const startDay = Math.floor(interval.start / MINUTES_PER_DAY);
  const endDay = Math.floor((interval.end - 1) / MINUTES_PER_DAY);
  for (let idx = startDay - 1; idx <= endDay + 1; idx += 1) {
    const w = toInterval(dateStrFromDayIndex(idx), window.start, window.end);
    if (w && overlaps(interval, w)) return true;
  }
  return false;
}

/** Сумарна кількість хвилин перетину інтервалу з екземплярами вікна. */
function minutesInWindow(interval, window) {
  if (!interval) return 0;
  const startDay = Math.floor(interval.start / MINUTES_PER_DAY);
  const endDay = Math.floor((interval.end - 1) / MINUTES_PER_DAY);
  let total = 0;
  for (let idx = startDay - 1; idx <= endDay + 1; idx += 1) {
    const w = toInterval(dateStrFromDayIndex(idx), window.start, window.end);
    if (!w) continue;
    const overlapStart = Math.max(interval.start, w.start);
    const overlapEnd = Math.min(interval.end, w.end);
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
  }
  return total;
}

// --- Толерантний парсинг для сумісності зі старими/брудними даними в Mongo ---
// Використовується лише на читанні (context.js), ніколи на записі — запис завжди
// проходить строгу Joi-валідацію канонічного формату.

function parseLooseDate(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (DATE_PATTERN.test(trimmed) && isValidCalendarDate(trimmed)) return trimmed;
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    const candidate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return isValidCalendarDate(candidate) ? candidate : null;
  }
  return null;
}

function parseLooseTime(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (TIME_PATTERN.test(trimmed)) return trimmed;
  const loose = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (loose) {
    const h = Number(loose[1]);
    const m = Number(loose[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

/** Як toInterval, але толерує нестрогі формати. null якщо навіть це не допомогло. */
function toIntervalLoose(dateRaw, startRaw, endRaw) {
  const date = parseLooseDate(dateRaw);
  const start = parseLooseTime(startRaw);
  const end = parseLooseTime(endRaw);
  if (!date || !start || !end) return null;
  return toInterval(date, start, end);
}

module.exports = {
  DATE_PATTERN,
  TIME_PATTERN,
  MINUTES_PER_DAY,
  isValidCalendarDate,
  dayIndex,
  dateStrFromDayIndex,
  addDays,
  hhmmToMinutes,
  minutesToHhmm,
  toInterval,
  overlaps,
  gapMinutes,
  pointInWindow,
  intersectsWindow,
  minutesInWindow,
  parseLooseDate,
  parseLooseTime,
  toIntervalLoose,
};
