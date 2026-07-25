# HR Scheduler Backend

Backend API для системи планування змін та графіків співробітників.
Побудований на **Node.js + Express**, з дотриманням принципів **Clean Architecture** та **SOLID**.

Як база даних використовується **MongoDB (Mongoose)**. Шар доступу до даних абстраговано
через спільний контракт `BaseRepository`, тож перехід на іншу СУБД (або повернення до
Google Sheets - реалізація також є в проєкті) не вимагає змін у бізнес-логіці
(services/controllers) - лише перемикання `DB_DRIVER` у `.env`.

## Архітектура

```
src/
├── config/          # Конфігурація (.env), єдине джерело правди для налаштувань
├── controllers/     # HTTP-шар: приймає req, викликає service, формує res
├── services/        # Бізнес-логіка, правила, перевірки цілісності
├── repositories/     # Доступ до даних. BaseRepository - контракт,
│                      MongoRepository - поточна реалізація (є й GoogleSheetsRepository)
├── models/           # Mongoose-схеми (User, Shift, Schedule, MasterPlan)
├── routes/           # Express-роути, звʼязок URL -> controller
├── middlewares/       # validate, errorHandler, requestLogger
├── validators/        # Joi-схеми валідації вхідних даних
├── utils/             # logger, AppError та інші допоміжні класи
├── database/          # mongoClient (Mongoose-підключення) та sheetsClient (Google Sheets API)
├── app.js             # Збірка Express-застосунку (middlewares + routes)
└── server.js           # Точка входу: підключення до БД + запуск HTTP-сервера
```

**Потік запиту:** `Route → Controller → Service → Repository → Database (MongoDB)`

Кожен шар залежить лише від абстракції нижчого рівня:
- `services` ніколи не звертаються до `mongoose` напряму - тільки через `repositories`.
- `repositories` реалізують спільний контракт `BaseRepository` (`findAll`, `findById`, `create`,
  `update`, `delete`). Щоб перейти на іншу СУБД, достатньо створити новий репозиторій
  (наприклад, `PostgresUserRepository`) з тим самим інтерфейсом і підключити його
  у файлі `src/repositories/userRepository.js` (за прапорцем `DB_DRIVER` з `.env`,
  підтримувані значення: `mongo` | `google_sheets`).

## Структура даних (MongoDB)

| Колекція | Призначення | Поля |
| --- | --- | --- |
| `users` | Співробітники | `user_id` (=`_id`), `name`, `is_driver`, `telegram_id` |
| `shifts` | Довідник змін | `shift_id` (=`_id`), `date`, `time_start`, `time_end`, `workload`, `service_type`, `min_people`, `max_people` |
| `schedules` | Графік чергувань (звʼязує `users` і `shifts`) | `record_id` (=`_id`), `shift_id` (ref → Shift), `user_id` (ref → User), `status` |
| `master_plans` | План активностей | `record_id` (=`_id`), `name_of_activity`, `time_start`, `time_end`, `workload` |

Mongoose-схеми серіалізують `_id` у відповідне поле (`user_id`, `shift_id`, `record_id`) через
`toJSON.transform`, тому зовнішній API-контракт залишається стабільним незалежно від внутрішньої
реалізації зберігання.

## Підготовка MongoDB

**Варіант A - локально:**
```bash
# наприклад, через Docker
docker run -d --name hr-mongo -p 27017:27017 mongo:7
```
Тоді `MONGO_URI=mongodb://localhost:27017/hr_scheduler`.

**Варіант B - MongoDB Atlas (хмара):**
1. Створіть безкоштовний кластер на [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Створіть користувача БД та дозвольте доступ з потрібної IP-адреси (або `0.0.0.0/0` для тестів).
3. Скопіюйте Connection String і вставте у `MONGO_URI` в `.env`, замінивши `<password>` та назву БД.

## Встановлення та запуск

```bash
npm install
cp .env.example .env
# заповніть .env своїм MONGO_URI

npm run dev     # розробка (nodemon)
npm start       # продакшн
```

Індекси (`shift_id`, `user_id` у `schedules`) створюються Mongoose автоматично при першому підключенні.

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
- Перехід на іншу СУБД (наприклад PostgreSQL): реалізувати новий репозиторій за контрактом
  `BaseRepository` і перемкнути `DB_DRIVER` у `.env` - без змін у `services`/`controllers`.
- Можна використати `.populate()` у `Schedule`-репозиторії, якщо знадобиться повертати
  вкладені дані користувача/зміни в одному запиті.
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
