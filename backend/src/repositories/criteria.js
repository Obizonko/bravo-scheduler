'use strict';

/**
 * Невелика декларативна мова критеріїв для filter-обʼєктів, що передаються
 * у BaseRepository#findAll. Рушію правил (context.js) потрібні $in-подібні
 * запити ("усі зміни за декілька дат"), але вписувати "$in" прямо в сервіс
 * тихо зробило б сервіс Mongo-специфічним і зламало б обіцянку README, що
 * СУБД можна підмінити, написавши нову реалізацію BaseRepository.
 *
 * Замість цього сервіс описує намір декларативно (inList/between/notEq),
 * а конкретний репозиторій (MongoRepository._toMongoFilter) перекладає це
 * на мову своєї СУБД. Майбутній PostgresRepository реалізував би той самий
 * словник під SQL WHERE ... IN (...) / BETWEEN ... / <> ....
 */

const OP_IN = 'in';
const OP_BETWEEN = 'between';
const OP_NE = 'ne';

/** Значення поля має бути одним із values. */
function inList(values) {
  return { __op: OP_IN, values };
}

/** Значення поля в межах [from, to] включно. */
function between(from, to) {
  return { __op: OP_BETWEEN, from, to };
}

/** Значення поля не дорівнює value. */
function notEq(value) {
  return { __op: OP_NE, value };
}

/** Чи є значення фільтра критерієм із цього словника (а не звичайним значенням для рівності). */
function isCriterion(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.__op === 'string';
}

module.exports = { inList, between, notEq, isCriterion, OP_IN, OP_BETWEEN, OP_NE };
