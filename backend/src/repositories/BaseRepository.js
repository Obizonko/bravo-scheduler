/**
 * Абстрактний контракт репозиторію.
 *
 * Сервіси залежать ТІЛЬКИ від цього інтерфейсу, а не від конкретної реалізації.
 * Це і є той шар абстракції, який дозволяє замінити Google Sheets на
 * PostgreSQL/MongoDB, написавши новий клас-нащадок (наприклад,
 * PostgresUserRepository) без жодних змін у services/controllers.
 *
 * Контракт фільтра findAll(): звичайний обʼєкт "поле -> значення" означає
 * рівність. Для складніших умов значення поля може бути критерієм із
 * src/repositories/criteria.js (inList/between/notEq) - кожна реалізація
 * BaseRepository зобовʼязана підтримувати ці три оператори (див.
 * MongoRepository#_toMongoFilter як приклад перекладу критеріїв на мову
 * конкретної СУБД).
 */
class BaseRepository {
  async findAll(_filter = {}) {
    throw new Error('findAll() must be implemented');
  }

  async findById(_id) {
    throw new Error('findById() must be implemented');
  }

  async create(_data) {
    throw new Error('create() must be implemented');
  }

  async update(_id, _data) {
    throw new Error('update() must be implemented');
  }

  async delete(_id) {
    throw new Error('delete() must be implemented');
  }
}

module.exports = BaseRepository;
