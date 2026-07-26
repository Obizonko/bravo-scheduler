const { Schema, model } = require('mongoose');

/**
 * Модель MasterPlan - план виконання робіт
 */
const masterPlanSchema = new Schema(
  {
    name_of_activity: { type: String, required: true, trim: true, minlength: 2, maxlength: 300 },
    time_start: { type: String, required: true },
    time_end: { type: String, required: true },
    workload: { type: String, default: '' },
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
