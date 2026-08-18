const userRepository = require('../repositories/userRepository');
const { NotFoundError, ForbiddenError } = require('../utils/AppError');
const logger = require('../utils/logger');
const generatePin = require('../utils/generatePin');

/** Максимум спроб підібрати унікальний PIN, перш ніж здатися (шанс колізії
 * на 6-значному просторі й жменьці людей мізерний - це лише запобіжник). */
const MAX_PIN_ATTEMPTS = 10;

class UserService {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Список людей команди. Зовнішні водії (is_external) сюди НЕ входять: цей
   * ендпоінт живить вкладку "Люди" в активностях майстер-плану й таблицю
   * "Адміни", а зовнішній водій не бере участі ні в тому, ні в тому. Сторінці
   * "Водії" він і не потрібен - вона бере людей з тижневого борду поїздок,
   * куди зовнішні пропускаються окремим правилом.
   */
  async getAll() {
    const users = await this.repository.findAll();
    return users.filter((u) => !u.is_external);
  }

  async getById(id) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundError('Користувача');
    return user;
  }

  async create(data) {
    const user = await this.repository.create(data);
    logger.info('Створено нового користувача', { user_id: user.user_id });
    return user;
  }

  async _generateUniquePin() {
    for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
      const candidate = generatePin();
      // eslint-disable-next-line no-await-in-loop
      const clashes = await this.repository.findAll({ pin: candidate });
      if (clashes.length === 0) return candidate;
    }
    throw new Error('Не вдалося згенерувати унікальний PIN за розумну кількість спроб');
  }

  /**
   * Персональний PIN замість спільного ADMIN_PIN: щойно людину роблять
   * адміном (member -> lead), генерується й зберігається унікальний PIN -
   * повертається ОДИН РАЗ у відповіді (generated_pin), у базі лишається лише
   * сам PIN (без хешування - "PIN-и можуть бути публічними" для цієї короткої
   * події, той самий рівень довіри, що й для ADMIN_PIN/SUPER_ADMIN_PIN раніше).
   * При знятті прав (lead -> member) PIN скидається - більше не пускає.
   */
  async update(id, data) {
    const before = await this.getById(id); // перевірка існування, кине NotFoundError

    // userValidator.js вже не пускає role:'super_admin' через API, але не
    // заважає ЗМІНИТИ роль людини, яка ВЖЕ super_admin (наприклад, випадково
    // поставити їй role:'lead') - той єдиний запис має лишатися недоторканним
    // через цей ендпоінт, роль супер-адміна змінюється лише напряму в БД.
    if (before.role === 'super_admin' && data.role !== undefined && data.role !== 'super_admin') {
      throw new ForbiddenError('Не можна змінити роль супер-адміна через цей ендпоінт');
    }

    const payload = { ...data };
    let generatedPin = null;
    const promotingToLead = data.role === 'lead' && before.role !== 'lead';
    const demotingFromLead = data.role && data.role !== 'lead' && before.role === 'lead';

    if (promotingToLead) {
      generatedPin = await this._generateUniquePin();
      payload.pin = generatedPin;
    } else if (demotingFromLead) {
      payload.pin = null;
    }

    const updated = await this.repository.update(id, payload);
    logger.info('Оновлено користувача', { user_id: id, role_changed: data.role !== undefined });
    return { ...updated, generated_pin: generatedPin };
  }

  async remove(id) {
    await this.getById(id);
    await this.repository.delete(id);
    logger.info('Видалено користувача', { user_id: id });
    return true;
  }
}

module.exports = new UserService(userRepository);
