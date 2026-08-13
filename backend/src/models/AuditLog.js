const { Schema, model, Types } = require('mongoose');

/**
 * Модель AuditLog (колекція audit_logs) - хто що зробив зі змінами/
 * призначеннями/активностями. Видимий лише супер-адміну (GET /audit-log).
 *
 * actor_name/summary навмисно ЗБЕРІГАЮТЬСЯ як текстовий знімок на момент дії
 * (а не лише посилання на User/Shift), щоб запис лишався читабельним навіть
 * якщо людину чи зміну згодом видалили/перейменували.
 */
const auditLogSchema = new Schema(
  {
    actor_id: { type: Types.ObjectId, ref: 'User', default: null },
    actor_name: { type: String, required: true },
    action: { type: String, required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: String, default: null },
    summary: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'audit_logs',
    toJSON: {
      transform: (_doc, ret) => {
        ret.log_id = ret._id.toString();
        ret.actor_id = ret.actor_id ? ret.actor_id.toString() : null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = model('AuditLog', auditLogSchema);
