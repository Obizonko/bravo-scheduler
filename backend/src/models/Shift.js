const { Schema, model } = require('mongoose');
const { SERVICE_TYPES } = require('../domain/constants');

/**
 * Модель Shift (колекція shifts) - довідник змін (таймслотів)
 */
const shiftSchema = new Schema(
  {
    date: { type: String, required: true },
    time_start: { type: String, required: true },
    time_end: { type: String, required: true },
    workload: { type: String, default: '' },
    service_type: { type: String, enum: SERVICE_TYPES, required: true },
    // null (не задано явно) означає "квоту визначає рушій правил" на основі service_type
    // і перетину з активністю Master Plan (src/services/rules/quota.js). Явне число тут
    // завжди перемагає виведену квоту.
    min_people: { type: Number, required: false, default: null, min: 0 },
    max_people: { type: Number, required: false, default: null, min: 0 },
    // Номер слот-колонки в тижневому календарі (0..2), в яку адмін фактично перетягнув
    // подію. null - зміна створена без явного вибору колонки (напр. старим API-викликом) -
    // фронтенд тоді сам пакує її в першу вільну колонку без перетину за часом.
    lane: { type: Number, required: false, default: null, min: 0, max: 2 },
    // Кілометраж і вільна примітка (куди саме виїзд, що везти тощо). Введено
    // заради сторінки "Водії", але поля лишаються на рівні зміни, а не окремої
    // сутності: за структурою виїзд - це та сама зміна з service_type "Поїздка",
    // і дробити модель заради двох необовʼязкових полів немає причин.
    // null у distance_km означає "не вказано" - це не те саме, що 0 км.
    distance_km: { type: Number, required: false, default: null, min: 0 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.shift_id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = model('Shift', shiftSchema);
module.exports.SERVICE_TYPES = SERVICE_TYPES;
