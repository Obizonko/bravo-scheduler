const crypto = require('crypto');

/**
 * Випадковий 6-значний числовий PIN (той самий формат, що й старі
 * ADMIN_PIN/SUPER_ADMIN_PIN у .env) - crypto.randomInt, а не Math.random,
 * бо це секрет для входу, навіть якщо загроза для цієї короткої події невисока.
 */
function generatePin() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

module.exports = generatePin;
