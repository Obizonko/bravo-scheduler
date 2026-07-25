const { google } = require('googleapis');
const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Тонка обгортка над Google Sheets API.
 * Це єдине місце в проєкті, що знає про googleapis -
 * якщо колись знадобиться інший спосіб доступу до Sheets,
 * міняти доведеться лише цей файл.
 */
class SheetsClient {
  constructor() {
    this._sheetsApi = null;
  }

  async _getApi() {
    if (this._sheetsApi) return this._sheetsApi;

    const auth = new google.auth.JWT({
      email: config.googleSheets.clientEmail,
      key: config.googleSheets.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this._sheetsApi = google.sheets({ version: 'v4', auth });
    return this._sheetsApi;
  }

  /**
   * Повертає всі рядки аркуша як масив обʼєктів,
   * використовуючи перший рядок як заголовки колонок.
   */
  async getRows(sheetName) {
    const api = await this._getApi();
    const range = `${sheetName}!A:Z`;
    const response = await api.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.spreadsheetId,
      range,
    });

    const [headers = [], ...rows] = response.data.values || [];
    return rows
      .map((row, index) => {
        const record = { _rowNumber: index + 2 }; // +2: рядок 1 = заголовки, індексація з 1
        headers.forEach((header, colIndex) => {
          record[header] = row[colIndex] !== undefined ? row[colIndex] : '';
        });
        return record;
      })
      .filter((record) => Object.values(record).some((v) => v !== '' && v !== undefined));
  }

  async getHeaders(sheetName) {
    const api = await this._getApi();
    const response = await api.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.spreadsheetId,
      range: `${sheetName}!A1:Z1`,
    });
    return (response.data.values && response.data.values[0]) || [];
  }

  /**
   * Додає новий рядок в кінець аркуша відповідно до порядку колонок заголовків.
   */
  async appendRow(sheetName, record) {
    const api = await this._getApi();
    const headers = await this.getHeaders(sheetName);
    const row = headers.map((header) => (record[header] !== undefined ? record[header] : ''));

    await api.spreadsheets.values.append({
      spreadsheetId: config.googleSheets.spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    logger.debug(`Row appended to ${sheetName}`, { record });
    return record;
  }

  /**
   * Оновлює рядок за його фізичним номером (_rowNumber, отриманим з getRows).
   */
  async updateRow(sheetName, rowNumber, record) {
    const api = await this._getApi();
    const headers = await this.getHeaders(sheetName);
    const row = headers.map((header) => (record[header] !== undefined ? record[header] : ''));

    await api.spreadsheets.values.update({
      spreadsheetId: config.googleSheets.spreadsheetId,
      range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    logger.debug(`Row ${rowNumber} updated in ${sheetName}`, { record });
    return record;
  }

  /**
   * Очищує рядок (Sheets API v4 не має простого "видалити рядок за номером"
   * без знання sheetId, тому робимо через batchUpdate + deleteDimension).
   */
  async deleteRow(sheetName, rowNumber) {
    const api = await this._getApi();
    const sheetId = await this._getSheetId(sheetName);

    await api.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSheets.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });

    logger.debug(`Row ${rowNumber} deleted from ${sheetName}`);
  }

  async _getSheetId(sheetName) {
    const api = await this._getApi();
    const meta = await api.spreadsheets.get({
      spreadsheetId: config.googleSheets.spreadsheetId,
    });
    const sheet = meta.data.sheets.find((s) => s.properties.title === sheetName);
    if (!sheet) {
      throw new Error(`Аркуш "${sheetName}" не знайдено в таблиці`);
    }
    return sheet.properties.sheetId;
  }
}

module.exports = new SheetsClient();
