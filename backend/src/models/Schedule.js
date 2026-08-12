const { Schema, model, Types } = require('mongoose');
const { STATUSES } = require('../domain/constants');

/**
 * Модель Schedule (колекція schedules) - звʼязує User та Shift.
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
// Одна людина - один активний запис на конкретну зміну. Захищає від дублювання
// призначень, яке інакше й накручує лічильник проти max_people.
// ПОПЕРЕДЖЕННЯ ПЕРЕД ДЕПЛОЄМ: якщо в базі вже є дублікати (shift_id, user_id),
// побудова цього індексу мовчки провалиться у фоні - перевірити агрегацією
// { $group: { _id: { shift_id: '$shift_id', user_id: '$user_id' }, count: { $sum: 1 } } }
// і прибрати дублікати вручну до першого запуску на непорожній базі.
scheduleSchema.index({ shift_id: 1, user_id: 1 }, { unique: true });

module.exports = model('Schedule', scheduleSchema);
module.exports.STATUSES = STATUSES;
