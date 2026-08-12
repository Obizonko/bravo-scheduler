const { Schema, model, Types } = require('mongoose');

/**
 * Модель ActivityAssignment (колекція activity_assignments) - звʼязує User
 * та MasterPlan: хто задіяний у якій активності програми. На відміну від
 * Schedule (чергування, зі статусом Assigned/Completed/...), участь в
 * активності - проста участь без життєвого циклу.
 */
const activityAssignmentSchema = new Schema(
  {
    user_id: { type: Types.ObjectId, ref: 'User', required: true },
    master_plan_id: { type: Types.ObjectId, ref: 'MasterPlan', required: true },
  },
  {
    timestamps: true,
    collection: 'activity_assignments',
    toJSON: {
      transform: (_doc, ret) => {
        ret.assignment_id = ret._id.toString();
        ret.user_id = ret.user_id ? ret.user_id.toString() : ret.user_id;
        ret.master_plan_id = ret.master_plan_id ? ret.master_plan_id.toString() : ret.master_plan_id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

activityAssignmentSchema.index({ user_id: 1 });
activityAssignmentSchema.index({ master_plan_id: 1 });
// Одну й ту саму людину не призначаємо на ту саму активність двічі.
activityAssignmentSchema.index({ user_id: 1, master_plan_id: 1 }, { unique: true });

module.exports = model('ActivityAssignment', activityAssignmentSchema);
