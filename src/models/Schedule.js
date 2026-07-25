/**
 * Модель Schedule (аркуш Schedule) - звʼязує Users та Shifts.
 *
 * @typedef {Object} Schedule
 * @property {string} record_id
 * @property {string} shift_id - посилання на Shifts.shift_id
 * @property {string} user_id - посилання на Users.user_id
 * @property {'Assigned'|'Replacement'|'Completed'} status
 */
module.exports = {};
