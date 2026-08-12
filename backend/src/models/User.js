const { Schema, model } = require('mongoose');
const { ROLES } = require('../domain/constants');

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
    // 'lead' - голова команди, може підтверджувати PIN-ом і продавлювати м'які/окремі жорсткі
    // порушення правил (force). Дефолтні значення схеми застосовуються Mongoose і на читанні
    // старих документів, тож наявні рядки без цього поля коректно гідратуються як 'member'.
    role: { type: String, enum: ROLES, default: 'member' },
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
