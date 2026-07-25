const { v4: uuidv4 } = require('uuid');
const BaseRepository = require('./BaseRepository');
const sheetsClient = require('../database/sheetsClient');
const { NotFoundError } = require('../utils/AppError');

/**
 * Універсальна реалізація репозиторію поверх Google Sheets.
 * Кожна сутність (Users, Shifts, Schedule, Master_plan) працює через
 * цей клас, вказуючи назву аркуша та назву поля-ідентифікатора.
 */
class GoogleSheetsRepository extends BaseRepository {
  /**
   * @param {string} sheetName - назва аркуша в Google Sheets
   * @param {string} idField - назва колонки-ідентифікатора (напр. "user_id")
   * @param {string} entityLabel - людяна назва сутності для повідомлень про помилки
   */
  constructor(sheetName, idField, entityLabel) {
    super();
    this.sheetName = sheetName;
    this.idField = idField;
    this.entityLabel = entityLabel;
  }

  async findAll(filter = {}) {
    const rows = await sheetsClient.getRows(this.sheetName);
    const filterKeys = Object.keys(filter);
    if (filterKeys.length === 0) return rows.map((r) => this._strip(r));

    return rows
      .filter((row) => filterKeys.every((key) => String(row[key]) === String(filter[key])))
      .map((r) => this._strip(r));
  }

  async findById(id) {
    const rows = await sheetsClient.getRows(this.sheetName);
    const row = rows.find((r) => String(r[this.idField]) === String(id));
    if (!row) return null;
    return this._strip(row);
  }

  async create(data) {
    const id = data[this.idField] || uuidv4();
    const record = { ...data, [this.idField]: id };
    await sheetsClient.appendRow(this.sheetName, record);
    return record;
  }

  async update(id, data) {
    const rows = await sheetsClient.getRows(this.sheetName);
    const existing = rows.find((r) => String(r[this.idField]) === String(id));
    if (!existing) {
      throw new NotFoundError(this.entityLabel);
    }
    const merged = { ...existing, ...data, [this.idField]: id };
    delete merged._rowNumber;
    await sheetsClient.updateRow(this.sheetName, existing._rowNumber, merged);
    return merged;
  }

  async delete(id) {
    const rows = await sheetsClient.getRows(this.sheetName);
    const existing = rows.find((r) => String(r[this.idField]) === String(id));
    if (!existing) {
      throw new NotFoundError(this.entityLabel);
    }
    await sheetsClient.deleteRow(this.sheetName, existing._rowNumber);
    return true;
  }

  _strip(row) {
    const { _rowNumber, ...rest } = row;
    return rest;
  }
}

module.exports = GoogleSheetsRepository;
