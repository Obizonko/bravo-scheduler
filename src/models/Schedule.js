const { Schema, model, Types } = require('mongoose');

const STATUSES = ['Assigned', 'Replacement', 'Completed'];

/**
 * Модель Schedule (колекція schedules) - звʼязує User та Shift.
 * shift_id/user_id зберігаються як реальні посилання (ObjectId ref),
 * що дає змогу використовувати .populate() при потребі.
 */
const scheduleSchema = new Schema(
  {
    shift_id: { type: Types.ObjectId, ref: 'Shift', required: true },
    user_id: { type: Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: STATUSES, default: 'Assigned' },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.record_id = ret._id.toString();
        ret.shift_id = ret.shift_id ? ret.shift_id.toString() : ret.shift_id;
        ret.user_id = ret.user_id ? ret.user_id.toString() : ret.user_id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

scheduleSchema.index({ shift_id: 1 });
scheduleSchema.index({ user_id: 1 });

module.exports = model('Schedule', scheduleSchema);
module.exports.STATUSES = STATUSES;
