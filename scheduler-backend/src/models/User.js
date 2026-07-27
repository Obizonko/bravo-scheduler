const { Schema, model } = require('mongoose');

/**
 * Модель User (колекція users).
 * toJSON.transform мапить Mongo _id на user_id, щоб зовнішній API-контракт
 * (user_id, shift_id, record_id тощо) не залежав від конкретної СУБД.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    is_driver: { type: Boolean, default: false },
    telegram_id: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.user_id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = model('User', userSchema);
