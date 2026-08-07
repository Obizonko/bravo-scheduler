const mongoose = require('mongoose');
const BaseRepository = require('./BaseRepository');
const { NotFoundError } = require('../utils/AppError');

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

  async findAll(filter = {}) {
    const docs = await this.model.find(filter).sort({ createdAt: 1 }).exec();
    return docs.map((doc) => doc.toJSON());
  }

  async findById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).exec();
    return doc ? doc.toJSON() : null;
  }

  async create(data) {
    const doc = await this.model.create(data);
    return doc.toJSON();
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
