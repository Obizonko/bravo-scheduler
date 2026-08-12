# Scheduler Backend

Backend API для системи планування змін та графіків співробітників («Браво»).
Побудований на **Node.js + Express**, з дотриманням принципів **Clean Architecture** та **SOLID**.

Як база даних використовується **MongoDB (Mongoose)**. Шар доступу до даних абстраговано
через спільний контракт `BaseRepository`, тож перехід на іншу СУБД (наприклад PostgreSQL)
не вимагає змін у бізнес-логіці (services/controllers) - лише додавання нового репозиторію
за тим самим інтерфейсом.

Понад базовий CRUD система реалізує **рушій правил планування чергувань** - буфери після
загальних активностей, заборону перезмінок під час кейтерингу, динамічні квоти залежно від
навантаження програми та захист водіїв як найдефіцитнішого ресурсу. Див. розділ
[«Рушій правил»](#рушій-правил-планування) нижче.

## Архітектура

```
src/
├── config/          # Конфігурація (.env) + config/rules.js (політика планування)
├── controllers/     # HTTP-шар: приймає req, викликає service, формує res
├── services/        # Бізнес-логіка, включно з services/rules/ - рушієм правил
├── repositories/     # Доступ до даних. BaseRepository - контракт,
│                      MongoRepository - реалізація поверх Mongoose,
│                      criteria.js - СУБД-агностичні критерії фільтра (inList/between/notEq)
├── domain/            # Чисті допоміжні модулі без БД: time.js (математика часу), constants.js
├── models/            # Mongoose-схеми (User, Shift, Schedule, MasterPlan)
├── routes/            # Express-роути, звʼязок URL -> controller
├── middlewares/        # validate, requireLead, errorHandler, requestLogger
├── validators/         # Joi-схеми валідації тіла запиту й query-параметрів
├── utils/              # logger, AppError та інші допоміжні класи
├── database/           # mongoClient - підключення до MongoDB через Mongoose
├── app.js              # Збірка Express-застосунку (middlewares + routes)
└── server.js            # Точка входу: підключення до БД + запуск HTTP-сервера

test/
├── fixtures/          # Будівники тестових даних (builders.js) і DayContext (context.js)
└── unit/              # node:test - домен, rules-модулі, валідатори, репозиторій
```

**Потік запиту:** `Route → Controller → Service → Repository → Database (MongoDB)`

Кожен шар залежить лише від абстракції нижчого рівня:
- `services` ніколи не звертаються до `mongoose` напряму - тільки через `repositories`.
- `repositories` реалізують спільний контракт `BaseRepository` (`findAll`, `findById`, `create`,
  `update`, `delete`). Фільтр `findAll()` - або звичайна рівність, або критерій зі
  `src/repositories/criteria.js` (`inList`, `between`, `notEq`) - так сервіси лишаються
  СУБД-агностичними навіть там, де потрібен `$in`. Щоб перейти на іншу СУБД, достатньо
  створити новий репозиторій (наприклад, `PostgresUserRepository`) з тим самим інтерфейсом.
- `services/rules/*` (крім `context.js`) - чисті синхронні функції без побічних ефектів і без
  звернень до БД: приймають готовий `DayContext` і повертають знахідки. Це і робить рушій
  правил тестованим без Mongo (див. `test/unit/rules.*.test.js`).

## Структура даних (MongoDB)

| Колекція | Призначення | Поля |
| --- | --- | --- |
| `users` | Співробітники | `user_id` (=`_id`), `name`, `is_driver`, `telegram_id`, `role` (`member`\|`lead`) |
| `shifts` | Довідник змін | `shift_id` (=`_id`), `date`, `time_start`, `time_end`, `workload`, `service_type`, `min_people`, `max_people`, `lane` (0-2, слот-колонка в тижневому календарі) |
| `schedules` | Графік чергувань (звʼязує `users` і `shifts`) | `record_id` (=`_id`), `shift_id` (ref → Shift), `user_id` (ref → User), `status` |
| `master_plans` | Загальна програма (для буферів/динамічних квот і підсвічування на Складі) | `record_id` (=`_id`), `name_of_activity`, `time_start`, `time_end`, `workload`, `date`, `is_daily`, `activity_kind` |
| `activity_assignments` | Хто задіяний у якій активності | `assignment_id` (=`_id`), `user_id` (ref → User), `master_plan_id` (ref → MasterPlan) |

Mongoose-схеми серіалізують `_id` у відповідне поле (`user_id`, `shift_id`, `record_id`) через
`toJSON.transform`, тому зовнішній API-контракт залишається стабільним незалежно від внутрішньої
реалізації зберігання.

**Канонічні формати часу** (застосовуються на запис через Joi; читання толерує старіші формати
через `domain/time.js#parseLoose*`, деградуючи в попередження `DATA_TIME_UNPARSEABLE`, а не падаючи):
- `date` - `YYYY-MM-DD` (реальна календарна дата)
- `time_start` / `time_end` - `HH:mm`, 24-годинний формат
- `time_end < time_start` означає перехід зміни через північ; `time_end === time_start` невалідне
- `min_people` / `max_people` на зміні - опційні. `null` (не задано) означає "квоту визначає
  рушій правил" на основі `service_type` і активностей Master Plan, що перетинаються за часом
- `MasterPlan.date` - конкретна дата активності; `is_daily: true` - активність повторюється
  щодня (руханка, прийоми їжі) і матеріалізується рушієм на кожну дату контексту. Рівно одне
  з двох обов'язкове
- Один фіксований локальний час на всю систему - конвертація часових поясів ніде не виконується

## Рушій правил планування

Реалізує логіку зі спеки «Все про розклад та хорс-тайм-менеджмент»: буфер 20+10 хв після
загальних активностей, заборону перезмінок у вікна кейтерингу, динамічні квоти залежно від
`workload` активності Master Plan, захист водіїв, нічні години.

**Гібридний енфорсмент** через `RULES_ENFORCEMENT` (`.env`):
- `off` - рушій рахує правила, але нічого не блокує й не логує
- `warn` (дефолт) - порушення повертаються у відповіді й логуються, але не блокують запис
- `block` - жорсткі порушення (`violations`) відхиляють `POST /schedule` кодом 409

Жорстко блокується лише фізично неможливе; решта - попередження. `force: true` в тілі
`POST /schedule` продавлює порушення при `block`, але **лише** для голови команди з дійсним PIN
(`X-Admin-Pin`, див. нижче) і **ніколи** для `PERSON_DOUBLE_BOOKED`.

### Коди правил

| Код | Severity | Група | Що означає |
| --- | --- | --- | --- |
| `PERSON_DOUBLE_BOOKED` | violation | overlap | Людина вже призначена на іншу зміну, що перетинається за часом |
| `DUPLICATE_ASSIGNMENT` | violation | overlap | Людину вже призначено на цю саму зміну |
| `SHIFT_CAPACITY_EXCEEDED` | violation | capacity | Перевищено ефективний `max_people` |
| `SHIFT_CLOSED` | violation | capacity | `max_people = 0` |
| `DRIVER_ON_STATIC_DURING_TRIP` | violation | driver | Водій вже на виїзді, що перетинається за часом |
| `ACTIVITY_BUFFER_TOO_SHORT` | warning | buffer | Розрив до зміни після активності < 30 хв |
| `CATERING_WINDOW_CHANGEOVER` | warning | catering | Старт/кінець зміни потрапляє у вікно кейтерингу |
| `OVERLAPS_ALL_HANDS_ACTIVITY` | warning | quota | Зміна перетинається з активністю, де задіяні всі |
| `QUOTA_OVER_RECOMMENDED` | warning | quota | Явний ліміт зміни вищий за рекомендовану політикою квоту |
| `MIN_PEOPLE_SHORTFALL` | warning | quota | Недобір нижче мінімуму (лише звіти, не при `assign`) |
| `QUIET_HOUR_DRIVER_UNPAIRED` | warning | driver | У тиху годину на зміні лише водій(ї), без не-водія |
| `DRIVER_RESERVED_FOR_TRIP` | warning | driver | Вільних водіїв менше, ніж непокритих виїздів |
| `OFF_HOURS_SHIFT` | warning | night | Зміна потрапляє у нічне вікно 23:00-06:00 |
| `OFF_HOURS_NO_EMERGENCY_CONTACT` | warning | night | Нічна зміна є, а `NIGHT_EMERGENCY_USER_ID` не задано |
| `NO_POST_MEMORIAL_DUTY` | warning | night | Після активності `activity_kind: 'memorial'` немає чергового |
| `GRACE_PERIOD_UNCOVERED` | warning | night | Немає покриття протягом пільгових хвилин після робочого часу |
| `DATA_TIME_UNPARSEABLE` | warning | data | Не вдалося розпізнати дату/час запису - часозалежні правила пропущено |
| `DATA_MASTERPLAN_NO_DATE` | warning | data | Активність без `date` і без `is_daily` |

Повний текст повідомлень і severity - у `src/services/rules/codes.js`.

## Деплой (Docker Compose) - рекомендований спосіб

Найпростіший шлях підняти весь стек (backend + MongoDB + фронтенд, який backend вже
сервить статично) на будь-якому сервері з Docker: `Dockerfile` і `docker-compose.yml`
лежать у **корені репозиторію** (на рівень вище за `backend/`), не всередині `backend/`.

```bash
git clone <URL_репозиторію> scheduler
cd scheduler
cp .env.example .env
# .env у корені - опційний, усі значення мають безпечні дефолти (RULES_ENFORCEMENT=warn,
# ADMIN_PIN порожній тощо). Відредагуйте, якщо потрібен конкретний PIN/нічний контакт.

docker compose up -d --build
```

Це піднімає два контейнери:
- `mongo` - офіційний образ `mongo:7`, дані персистяться в іменованому volume `mongo_data`
- `backend` - образ, зібраний з кореневого `Dockerfile`; чекає, поки Mongo пройде healthcheck,
  і лише тоді стартує (`depends_on: condition: service_healthy`)

Перевірка, що все піднялось:
```bash
curl http://localhost:3000/api/v1/health
# {"success":true,"message":"OK","timestamp":"..."}
```

Фронтенд (статичний макет) доступний там само: `http://localhost:3000/`.

**Оновлення на сервері після нових комітів:**
```bash
git pull
docker compose up -d --build
```

**Логи й діагностика:**
```bash
docker compose logs -f backend
docker compose ps        # стан health-check'ів обох сервісів
```

**Зупинка** (`down` без `-v` зберігає дані Mongo у volume для наступного запуску):
```bash
docker compose down
docker compose down -v   # + видалити дані Mongo і логи (повне очищення)
```

Порт на хості, `CORS_ORIGIN`, `RULES_ENFORCEMENT` та інші змінні редагуються в кореневому
`.env` (docker-compose читає його автоматично) - див. [«Змінні середовища»](#змінні-середовища).

## Локальний запуск без Docker (розробка)

Для розробки бекенду напряму (hot-reload через nodemon, дебагер тощо) без контейнерів.

### Підготовка MongoDB

**Варіант A - локально:**
```bash
docker run -d --name hr-mongo -p 27017:27017 mongo:7
```
Тоді `MONGO_URI=mongodb://localhost:27017/hr_scheduler`.

**Варіант B - MongoDB Atlas (хмара):**
1. Створіть безкоштовний кластер на [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Створіть користувача БД та дозвольте доступ з потрібної IP-адреси (або `0.0.0.0/0` для тестів).
3. Скопіюйте Connection String і вставте у `MONGO_URI` в `.env`, замінивши `<password>` та назву БД.

### Встановлення та запуск

Усі наступні команди - з каталогу `backend/` (там лежить `package.json`; цей README - у корені репозиторію, на рівень вище):

```bash
cd backend
npm install
cp .env.example .env
# заповніть .env своїм MONGO_URI

npm run dev     # розробка (nodemon)
npm start       # продакшн
npm test        # юніт-тести рушія правил, домену, валідаторів (node:test, без Mongo)
```

Індекси створюються Mongoose автоматично при першому підключенні, включно з унікальним
`{ shift_id, user_id }` у `schedules` (захист від подвійного призначення тієї самої людини на
ту саму зміну). **Перед першим запуском на непорожній базі** перевірте, що дублікатів ще немає:
```js
db.schedules.aggregate([
  { $group: { _id: { shift_id: '$shift_id', user_id: '$user_id' }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
])
```
інакше побудова індексу мовчки провалиться у фоні.

Сервер за замовчуванням стартує на `http://localhost:3000`, API - за префіксом `/api/v1`.

## Змінні середовища

Окрім базових (`PORT`, `MONGO_URI`, `CORS_ORIGIN`, ...) з `.env.example`:

| Змінна | Дефолт | Призначення |
| --- | --- | --- |
| `RULES_ENFORCEMENT` | `warn` | `off` \| `warn` \| `block` - див. «Рушій правил» |
| `NIGHT_EMERGENCY_USER_ID` | (порожньо) | `user_id` нічного чергового для `GET /status` і `OFF_HOURS_NO_EMERGENCY_CONTACT` |
| `NIGHT_KEY_LOCATION` | (порожньо) | Локація ключів від складу, віддається в `GET /status` при `night_mode` |
| `ADMIN_PIN` | (порожньо) | PIN голови команди. Не заданий - гейт `requireLead` пропускає все, `force` недоступний |
| `NOTIFICATIONS_WEBHOOK_URL` | (порожньо) | Не заданий - сповіщення про заміну лише логуються, нікуди не надсилаються |

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
| GET | `/api/v1/shifts/board?date=&service_type=` | Зміни служби на один день + повний список людей, одним запитом (таймлайн) |
| GET | `/api/v1/shifts/week-board?date_from=&date_to=&service_type=` | Те саме за діапазон дат, згруповано по днях (тижневий календар) |
| GET | `/api/v1/shifts/:id` | Зміна за ID |
| POST | `/api/v1/shifts` | Створити зміну (`lane` 0-2 - слот-колонка в тижневому календарі, опційно) |
| PUT | `/api/v1/shifts/:id` | Оновити зміну |
| DELETE | `/api/v1/shifts/:id` | Видалити зміну |

### Schedule
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/schedule` | Графік (фільтри: `?shift_id=`, `?user_id=`, `?status=`) |
| GET | `/api/v1/schedule/timeline?user_id=&date=` | Особистий таймлайн на дату (`getDailyTimelineForUser`), зі співчерговими й активностями |
| GET | `/api/v1/schedule/:id` | Запис графіка за ID |
| POST | `/api/v1/schedule/check` | Dry-run перевірка кандидата на призначення. Завжди 200, навіть якщо `ok:false` |
| POST | `/api/v1/schedule` | Призначити співробітника на зміну (`force:true` - лише lead+PIN, крім `PERSON_DOUBLE_BOOKED`) |
| POST | `/api/v1/schedule/:id/substitution` | `triggerSubstitution` - позначити зміну відкритою для заміни (ідемпотентно) |
| PATCH | `/api/v1/schedule/:id/status` | Змінити статус призначення |
| DELETE | `/api/v1/schedule/:id` | Видалити запис |

### Master Plan
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/master-plan` | Список активностей (фільтри: `?date=`, `?is_daily=`) |
| GET | `/api/v1/master-plan/:id` | Активність за ID |
| POST | `/api/v1/master-plan` | Створити активність |
| PUT | `/api/v1/master-plan/:id` | Оновити активність |
| DELETE | `/api/v1/master-plan/:id` | Видалити активність |

### Activity Assignments
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/activity-assignments` | Список (фільтри: `?user_id=`, `?master_plan_id=`) |
| POST | `/api/v1/activity-assignments` | Призначити людину на активність |
| DELETE | `/api/v1/activity-assignments/:id` | Зняти призначення |

### Моніторинг, звіти, авторизація
| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/v1/status?date=&at=` | Стан усіх служб на момент часу (дефолт - зараз). Сторінка моніторингу |
| GET | `/api/v1/people?date=&at=` | Хто зараз де - для сторінки "Люди" |
| GET | `/api/v1/people/:id/calendar?date_from=&date_to=` | Календар чергувань однієї людини за діапазон дат |
| GET | `/api/v1/reports/conflicts?date_from=&date_to=` | Усі порушення/попередження за діапазон дат (макс. 31 день). Сторінка адмінки |
| POST | `/api/v1/auth/pin` | Перевірка PIN (`ADMIN_PIN`/`SUPER_ADMIN_PIN`), повертає `{ role: 'lead'\|'super_admin' }` |

Усі відповіді мають формат:
```json
{ "success": true, "data": { ... } }
```
`POST /schedule` додає до цього нев'язкі `warnings`/`violations` (лише коли непорожні):
```json
{ "success": true, "data": { "record_id": "...", "status": "Assigned" },
  "warnings": [ { "code": "CATERING_WINDOW_CHANGEOVER", "severity": "warning", "...": "..." } ] }
```
Помилка:
```json
{ "success": false, "error": { "message": "...", "details": [...] } }
```
`RuleViolationError` (409 при `RULES_ENFORCEMENT=block`) кладе в `details` обʼєкт
`{ violations: [...], warnings: [...] }` - на відміну від `ValidationError`, де `details` це масив.

## Що вже враховано в бізнес-логіці

- `POST /schedule` проганяє кандидата через рушій правил (`services/rulesEngineService.js` →
  `services/rules/`): перетини в часі, місткість (коректно для `max_people = 0`), водії, буфери,
  кейтеринг, нічні години - див. «Рушій правил» вище.
- Валідація вхідних даних (Joi) на рівні маршруту - і тіла запиту, і query-параметрів
  (`middlewares/validate.js` → `validate.query()`/`validate.params()`), до потрапляння в контролер.
- Централізована обробка помилок (`AppError`, `NotFoundError`, `ValidationError`, `ConflictError`,
  `RuleViolationError`, `UnauthorizedError`, `ForbiddenError`).
- Легка авторизація голів команд через спільний PIN (`middlewares/requireLead.js`,
  `POST /auth/pin`) - для привілейованих дій (наразі: `force`-override порушень).
- Логування подій та HTTP-запитів (Winston + Morgan), окремі файли `logs/error.log`, `logs/combined.log`.

## Подальші кроки / масштабування

- Готовність до інтеграції з Telegram Bot: поле `telegram_id` вже присутнє в `Users`,
  `notificationService.js` - готова точка підключення (активується `NOTIFICATIONS_WEBHOOK_URL`).
- Перехід на іншу СУБД (наприклад PostgreSQL): реалізувати новий репозиторій за контрактом
  `BaseRepository` (включно з трьома операторами з `criteria.js`) і перемкнути `DB_DRIVER` у `.env`.
- PIN-гейт (`requireLead`) наразі захищає лише `force`-override при призначенні. Поширити його
  на CRUD змін/Master Plan/користувачів і на `GET /reports/conflicts` - свідоме рішення, яке
  варто ухвалити окремо (зачепить багато наявних маршрутів одразу).
- Фронтенд (папка `frontend/`) - статичний макет без жодної інтеграції з цим API.
  Під нові ендпоінти (`timeline`, `status`, `check`, `reports/conflicts`) вже закладено форму
  відповіді, зручну для рендеру Сторінок 1-3 зі спеки.

## Скрипти

Із каталогу `backend/`:

```bash
npm run lint          # перевірка ESLint (src + test)
npm run lint:fix       # автовиправлення
npm run format         # форматування Prettier
npm test               # node:test - без Mongo, лише чисті модулі
npm run test:watch     # те саме, у watch-режимі
node scripts/auditTimeFormats.js  # read-only: перелік рядків з неканонічним date/time_* -
                                   # виправлення завжди вручну через UI, автовиправлення немає навмисно
```

## Ліцензія

MIT
