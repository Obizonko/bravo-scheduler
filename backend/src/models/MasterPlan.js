const { Schema, model } = require('mongoose');

/**
 * Модель MasterPlan (колекція master_plans) - план виконання робіт (загальна програма).
 * Використовується рушієм правил для виведення квоти чергування та перевірки буфера
 * (src/services/rules/quota.js, buffers.js).
 */
const masterPlanSchema = new Schema(
  {
    name_of_activity: { type: String, required: true, trim: true, minlength: 2, maxlength: 300 },
    time_start: { type: String, required: true },
    time_end: { type: String, required: true },
    // 'workload' навмисно лишається вільним рядком у моделі (не enum): контрольований
    // словник WORKLOAD_LEVELS enforce'иться лише в Joi на запис. Model-level enum зламав би
    // findByIdAndUpdate на будь-якому старому рядку зі значенням поза словником.
    workload: { type: String, default: '' },
    // Конкретна дата активності. null для повторюваних щоденних активностей (is_daily: true) -
    // рушій правил матеріалізує is_daily-активність на кожну дату контексту.
    date: { type: String, default: null },
    is_daily: { type: Boolean, default: false },
    activity_kind: { type: String, default: 'other', trim: true },
    // Колір бару в календарі (ключ палітри ACTIVITY_COLORS у фронтенді, не сам hex) -
    // так само вільний рядок, не model-level enum, з тих самих причин, що й workload.
    color: { type: String, default: 'blue' },
  },
  {
    timestamps: true,
    collection: 'master_plans',
    toJSON: {
      transform: (_doc, ret) => {
        ret.record_id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = model('MasterPlan', masterPlanSchema);
