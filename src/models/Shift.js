const { Schema, model } = require('mongoose');

const SERVICE_TYPES = ['Склад', 'ТЕЦ', 'Поїздка', 'Зовнішня активність'];

/**
 * Модель Shift (колекція shifts) - довідник змін (таймслотів).
 */
const shiftSchema = new Schema(
  {
    date: { type: String, required: true },
    time_start: { type: String, required: true },
    time_end: { type: String, required: true },
    workload: { type: String, default: '' },
    service_type: { type: String, enum: SERVICE_TYPES, required: true },
    min_people: { type: Number, required: true, min: 0 },
    max_people: { type: Number, required: true, min: 0 },
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
