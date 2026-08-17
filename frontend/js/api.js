'use strict';

/**
 * Спільний шар для всіх сторінок фронтенду: виклики API з автоматичним
 * X-Admin-Pin, сесія адміна в sessionStorage (нічого не зберігається довше
 * вкладки браузера - легка авторизація без реальних облікових записів),
 * і невеликі UI-хелпери (бейдж адміна в топбарі, банер помилок/попереджень).
 */

const API_BASE = '/api/v1';
const SESSION_KEY = 'bravo_admin_session'; // { role: 'lead'|'super_admin', pin, user_id?, name? }

const Session = {
  get() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  /** userId/name - опційні: заповнені лише коли PIN персональний (не старий спільний). */
  set(role, pin, userId, name) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role, pin, user_id: userId || null, name: name || null }));
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
    const nameLabel = session.name ? ` · ${session.name}` : '';
    badge.innerHTML = `
      <span class="role-pill role-pill--${session.role}">${roleLabel}${nameLabel}</span>
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

// Коди порушень, які НІКОЛИ не продавлюються навіть з force:true - людина
// фізично не може бути в двох місцях одночасно. Мусить збігатись зі списком
// hasUnoverridable у backend/src/services/scheduleService.js.
const UNOVERRIDABLE_VIOLATION_CODES = ['PERSON_DOUBLE_BOOKED', 'PERSON_ON_ACTIVITY'];

/**
 * Єдина точка призначення людини на зміну - dry-run check, і залежно від
 * результату або звичайний POST, або (для порушень, які МОЖНА продавити,
 * напр. перевищення квоти) підтвердження й POST з force:true. Порушення зі
 * списку UNOVERRIDABLE_VIOLATION_CODES не пропонує продавлювати взагалі -
 * бекенд однаково відхилить (RULES_ENFORCEMENT=block), тож питати "все одно?"
 * було б оманливим.
 *
 * @returns {Promise<{success:boolean, warnings?:object[]}>}
 */
async function assignPersonToShift(shiftId, userId) {
  const check = await Api.post('/schedule/check', { shift_id: shiftId, user_id: userId });

  if (check.ok) {
    await Api.post('/schedule', { shift_id: shiftId, user_id: userId });
    return { success: true, warnings: check.warnings };
  }

  const hasUnoverridable = check.violations.some((v) => UNOVERRIDABLE_VIOLATION_CODES.includes(v.code));
  if (hasUnoverridable) {
    showBanner('Не можна призначити: ' + check.violations.map((v) => v.message).join('; '), 'error');
    return { success: false };
  }

  const proceed = window.confirm(
    'Знайдено жорсткі порушення правил:\n\n' +
    check.violations.map((v) => '- ' + v.message).join('\n') +
    '\n\nВсе одно призначити?'
  );
  if (!proceed) return { success: false };

  await Api.post('/schedule', { shift_id: shiftId, user_id: userId, force: true });
  return { success: true, warnings: check.warnings };
}

/** Гамбургер-кнопка + затемнення для сайдбару на мобільній ширині (<=576px,
 * див. style.css) - раніше сайдбар на цій ширині просто зникав без заміни,
 * і навігація між сторінками ставала неможливою. Викликається одноразово
 * з кожної сторінки, що має `.sidebar` (поруч з renderAuthBadge). */
function initMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || document.querySelector('.mobile-nav-toggle')) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-nav-toggle';
  toggle.setAttribute('aria-label', 'Меню');
  toggle.innerHTML = '<i data-lucide="menu"></i>';

  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-nav-backdrop';

  document.body.appendChild(backdrop);
  document.body.appendChild(toggle);

  const close = () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('mobile-nav-open');
  };
  const open = () => {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('mobile-nav-open');
  };

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) close();
    else open();
  });
  backdrop.addEventListener('click', close);
  sidebar.querySelectorAll('a.nav-item').forEach((link) => {
    link.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  if (window.lucide) lucide.createIcons();
}

const SERVICE_TYPE_ICONS = {
  Склад: 'package',
  ТЕЦ: 'zap',
  Поїздка: 'car',
  'Зовнішня активність': 'flag',
};

const RULE_SEVERITY_LABEL = { violation: 'Блок', warning: 'Увага' };

/**
 * Палітра кольорів барів активності Master Plan (masterPlan.js, personModal.js).
 * Ключі мусять збігатись із backend/src/domain/constants.js ACTIVITY_COLORS -
 * там лише контрольований словник для валідації, самі hex живуть тут.
 */
const ACTIVITY_COLORS = {
  blue: { label: 'Синій', bg: '#E0EDFF', border: '#93B4E8', text: '#1E3A6E' },
  green: { label: 'Зелений', bg: '#E3F9E5', border: '#86D992', text: '#1B5E20' },
  pink: { label: 'Рожевий', bg: '#FDE2E4', border: '#F4A6AD', text: '#7A1F2B' },
  purple: { label: 'Фіолетовий', bg: '#EDE7F6', border: '#B39DDB', text: '#4527A0' },
  orange: { label: 'Помаранчевий', bg: '#FFF1DE', border: '#FFB74D', text: '#8A5300' },
  yellow: { label: 'Жовтий', bg: '#FFF9D9', border: '#E6C200', text: '#5B4400' },
  teal: { label: 'Бірюзовий', bg: '#E0F7FA', border: '#4DD0E1', text: '#006064' },
  grey: { label: 'Сірий', bg: '#F3F4F6', border: '#B0B7C3', text: '#374151' },
};

/** Інлайн-стиль бару за ключем кольору - override .mp-bar CSS (специфічність inline > class). */
function activityColorStyle(colorKey) {
  const c = ACTIVITY_COLORS[colorKey] || ACTIVITY_COLORS.blue;
  return `background:${c.bg}; border-color:${c.border}; color:${c.text};`;
}

/** Ряд клікабельних кружечків-кольорів + прихований input, куди пишеться обраний ключ. */
function colorSwatchesHtml(selectedKey, inputId) {
  const selected = selectedKey || 'blue';
  const swatches = Object.entries(ACTIVITY_COLORS)
    .map(([key, c]) => `
        <button type="button" class="color-swatch ${key === selected ? 'selected' : ''}"
            data-color="${key}" data-input-id="${inputId}"
            style="background:${c.bg}; border-color:${c.border};" title="${c.label}"></button>
    `)
    .join('');
  return `<div class="color-swatches">${swatches}</div><input type="hidden" id="${inputId}" value="${selected}">`;
}

/** Клік по кружечку - оновлює прихований input і візуально позначає обраний. Викликати після вставки colorSwatchesHtml() у DOM. */
function wireColorSwatches(containerEl) {
  containerEl.querySelectorAll('.color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.inputId;
      const group = btn.closest('.color-swatches');
      group.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById(inputId).value = btn.dataset.color;
    });
  });
}

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

/** Плаваюча підказка точного часу під час create/resize/move-драгу в
 * weekCalendar.js та masterPlan.js - один спільний DOM-елемент на сторінку. */
const DragTooltip = {
  el: null,
  ensure() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'drag-time-tooltip';
      document.body.appendChild(this.el);
    }
    return this.el;
  },
  show(text, clientX, clientY) {
    const el = this.ensure();
    el.textContent = text;
    el.style.left = `${clientX + 14}px`;
    el.style.top = `${clientY - 32}px`;
    el.classList.add('visible');
  },
  hide() {
    if (this.el) this.el.classList.remove('visible');
  },
};

function hourLabelsHtml() {
  let html = '';
  for (let h = 0; h < 24; h += 1) {
    html += `<div class="wc-hour-label" style="top:${h * HOUR_PX}px;">${String(h).padStart(2, '0')}:00</div>`;
  }
  return html;
}

// --- Ширина колонок тижневих сіток ---
//
// Живе однією CSS-змінною --wc-col-w на :root, а сітки підставляють її в
// minmax(). Тому один регулятор керує Складом, ТЕЦ, Водіями, Майстер-планом і
// модалкою людини одночасно - без окремого стану на кожній сторінці.
//
// minmax(W, 1fr): поки колонки вміщаються, вони розтягуються на всю ширину;
// щойно W стає більшим за доступне місце - сітка виходить за екран, і
// .wc-scroll дає горизонтальну прокрутку. Саме так "розтягування" і працює.

const COL_WIDTH_KEY = 'bravo_col_width';
const COL_WIDTH_DEFAULT = 74;
const COL_WIDTH_MIN = 56;
const COL_WIDTH_MAX = 320;
const COL_WIDTH_STEP = 28;

function getColumnWidth() {
  const raw = Number(localStorage.getItem(COL_WIDTH_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return COL_WIDTH_DEFAULT;
  return Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, raw));
}

function applyColumnWidth(px) {
  document.documentElement.style.setProperty('--wc-col-w', `${px}px`);
}

/**
 * Кнопки «вужче/ширше» в панель .week-nav. Ширина зберігається в localStorage,
 * тож вибір переживає перезавантаження й переходи між сторінками.
 * Викликається до першого рендеру сітки - змінна має бути виставлена заздалегідь.
 */
function initColumnWidth() {
  applyColumnWidth(getColumnWidth());

  const nav = document.querySelector('.week-nav');
  if (!nav || document.getElementById('colWidthControl')) return;

  const wrap = document.createElement('div');
  wrap.className = 'col-width-control';
  wrap.id = 'colWidthControl';
  wrap.innerHTML = `
    <span class="col-width-label">Ширина</span>
    <button type="button" class="text-btn" data-step="-1" title="Вужчі колонки" aria-label="Вужчі колонки">−</button>
    <span class="col-width-value" id="colWidthValue">${getColumnWidth()}</span>
    <button type="button" class="text-btn" data-step="1" title="Ширші колонки" aria-label="Ширші колонки">+</button>
  `;
  nav.appendChild(wrap);

  const valueEl = wrap.querySelector('#colWidthValue');
  wrap.querySelectorAll('button[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setColumnWidth(getColumnWidth() + Number(btn.dataset.step) * COL_WIDTH_STEP);
    });
  });
}

/** Єдина точка зміни ширини: обрізає до меж, застосовує, зберігає й оновлює підпис. */
function setColumnWidth(px) {
  const next = Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, px)));
  applyColumnWidth(next);
  const valueEl = document.getElementById('colWidthValue');
  if (valueEl) valueEl.textContent = next;
  try {
    localStorage.setItem(COL_WIDTH_KEY, String(next));
  } catch {
    /* приватний режим - ширина просто не переживе перезавантаження */
  }
  return next;
}

/**
 * Дві взаємодії поверх будь-якої тижневої сітки. Викликати ПІСЛЯ кожного
 * рендеру - обидві навішуються на щойно створені елементи.
 *
 * 1. Перетягування рамки (шапка днів, шкала годин, кутик) прокручує дошку в
 *    обидва боки. Саме рамка, а не полотно: на полотні у ліда drag створює
 *    зміну, і відбирати цей жест не можна. На телефоні це і є відповідь на
 *    "не гортається вбік" - палець на назві дня й ведеш, без боротьби з
 *    браузером за вісь (тому touch-action:none саме тут).
 * 2. Тонка смуга на правому краї шапки дня тягне ширину колонок. Ширина
 *    спільна для всіх сіток, тож тягнеш одну межу - міняються всі.
 */
function initBoardInteractions(scrollEl, opts = {}) {
  if (!scrollEl) return;
  // Селектори за замовчуванням - для годинних сіток (.wc-*). Грід водіїв має
  // власну розмітку, тож передає свої.
  const frameSelector = opts.frameSelector || '.wc-day-header, .wc-hour-ruler, .wc-corner';
  const headerSelector = opts.headerSelector || '.wc-day-header';

  // Смуги розтягування навішуємо щоразу - після перерендеру шапки нові.
  attachColumnResizers(scrollEl, headerSelector);

  if (scrollEl.dataset.interactionsReady === '1') return;
  scrollEl.dataset.interactionsReady = '1';

  // --- 1. Перетягування рамки ---
  let pan = null;
  scrollEl.addEventListener('pointerdown', (e) => {
    const frame = e.target.closest(frameSelector);
    if (!frame || e.target.closest('.wc-col-resizer')) return;
    pan = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: scrollEl.scrollLeft,
      top: scrollEl.scrollTop,
    };
    // Захоплення вказівника - не критичне: якщо браузер його не дає (вказівник
    // уже відпущено), перетягування все одно працює через слухачі на контейнері.
    try {
      frame.setPointerCapture(e.pointerId);
    } catch {
      /* не біда */
    }
    scrollEl.classList.add('wc-panning');
  });

  scrollEl.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    scrollEl.scrollLeft = pan.left - (e.clientX - pan.x);
    scrollEl.scrollTop = pan.top - (e.clientY - pan.y);
  });

  const endPan = (e) => {
    if (!pan || (e && e.pointerId !== pan.id)) return;
    pan = null;
    scrollEl.classList.remove('wc-panning');
  };
  scrollEl.addEventListener('pointerup', endPan);
  scrollEl.addEventListener('pointercancel', endPan);
}

// --- 2. Розтягування колонок ---
function attachColumnResizers(scrollEl, headerSelector) {
  let resize = null;
  scrollEl.querySelectorAll(headerSelector).forEach((header) => {
    if (header.querySelector('.wc-col-resizer')) return;
    const grip = document.createElement('div');
    grip.className = 'wc-col-resizer';
    grip.title = 'Потягніть, щоб змінити ширину колонок';
    header.appendChild(grip);

    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Скільки колонок займає цей день: тягнучи його межу на N пікселів,
      // ширину ОДНІЄЇ колонки міняємо на N/span - інакше день із трьома
      // доріжками ріс би втричі швидше за курсор.
      const span = Number((header.style.gridColumn.match(/span\s+(\d+)/) || [])[1]) || 1;
      resize = { id: e.pointerId, x: e.clientX, start: getColumnWidth(), span };
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* не біда - рух ловиться слухачем нижче */
      }
      document.body.classList.add('wc-col-resizing');
    });

    grip.addEventListener('pointermove', (e) => {
      if (!resize || e.pointerId !== resize.id) return;
      setColumnWidth(resize.start + (e.clientX - resize.x) / resize.span);
    });

    const endResize = (e) => {
      if (!resize || (e && e.pointerId !== resize.id)) return;
      resize = null;
      document.body.classList.remove('wc-col-resizing');
    };
    grip.addEventListener('pointerup', endResize);
    grip.addEventListener('pointercancel', endResize);
  });
}
