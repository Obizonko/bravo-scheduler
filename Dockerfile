# syntax=docker/dockerfile:1

# Контекст збірки - КОРІНЬ репозиторію (не backend/), бо backend/src/app.js
# сервить frontend/ статично за відносним шляхом '../../frontend' відносно
# backend/src - структура каталогів у контейнері має лишатись такою самою,
# як у репозиторії.

FROM node:20-alpine AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Непривілейований користувач - контейнер не повинен працювати від root без потреби
RUN addgroup -S scheduler && adduser -S scheduler -G scheduler

COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY frontend ./frontend

# logs/ читається/пишеться Winston відносно CWD (backend/) - створюємо наперед
# і віддаємо у власність непривілейованому користувачу, щоб перший запис не впав
RUN mkdir -p /app/backend/logs && chown -R scheduler:scheduler /app

USER scheduler
WORKDIR /app/backend

EXPOSE 3000

# Health-check б'є в наявний GET /api/v1/health - нічого додаткового писати не треба
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+(process.env.API_PREFIX||'/api/v1')+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
