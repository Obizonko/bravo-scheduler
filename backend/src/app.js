require('express-async-errors'); // дозволяє async-функціям в controllers кидати помилки в errorHandler без try/catch
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { config } = require('./config/env');
const routes = require('./routes');
const requestLogger = require('./middlewares/requestLogger');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();
const frontendDir = path.join(__dirname, '../../frontend');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use(config.apiPrefix, routes);
app.use(express.static(frontendDir));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
