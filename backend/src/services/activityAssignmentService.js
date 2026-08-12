const activityAssignmentRepository = require('../repositories/activityAssignmentRepository');
const userRepository = require('../repositories/userRepository');
const masterPlanRepository = require('../repositories/masterPlanRepository');
const { NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Участь людини в активності Master Plan (вкладка "Активності" на сторінці людини).
 * Проста участь без життєвого циклу - на відміну від Schedule немає статусів.
 */
class ActivityAssignmentService {
  async getAll(filter) {
    return activityAssignmentRepository.findAll(filter);
  }

  async create(data) {
    const user = await userRepository.findById(data.user_id);
    if (!user) throw new NotFoundError('Користувача, вказаного в user_id,');
    const activity = await masterPlanRepository.findById(data.master_plan_id);
    if (!activity) throw new NotFoundError('Активність, вказану в master_plan_id,');

    const record = await activityAssignmentRepository.create(data);
    logger.info('Людину призначено на активність', {
      assignment_id: record.assignment_id,
      user_id: data.user_id,
      master_plan_id: data.master_plan_id,
    });
    return record;
  }

  async remove(id) {
    const record = await activityAssignmentRepository.findById(id);
    if (!record) throw new NotFoundError('Призначення на активність');
    await activityAssignmentRepository.delete(id);
    logger.info('Знято призначення на активність', { assignment_id: id });
    return true;
  }
}

module.exports = new ActivityAssignmentService();
