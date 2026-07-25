const mongoose = require('mongoose');
const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Підключення до MongoDB через Mongoose.
 * Викликається один раз при старті сервера (server.js).
 */
async function connectMongo() {
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB: зʼєднання встановлено');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB: помилка зʼєднання', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB: зʼєднання розірвано');
  });

  await mongoose.connect(config.mongo.uri);
  return mongoose.connection;
}

async function disconnectMongo() {
  await mongoose.disconnect();
}

module.exports = { connectMongo, disconnectMongo, mongoose };
