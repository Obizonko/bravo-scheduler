# HR Scheduler Backend

Backend API для системи планування змін та графіків співробітників.
Побудований на **Node.js + Express**, з дотриманням принципів **Clean Architecture** та **SOLID**.

На початковому етапі як база даних використовується **Google Sheets** (кілька звʼязаних аркушів),
але шар доступу до даних абстраговано так, щоб перехід на **PostgreSQL** або **MongoDB**
не вимагав змін у бізнес-логіці (services/controllers).

## Архітектура

```
src/
├── config/          # Конфігурація (.env), єдине джерело правди для налаштувань
├── controllers/     # HTTP-шар: приймає req, викликає service, формує res
├── services/        # Бізнес-логіка, правила, перевірки цілісності
├── repositories/     # Доступ до даних. BaseRepository - контракт,
│                      GoogleSheetsRepository - поточна реалізація
├── models/           # JSDoc-описи форми сутностей (User, Shift, Schedule, MasterPlan)
├── routes/           # Express-роути, звʼязок URL -> controller
├── middlewares/       # validate, errorHandler, requestLogger
├── validators/        # Joi-схеми валідації вхідних даних
├── utils/             # logger, AppError та інші допоміжні класи
├── database/          # sheetsClient - низькорівнева обгортка над Google Sheets API
├── app.js             # Збірка Express-застосунку (middlewares + routes)
└── server.js           # Точка входу, запуск HTTP-сервера
```

**Потік запиту:** `Route → Controller → Service → Repository → Database (Google Sheets)`

Кожен шар залежить лише від абстракції нижчого рівня:
- `services` ніколи не звертаються до `googleapis` напряму - тільки через `repositories`.
- `repositories` реалізують спільний контракт `BaseRepository` (`findAll`, `findById`, `create`,
  `update`, `delete`). Щоб перейти на PostgreSQL/MongoDB, достатньо створити
  `PostgresUserRepository` / `MongoUserRepository` з тим самим інтерфейсом і підключити його
  у файлі `src/repositories/userRepository.js` (за прапорцем `DB_DRIVER` з `.env`).

## Структура даних (Google Sheets)

| Аркуш | Призначення |
| --- | --- |
| `Users` | Співробітники: `user_id`, `name`, `is_driver`, `telegram_id` |
| `Shifts` | Довідник змін: `shift_id`, `date`, `time_start`, `time_end`, `workload`, `service_type`, `min_people`, `max_people` |
| `Schedule` | Графік чергувань (звʼязує `Users` і `Shifts`): `record_id`, `shift_id`, `user_id`, `status` |
| `Master_plan` | План активностей: `record_id`, `name_of_activity`, `time_start`, `time_end`, `workload` |

## Підготовка Google Sheets

1. Створіть таблицю в Google Sheets із чотирма аркушами: `Users`, `Shifts`, `Schedule`, `Master_plan`
   (назви можна змінити через `.env`, головне щоб перший рядок кожного аркуша містив заголовки колонок
   з таблиці вище).
2. Створіть Service Account у [Google Cloud Console](https://console.cloud.google.com/), увімкніть
   Google Sheets API, згенеруйте JSON-ключ.
3. Надайте email сервісного акаунта (`client_email` з JSON) доступ **"Редактор"** до вашої таблиці
   (Поділитися → вставити email).
4. Скопіюйте `spreadsheetId` (з URL таблиці), `client_email` та `private_key` у `.env`.

## Встановлення та запуск

```bash
npm install
cp .env.example .env
# заповніть .env своїми значеннями (Google Sheets credentials)

npm run dev     # розробка (nodemon)
npm start       # продакшн
```

Сервер за замовчуванням стартує на `http://localhost:3000`, API - за префіксом `/api/v1`.

## API Ендпоінти

### Users
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/users` | Список користувачів |
| GET | `/api/v1/users/:id` | Користувач за ID |
| POST | `/api/v1/users` | Створити користувача |
| PUT | `/api/v1/users/:id` | Оновити користувача |
| DELETE | `/api/v1/users/:id` | Видалити користувача |

### Shifts
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/shifts` | Список змін (фільтри: `?date=`, `?service_type=`) |
| GET | `/api/v1/shifts/:id` | Зміна за ID |
| POST | `/api/v1/shifts` | Створити зміну |
| PUT | `/api/v1/shifts/:id` | Оновити зміну |
| DELETE | `/api/v1/shifts/:id` | Видалити зміну |

### Schedule
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/schedule` | Графік (фільтри: `?shift_id=`, `?user_id=`, `?status=`) |
| GET | `/api/v1/schedule/:id` | Запис графіка за ID |
| POST | `/api/v1/schedule` | Призначити співробітника на зміну |
| PATCH | `/api/v1/schedule/:id/status` | Змінити статус призначення |
| DELETE | `/api/v1/schedule/:id` | Видалити запис |

### Master Plan
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/master-plan` | Список активностей |
| GET | `/api/v1/master-plan/:id` | Активність за ID |
| POST | `/api/v1/master-plan` | Створити активність |
| PUT | `/api/v1/master-plan/:id` | Оновити активність |
| DELETE | `/api/v1/master-plan/:id` | Видалити активність |

Усі відповіді мають формат:
```json
{ "success": true, "data": { ... } }
```
або, у разі помилки:
```json
{ "success": false, "error": { "message": "...", "details": [...] } }
```

## Що вже враховано в бізнес-логіці

- При призначенні на зміну (`POST /schedule`) перевіряється, що `shift_id` та `user_id` існують,
  і що кількість активних призначень не перевищує `max_people` зі зв'язаної зміни.
- Валідація вхідних даних (Joi) на рівні маршруту, до потрапляння в контролер.
- Централізована обробка помилок (`AppError`, `NotFoundError`, `ValidationError`, `ConflictError`).
- Логування подій та HTTP-запитів (Winston + Morgan), окремі файли `logs/error.log`, `logs/combined.log`.

## Подальші кроки / масштабування

- Готовність до інтеграції з Telegram Bot: поле `telegram_id` вже присутнє в `Users`.
- Перехід на СУБД: реалізувати новий репозиторій (`PostgresUserRepository` тощо) за контрактом
  `BaseRepository` і перемкнути `DB_DRIVER` у `.env` - без змін у `services`/`controllers`.
- Додати автентифікацію/авторизацію (JWT) при потребі обмежити доступ до API.
- Додати тести (Jest/Supertest) для services та controllers.

## Скрипти

```bash
npm run lint        # перевірка ESLint
npm run lint:fix     # автовиправлення
npm run format       # форматування Prettier
```

## Ліцензія

MIT
