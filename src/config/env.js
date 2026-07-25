require('dotenv').config();

/**
 * Централізована конфігурація застосунку.
 * Всі змінні середовища читаються тільки тут - решта коду
 * імпортує вже готовий обʼєкт config.
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  dbDriver: process.env.DB_DRIVER || 'google_sheets',

  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    sheets: {
      users: process.env.SHEET_USERS || 'Users',
      shifts: process.env.SHEET_SHIFTS || 'Shifts',
      schedule: process.env.SHEET_SCHEDULE || 'Schedule',
      masterPlan: process.env.SHEET_MASTER_PLAN || 'Master_plan',
    },
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};

function assertRequiredConfig() {
  if (config.dbDriver === 'google_sheets') {
    const required = [
      ['GOOGLE_SHEETS_SPREADSHEET_ID', config.googleSheets.spreadsheetId],
      ['GOOGLE_SERVICE_ACCOUNT_EMAIL', config.googleSheets.clientEmail],
      ['GOOGLE_PRIVATE_KEY', config.googleSheets.privateKey],
    ];
    const missing = required.filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(
        `Відсутні обовʼязкові змінні середовища для Google Sheets: ${missing.join(', ')}`
      );
    }
  }
}

module.exports = { config, assertRequiredConfig };
