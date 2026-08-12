'use strict';

const { config } = require('./env');

/**
 * Уся політика планування чергувань зібрана тут в одному місці, а не
 * розкидана по коду чи передрукована в кожному рядку зміни. Це числа й
 * правила зі спеки "Все про розклад та хорс-тайм-менеджмент / Браво'2026".
 *
 * Один зафіксований локальний час, конвертація часових поясів ніде не
 * виконується (див. src/domain/time.js).
 */
module.exports = {
  timezoneNote:
    'Усі часи в системі - локальний настінний час локації табору. ' +
    'Конвертація часових поясів не виконується ніде.',

  // 'off' | 'warn' | 'block' - див. src/config/env.js
  enforcement: config.rules.enforcement,

  // Буфер після загальної активності (руханка, квести) перед виходом на чергування: 20 хв + 10 хв про запас
  buffer: {
    activityToShiftMin: 20,
    reserveMin: 10,
    totalMin: 30,
  },

  // Вікна кейтерингу: під час них не ставимо перезмінок
  cateringWindows: [
    { code: 'breakfast', label: 'Сніданок', start: '07:30', end: '09:00' },
    { code: 'lunch', label: 'Обід', start: '12:40', end: '14:00' },
    { code: 'dinner', label: 'Вечеря', start: '18:05', end: '19:05' },
  ],

  // Робочі години складу/ТЕЦ. Поза ними - нічне вікно (offHours нижче), візити заборонені крім форс-мажорів.
  workingHours: { start: '06:00', end: '23:00' },
  nightWindow: { start: '23:00', end: '06:00' },

  // Пільгові хвилини на здачу майна після закінчення робочого часу. Лише інформативно -
  // НЕ подовжує ефективний кінець зміни (це зламало б математику перетинів/буферів).
  gracePeriodMin: 30,

  // Базові ліміти чисельності за типом служби: { min, standard, max }.
  // "standard" - типовий склад (напр. на складі - один видає, один приймає/веде облік).
  quotas: {
    Склад: { min: 1, standard: 2, max: 3 },
    ТЕЦ: { min: 1, standard: 1, max: 2 },
    Поїздка: { min: 1, standard: 1, max: 4 },
    'Зовнішня активність': { min: 1, standard: 1, max: 5 },
  },

  // Як рівень навантаження активності Master Plan (workload) переводиться на квоту служби.
  // 'allowDriverPair' реалізує правило "1, або 1+1 якщо серед них водій" для тихих/all_hands годин.
  workloadQuotaModifiers: {
    peak: { use: 'max' },
    normal: { use: 'standard' },
    // allowDriverPair на quiet і all_hands - пряма реалізація §3 спеки: "у тиху годину... водіям
    // можна ставити зміни лише в парі з не-водієм" і §1 "по 1 людині, або 1+1, якщо серед них водій".
    quiet: { use: 'min', allowDriverPair: true },
    all_hands: { use: 'min', allowDriverPair: true },
    off_hours: { use: 'min' },
  },

  // Пріоритет "суворості" рівня навантаження, коли на зміну накладається кілька активностей одночасно.
  // Перемагає найсуворіший (найменша квота).
  workloadSeverityOrder: ['all_hands', 'quiet', 'off_hours', 'normal', 'peak'],

  serviceGroups: {
    static: ['Склад', 'ТЕЦ'],
    mobile: ['Поїздка', 'Зовнішня активність'],
  },

  driver: {
    // У тиху годину (квота 1) водія можна ставити лише в парі з не-водієм
    quietHourPairingRequired: true,
  },

  nightDuty: {
    emergencyUserId: config.nightDuty?.emergencyUserId ?? null,
    keyLocation: config.nightDuty?.keyLocation ?? null,
  },
};
