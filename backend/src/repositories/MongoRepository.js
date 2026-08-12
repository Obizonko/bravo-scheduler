const mongoose = require('mongoose');
const BaseRepository = require('./BaseRepository');
const { NotFoundError, ConflictError } = require('../utils/AppError');
const { isCriterion, OP_IN, OP_BETWEEN, OP_NE } = require('./criteria');

/**
 * Універсальна реалізація репозиторію поверх Mongoose.
 * Реалізує спільний контракт BaseRepository, тому services/controllers
 * не залежать від конкретної СУБД під капотом.
 */
class MongoRepository extends BaseRepository {
  /**
   * @param {import('mongoose').Model} model - Mongoose-модель
   * @param {string} entityLabel - людяна назва сутності для повідомлень про помилки
   */
  constructor(model, entityLabel) {
    super();
    this.model = model;
    this.entityLabel = entityLabel;
  }

  /**
   * Перекладає СУБД-агностичні критерії (src/repositories/criteria.js) на мову
   * Mongo-запиту. Звичайні (не-критерійні) значення проходять як рівність, як і раніше.
   */
  _toMongoFilter(filter = {}) {
    const mongoFilter = {};
    for (const [field, rawValue] of Object.entries(filter)) {
      if (!isCriterion(rawValue)) {
        mongoFilter[field] = rawValue;
        continue;
      }
      switch (rawValue.__op) {
        case OP_IN:
          mongoFilter[field] = { $in: rawValue.values };
          break;
        case OP_BETWEEN:
          mongoFilter[field] = { $gte: rawValue.from, $lte: rawValue.to };
          break;
        case OP_NE:
          mongoFilter[field] = { $ne: rawValue.value };
          break;
        default:
          throw new Error(`Непідтримуваний критерій фільтра: ${rawValue.__op}`);
      }
    }
    return mongoFilter;
  }

  async findAll(filter = {}) {
    const docs = await this.model.find(this._toMongoFilter(filter)).sort({ createdAt: 1 }).exec();
    return docs.map((doc) => doc.toJSON());
  }

  async findById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).exec();
    return doc ? doc.toJSON() : null;
  }

  async create(data) {
    try {
      const doc = await this.model.create(data);
      return doc.toJSON();
    } catch (err) {
      // E11000 - порушення унікального індексу (напр. Schedule{shift_id,user_id}).
      // Без цього перехоплення дублювання спливало б як непередбачений 500.
      if (err && err.code === 11000) {
        throw new ConflictError(`${this.entityLabel}: такий запис вже існує`, {
          keyPattern: err.keyPattern,
        });
      }
      throw err;
    }
  }

  async update(id, data) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError(this.entityLabel);
    }
    const doc = await this.model.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
    if (!doc) throw new NotFoundError(this.entityLabel);
    return doc.toJSON();
  }

  async delete(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError(this.entityLabel);
    }
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundError(this.entityLabel);
    return true;
  }
}

module.exports = MongoRepository;
