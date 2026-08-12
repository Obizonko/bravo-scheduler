'use strict';

/**
 * Спільний шар для всіх сторінок фронтенду: виклики API з автоматичним
 * X-Admin-Pin, сесія адміна в sessionStorage (нічого не зберігається довше
 * вкладки браузера - легка авторизація без реальних облікових записів),
 * і невеликі UI-хелпери (бейдж адміна в топбарі, банер помилок/попереджень).
 */

const API_BASE = '/api/v1';
const SESSION_KEY = 'bravo_admin_session'; // { role: 'lead'|'super_admin', pin: string }

const Session = {
  get() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(role, pin) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role, pin }));
  },
  clear() {
    sessionStorage.removeItem(SESSION_KEY);
  },
  isLead() {
    const s = Session.get();
    return Boolean(s && (s.role === 'lead' || s.role === 'super_admin'));
  },
  isSuperAdmin() {
    const s = Session.get();
    return Boolean(s && s.role === 'super_admin');
  },
};

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const session = Session.get();
  const headers = { 'Content-Type': 'application/json' };
  if (session && session.pin) headers['X-Admin-Pin'] = session.pin;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* відповідь без тіла (204) або не-JSON */
  }

  if (!res.ok) {
    const message = json?.error?.message || `Помилка запиту (${res.status})`;
    throw new ApiError(message, res.status, json?.error?.details);
  }
  return json?.data;
}

const Api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

/** 'HH:mm' у локальному часі браузера - сервер трактує все як "настінний час", без TZ-конверсій. */
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Вставляє бейдж поточної ролі + посилання Увійти/Вийти в топбар кожної сторінки. */
function renderAuthBadge(container) {
  if (!container) return;
  const session = Session.get();

  container.innerHTML = '';
  const badge = document.createElement('div');
  badge.className = 'auth-badge';

  if (session) {
    const roleLabel = session.role === 'super_admin' ? 'Супер-адмін' : 'Адмін';
    badge.innerHTML = `
      <span class="role-pill role-pill--${session.role}">${roleLabel}</span>
      <button type="button" class="text-btn" id="authLogoutBtn">Вийти</button>
    `;
    container.appendChild(badge);
    document.getElementById('authLogoutBtn').addEventListener('click', () => {
      Session.clear();
      window.location.reload();
    });
  } else {
    badge.innerHTML = `<a class="text-btn" href="login.html">Увійти</a>`;
    container.appendChild(badge);
  }
}

/** Простий банер угорі сторінки для помилок/попереджень. Автоматично зникає для success. */
function showBanner(message, type = 'error') {
  let el = document.getElementById('globalBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalBanner';
    el.className = 'global-banner';
    document.body.prepend(el);
  }
  el.textContent = message;
  el.className = `global-banner global-banner--${type}`;
  el.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }
}

function hideBanner() {
  const el = document.getElementById('globalBanner');
  if (el) el.style.display = 'none';
}

const SERVICE_TYPE_ICONS = {
  Склад: 'package',
  ТЕЦ: 'zap',
  Поїздка: 'car',
  'Зовнішня активність': 'flag',
};

const RULE_SEVERITY_LABEL = { violation: 'Блок', warning: 'Увага' };

// --- Дата-утиліти для тижневих грідів і місячного календаря ---
// Рахуємо через UTC-епоху (не локальний Date-об'єкт напряму), той самий підхід,
// що й на бекенді (domain/time.js) - жодних сюрпризів з переведенням годинників.

const WEEKDAY_LABELS_UK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MONTH_LABELS_UK = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

function dateToDayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function dayIndexToDate(idx) {
  const d = new Date(idx * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDaysStr(dateStr, delta) {
  return dayIndexToDate(dateToDayIndex(dateStr) + delta);
}

function dayOfWeekMondayFirst(dateStr) {
  const dow = new Date(dateToDayIndex(dateStr) * 86400000).getUTCDay(); // 0=Нд
  return dow === 0 ? 6 : dow - 1; // 0=Пн..6=Нд
}

/** Понеділок тижня, що містить dateStr. */
function getMonday(dateStr) {
  return addDaysStr(dateStr, -dayOfWeekMondayFirst(dateStr));
}

function getWeekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(mondayStr, i));
}

function formatDayLabel(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${WEEKDAY_LABELS_UK[dayOfWeekMondayFirst(dateStr)]} ${d}.${m}`;
}

function formatWeekRangeLabel(mondayStr) {
  const sunday = addDaysStr(mondayStr, 6);
  const [, m1, d1] = mondayStr.split('-');
  const [, m2, d2] = sunday.split('-');
  return `${d1}.${m1} – ${d2}.${m2}`;
}

/** Інформація для рендеру місячного гріда (понеділок-перший тиждень). */
function getMonthGridInfo(year, month) {
  const firstDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = dayOfWeekMondayFirst(firstDateStr);
  return { firstDateStr, daysInMonth, leadingBlanks, year, month };
}

function formatMonthLabel(year, month) {
  return `${MONTH_LABELS_UK[month - 1]} ${year}`;
}

// --- Година↔піксель для драг-календарів (weekCalendar.js, masterPlan.js) ---

const HOUR_PX = 44;
const DAY_HEIGHT_PX = 24 * HOUR_PX;
const SNAP_MIN = 15;
const MIN_DURATION_MIN = 30;
const CLICK_THRESHOLD_PX = 6;

function hmToMin(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function minToHm(min) {
  const wrapped = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function snapMin(min) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function pxToMin(px) {
  return (px / HOUR_PX) * 60;
}

function minToPx(min) {
  return (min / 60) * HOUR_PX;
}

/** Кінець події для ВІЗУАЛЬНОГО позиціювання (переходи через північ обрізаємо на 24:00). */
function visualEndMin(item) {
  const start = hmToMin(item.time_start);
  const end = hmToMin(item.time_end);
  return end <= start ? 1440 : end;
}

function hourLabelsHtml() {
  let html = '';
  for (let h = 0; h < 24; h += 1) {
    html += `<div class="wc-hour-label" style="top:${h * HOUR_PX}px;">${String(h).padStart(2, '0')}:00</div>`;
  }
  return html;
}
