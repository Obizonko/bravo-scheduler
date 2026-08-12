'use strict';

const { indexContext } = require('../../src/services/rules/context');

/**
 * Обгортка над indexContext з розумними дефолтами для тестів. Викликає ту саму
 * чисту функцію, яку (у Фазі 4) викликатиме продакшен-завантажувач
 * buildDayContext - тому тести рушія правил перевіряють точно ту форму
 * DayContext, яку рушій реально отримає в проді.
 */
function makeContext({ date = '2026-08-09', shifts = [], schedules = [], users = [], activities = [] } = {}) {
  return indexContext({ date, shifts, schedules, users, activities });
}

module.exports = { makeContext };
