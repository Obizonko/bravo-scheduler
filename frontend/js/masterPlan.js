'use strict';

/**
 * Тижневий календар загального майстер-плану: вертикальна шкала годин, 7 днів
 * по горизонталі. На відміну від weekCalendar.js (Склад/ТЕЦ) кількість
 * паралельних доріжок тут НЕ фіксована - активності авто-пакуються в
 * мінімальну кількість доріжок без перетину за часом (скільки завгодно подій
 * одночасно, а не рівно 3 слоти). Клік/драг створює активність, клік по
 * активності відкриває редагування (назва, рівень навантаження, щодня).
 */

// Лише ці 3 рівні реально впливають на щось у застосунку (WORKLOAD_HEADCOUNT
// у weekCalendar.js - підсвічування колонок Складу). "Всі задіяні"/"Нічний
// час" ніде фактично не використовувались для розрахунку кількості людей,
// тож прибрані як зайві - разом з порожнім "Не вказано" (тепер завжди явний
// рівень, за замовчуванням середнє/2 людини).
const WORKLOAD_OPTIONS = [
    { value: 'quiet', label: 'Низьке (потрібна 1 людина)' },
    { value: 'normal', label: 'Середнє (потрібно 2 людини)' },
    { value: 'peak', label: 'Високе (потрібно 3 людини)' },
];

const WORKLOAD_BADGE_LABEL = { quiet: 'Низьке', normal: 'Середнє', peak: 'Високе' };

class MasterPlanBoard {
    constructor({ container }) {
        this.container = container;
        this.monday = getMonday(todayDateStr());
        this.activities = null;
        this.dragState = null;
        this._scrolledOnce = false;
        // Пригнічує клік-по-бару (відкриття модалки) одразу після реального
        // перетягування - інакше після drag-переміщення миттю ще й відкривалась
        // би модалка редагування, бо mouseup на тому самому елементі завжди
        // додатково породжує нативну подію 'click'.
        this._suppressClick = false;

        document.addEventListener('mousemove', (e) => this.onDocMouseMove(e));
        document.addEventListener('mouseup', () => this.onDocMouseUp());
    }

    shiftWeek(delta) {
        this.monday = addDaysStr(this.monday, delta * 7);
        return this.load();
    }

    goToday() {
        this.monday = getMonday(todayDateStr());
        return this.load();
    }

    get weekDates() {
        return getWeekDates(this.monday);
    }

    /** Спінер лише на першому завантаженні - див. коментар у weekCalendar.js#load(). */
    async load() {
        hideBanner();
        const isFirstLoad = this.activities === null;
        if (isFirstLoad) {
            this.container.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
        }
        try {
            // GET /master-plan не фільтрує за датою - тягнемо все й фільтруємо/матеріалізуємо
            // is_daily самі, так само як personModal.js робить для вкладки "Активності".
            this.activities = await Api.get('/master-plan');
            this.render();
        } catch (err) {
            if (isFirstLoad) this.container.innerHTML = '';
            showBanner(err.message || 'Не вдалося завантажити майстер-план');
        }
    }

    /** Активності конкретного дня: датовані на цю дату + всі is_daily (матеріалізовані). */
    activitiesForDate(date) {
        return this.activities.filter((a) => a.is_daily || a.date === date);
    }

    /** Авто-пакування без фіксованого ліміту доріжок - мінімальна кількість без перетину за часом. */
    autoPackLanes(activities) {
        const sorted = [...activities].sort((a, b) => a.time_start.localeCompare(b.time_start));
        const laneEndMin = [];
        const placed = [];
        for (const activity of sorted) {
            const start = hmToMin(activity.time_start);
            const end = visualEndMin(activity);
            let lane = laneEndMin.findIndex((endAt) => endAt <= start);
            if (lane === -1) {
                lane = laneEndMin.length;
                laneEndMin.push(end);
            } else {
                laneEndMin[lane] = end;
            }
            placed.push({ activity, lane });
        }
        return { placed, laneCount: Math.max(1, laneEndMin.length) };
    }

    render() {
        // Зберігаємо позицію скролу через повний перерендер - інакше кожна дія
        // (створення/редагування/ресайз) підкидала б перегляд угору ("блимання").
        const prevScrollEl = this.container.querySelector('.wc-scroll');
        const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : null;

        const weekLabel = document.getElementById('weekLabel');
        if (weekLabel) weekLabel.textContent = formatWeekRangeLabel(this.monday);

        const dates = this.weekDates;
        const perDay = dates.map((date) => this.autoPackLanes(this.activitiesForDate(date)));
        // +1 - завжди лишаємо одну порожню доріжку понад мінімально потрібну, інакше
        // немає де клікнути/потягнути, щоб додати ще одну паралельну активність у
        // проміжок, який уже повністю зайнятий по всіх наявних доріжках.
        const lanes = Math.max(1, ...perDay.map((d) => d.laneCount)) + 1;
        this.lanes = lanes;

        const dayHeaders = dates
            .map((date) => `<div class="wc-day-header" style="grid-column: span ${lanes};"><div class="wc-day-title">${formatDayLabel(date)}</div></div>`)
            .join('');

        const hourRuler = `<div class="wc-hour-ruler" style="height:${DAY_HEIGHT_PX}px;">${hourLabelsHtml()}</div>`;

        const dayLanesHtml = dates
            .map((date, dayIdx) => {
                const { placed } = perDay[dayIdx];
                return Array.from({ length: lanes }, (_, laneIdx) => {
                    const barsHtml = placed
                        .filter((p) => p.lane === laneIdx)
                        .map((p) => this.barHtml(p.activity, date))
                        .join('');
                    return `<div class="wc-lane-track mp-track" style="height:${DAY_HEIGHT_PX}px;" data-date="${date}">${barsHtml}</div>`;
                }).join('');
            })
            .join('');

        this.container.innerHTML = `
            <div class="wc-scroll">
                <div class="wc-grid" style="grid-template-columns: 56px repeat(${dates.length * lanes}, minmax(90px, 1fr));">
                    <div class="wc-corner"></div>
                    ${dayHeaders}
                    ${hourRuler}
                    ${dayLanesHtml}
                </div>
            </div>
        `;

        this.container.querySelectorAll('.mp-track').forEach((track) => {
            track.addEventListener('mousedown', (e) => this.onTrackMouseDown(e, track));
        });
        this.container.querySelectorAll('.mp-bar').forEach((bar) => {
            bar.addEventListener('mousedown', (e) => this.onBarMouseDown(e, bar));
            bar.addEventListener('click', (e) => {
                if (e.target.closest('.wc-resize-handle')) return;
                if (this._suppressClick) { this._suppressClick = false; return; }
                this.onBarClick(bar);
            });
        });
        this.container.querySelectorAll('.wc-resize-handle').forEach((handle) => {
            handle.addEventListener('mousedown', (e) => this.onResizeMouseDown(e));
        });

        const scrollEl = this.container.querySelector('.wc-scroll');
        if (scrollEl) {
            if (savedScroll) {
                scrollEl.scrollTop = savedScroll.top;
                scrollEl.scrollLeft = savedScroll.left;
            } else if (!this._scrolledOnce) {
                scrollEl.scrollTop = Math.max(0, minToPx(hmToMin('06:00')) - 40);
            }
            this._scrolledOnce = true;
        }
    }

    barHtml(activity, occurrenceDate) {
        const top = minToPx(hmToMin(activity.time_start));
        const height = Math.max(minToPx(visualEndMin(activity) - hmToMin(activity.time_start)), 20);
        const badge = activity.workload ? `<span class="mp-badge">${WORKLOAD_BADGE_LABEL[activity.workload] || activity.workload}</span>` : '';
        const dailyMark = activity.is_daily ? ' 🔁' : '';
        const resizeHandle = Session.isLead()
            ? `<span class="wc-resize-handle" data-activity-id="${activity.record_id}" data-occurrence-date="${occurrenceDate}" title="Потягніть - змінити тривалість"></span>`
            : '';
        const dragTitle = Session.isLead() ? ' title="Клік - редагувати, перетягніть - перенести на інший час"' : '';

        return `
            <div class="wc-bar mp-bar" style="top:${top}px; height:${height}px;"
                 data-activity-id="${activity.record_id}" data-occurrence-date="${occurrenceDate}"${dragTitle}>
                <span class="wc-bar-time">${activity.time_start}–${activity.time_end}${dailyMark}</span>
                <span class="wc-bar-name">${activity.name_of_activity}</span>
                ${badge}
                ${resizeHandle}
            </div>
        `;
    }

    // --- Створення нової активності: клік = дефолт 60 хв, драг = довільна ---

    onTrackMouseDown(e, track) {
        if (e.target.closest('.mp-bar')) return;
        if (!Session.isLead()) return;
        e.preventDefault();

        const rect = track.getBoundingClientRect();
        const startY = Math.min(Math.max(e.clientY - rect.top, 0), DAY_HEIGHT_PX);

        const ghost = document.createElement('div');
        ghost.className = 'wc-ghost';
        ghost.style.top = `${startY}px`;
        ghost.style.height = '0px';
        track.appendChild(ghost);

        this.dragState = { mode: 'create', track, date: track.dataset.date, startY, ghost };
    }

    onDocMouseMove(e) {
        if (!this.dragState) return;

        if (this.dragState.mode === 'create') {
            const { track, startY, ghost } = this.dragState;
            const rect = track.getBoundingClientRect();
            const currentY = Math.min(Math.max(e.clientY - rect.top, 0), DAY_HEIGHT_PX);
            ghost.style.top = `${Math.min(startY, currentY)}px`;
            ghost.style.height = `${Math.abs(currentY - startY)}px`;
            this.dragState.currentY = currentY;
            const startMin = snapMin(pxToMin(Math.min(startY, currentY)));
            const endMin = snapMin(pxToMin(Math.max(startY, currentY)));
            DragTooltip.show(`${minToHm(startMin)}–${minToHm(endMin)}`, e.clientX, e.clientY);
        } else if (this.dragState.mode === 'resize') {
            const { track, bar, barTopPx } = this.dragState;
            // Свіжий rect на кожен рух - інакше прокрутка під час ресайзу зробила б
            // його застарілим (та сама причина, що й у weekCalendar.js).
            const trackRect = track.getBoundingClientRect();
            const currentY = Math.min(Math.max(e.clientY - trackRect.top, 0), DAY_HEIGHT_PX);
            const height = Math.max(currentY - barTopPx, minToPx(MIN_DURATION_MIN));
            bar.style.height = `${height}px`;
            this.dragState.currentY = currentY;
            const startMin = snapMin(pxToMin(barTopPx));
            const endMin = snapMin(pxToMin(currentY));
            DragTooltip.show(`${minToHm(startMin)}–${minToHm(endMin)}`, e.clientX, e.clientY);
        } else if (this.dragState.mode === 'move') {
            const { bar, barTopPx, barHeightPx, startClientY } = this.dragState;
            const deltaY = e.clientY - startClientY;
            if (Math.abs(deltaY) > CLICK_THRESHOLD_PX) this.dragState.moved = true;
            const newTop = Math.min(Math.max(barTopPx + deltaY, 0), DAY_HEIGHT_PX - barHeightPx);
            bar.style.top = `${newTop}px`;
            this.dragState.newTopPx = newTop;
            const startMin = snapMin(pxToMin(newTop));
            const endMin = Math.min(startMin + pxToMin(barHeightPx), 1440);
            DragTooltip.show(`${minToHm(startMin)}–${minToHm(endMin)}`, e.clientX, e.clientY);
        }
    }

    async onDocMouseUp() {
        const state = this.dragState;
        if (!state) return;
        this.dragState = null;
        DragTooltip.hide();

        if (state.mode === 'create') {
            state.ghost.remove();
            const endY = state.currentY !== undefined ? state.currentY : state.startY;
            const isClick = Math.abs(endY - state.startY) < CLICK_THRESHOLD_PX;

            let startMin = snapMin(pxToMin(Math.min(state.startY, endY)));
            let endMin = isClick ? startMin + 60 : snapMin(pxToMin(Math.max(state.startY, endY)));

            if (endMin - startMin < MIN_DURATION_MIN) endMin = startMin + MIN_DURATION_MIN;
            if (endMin > 1440) {
                endMin = 1440;
                startMin = Math.max(0, endMin - MIN_DURATION_MIN);
            }

            await this.createActivity(state.date, startMin, endMin);
        } else if (state.mode === 'resize') {
            const newEndMin = snapMin(pxToMin(state.currentY !== undefined ? state.currentY : state.barTopPx));
            await this.resizeActivity(state.activityId, newEndMin);
        } else if (state.mode === 'move' && state.moved) {
            this._suppressClick = true;
            const newStartMin = snapMin(pxToMin(state.newTopPx));
            const durationMin = pxToMin(state.barHeightPx);
            await this.moveActivity(state.activityId, newStartMin, durationMin);
        }
    }

    /**
     * За замовчуванням середнє/normal (2 людини). Але якщо створюваний проміжок
     * перетинається з ІНШОЮ активністю того ж дня з явно нижчим/вищим рівнем -
     * успадковуємо саме його (а не тихо повертаємось до normal), інакше два
     * перетинні записи одного періоду показували б різні рівні без причини.
     * Кілька перетинних не-normal активностей одразу - бере НАЙВИЩИЙ рівень,
     * той самий принцип "максимум, не сума", що й у computeHeadcountSegments.
     */
    detectInheritedWorkload(date, startMin, endMin) {
        const rank = { quiet: 1, normal: 2, peak: 3 };
        const overlapping = this.activitiesForDate(date).filter((a) => {
            const aStart = hmToMin(a.time_start);
            const aEnd = visualEndMin(a);
            return aStart < endMin && startMin < aEnd;
        });
        const nonNormal = overlapping.filter((a) => rank[a.workload] && a.workload !== 'normal');
        if (nonNormal.length === 0) return 'normal';
        return nonNormal.reduce((best, a) => (rank[a.workload] > rank[best] ? a.workload : best), nonNormal[0].workload);
    }

    async createActivity(date, startMin, endMin) {
        try {
            await Api.post('/master-plan', {
                name_of_activity: 'Нова активність',
                date,
                time_start: minToHm(startMin),
                time_end: minToHm(endMin),
                workload: this.detectInheritedWorkload(date, startMin, endMin),
            });
            showBanner('Активність створено - відредагуйте назву', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося створити активність');
        }
        await this.load();
    }

    // --- Переміщення наявної активності (перетягування самого бару, той самий день/доріжка) ---

    onBarMouseDown(e, bar) {
        if (e.target.closest('.wc-resize-handle')) return;
        if (!Session.isLead()) return;
        e.preventDefault();
        // Скидаємо про всяк випадок - якщо попередній drag завершився поза
        // документом (mouseup поза вікном), клік не спрацював би, і прапорець
        // лишився б "застряглим" true, мовчки проковтнувши наступний клік.
        this._suppressClick = false;

        const track = bar.closest('.mp-track');
        const barTopPx = parseFloat(bar.style.top);
        const barHeightPx = parseFloat(bar.style.height);

        this.dragState = {
            mode: 'move',
            activityId: bar.dataset.activityId,
            bar,
            track,
            barTopPx,
            barHeightPx,
            startClientY: e.clientY,
            moved: false,
        };
    }

    async moveActivity(activityId, newStartMin, durationMin) {
        let startMin = Math.max(0, Math.min(newStartMin, 1440 - MIN_DURATION_MIN));
        let endMin = startMin + durationMin;
        if (endMin > 1440) {
            endMin = 1440;
            startMin = Math.max(0, endMin - durationMin);
        }
        try {
            await Api.put(`/master-plan/${activityId}`, {
                time_start: minToHm(startMin),
                time_end: minToHm(endMin === 1440 ? 0 : endMin),
            });
            showBanner('Час активності оновлено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося перемістити активність');
        }
        await this.load();
    }

    onBarClick(bar) {
        const activityId = bar.dataset.activityId;
        const occurrenceDate = bar.dataset.occurrenceDate;
        const activity = this.activities.find((a) => a.record_id === activityId);
        if (activity) openActivityEditModal(activity, occurrenceDate, this);
    }

    onResizeMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!Session.isLead()) return;

        const handle = e.currentTarget;
        const activityId = handle.dataset.activityId;
        const bar = handle.closest('.mp-bar');
        const track = bar.closest('.mp-track');
        const barTopPx = parseFloat(bar.style.top);

        this.dragState = { mode: 'resize', activityId, bar, track, barTopPx };
    }

    async resizeActivity(activityId, newEndMin) {
        const clampedEnd = Math.max(newEndMin, MIN_DURATION_MIN);
        try {
            await Api.put(`/master-plan/${activityId}`, { time_end: minToHm(clampedEnd === 1440 ? 0 : clampedEnd) });
            showBanner('Тривалість оновлено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося розтягнути активність');
        }
        await this.load();
    }
}

function workloadOptionsHtml(selected) {
    return WORKLOAD_OPTIONS
        .map((o) => `<option value="${o.value}" ${o.value === (selected || '') ? 'selected' : ''}>${o.label}</option>`)
        .join('');
}

/** Вкладка "Люди" в редагуванні активності: усі люди системи одним списком з
    перемикачами участі - без потреби заходити в кожну людину окремо
    (GET /users + GET/POST/DELETE /activity-assignments?master_plan_id=). */
async function renderActivityPeopleTab(bodyEl, activityId) {
    bodyEl.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
    try {
        const [users, assignments] = await Promise.all([
            Api.get('/users'),
            Api.get(`/activity-assignments?master_plan_id=${activityId}`),
        ]);
        users.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
        const assignmentByUser = new Map(assignments.map((a) => [a.user_id, a.assignment_id]));

        const rowsHtml = users
            .map((u) => {
                const isAssigned = assignmentByUser.has(u.user_id);
                return `
                    <div class="agenda-item">
                        <div class="agenda-item-info">
                            <strong>${u.name}</strong>${u.is_driver ? ' 🚗' : ''}
                        </div>
                        <button type="button" class="agenda-toggle-btn ${isAssigned ? 'assigned' : ''}"
                            data-user-id="${u.user_id}" data-assignment-id="${assignmentByUser.get(u.user_id) || ''}">
                            ${isAssigned ? 'Прибрати' : 'Додати'}
                        </button>
                    </div>
                `;
            })
            .join('');

        bodyEl.innerHTML = rowsHtml || '<div class="empty-state">Ще немає жодної людини в системі.</div>';
        bodyEl.querySelectorAll('.agenda-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', () => onToggleActivityPerson(activityId, btn));
        });
    } catch (err) {
        bodyEl.innerHTML = '';
        showBanner(err.message || 'Не вдалося завантажити людей');
    }
}

async function onToggleActivityPerson(activityId, btn) {
    const userId = btn.dataset.userId;
    const assignmentId = btn.dataset.assignmentId;
    btn.disabled = true;
    try {
        if (assignmentId) {
            await Api.del(`/activity-assignments/${assignmentId}`);
        } else {
            await Api.post('/activity-assignments', { user_id: userId, master_plan_id: activityId });
        }
        await renderActivityPeopleTab(document.getElementById('mpEditPeopleBody'), activityId);
    } catch (err) {
        showBanner(err.message || 'Не вдалося оновити участь в активності');
        btn.disabled = false;
    }
}

function openActivityEditModal(activity, occurrenceDate, board) {
    const existing = document.getElementById('mpEditOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'mpEditOverlay';
    overlay.innerHTML = `
        <div class="modal-box" style="max-width:420px;" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h2>Активність</h2>
                <button type="button" class="modal-close-btn" id="mpEditCloseBtn">×</button>
            </div>
            <div class="modal-tabs">
                <button type="button" class="modal-tab-btn active" data-tab="details">Деталі</button>
                <button type="button" class="modal-tab-btn" data-tab="people">Люди</button>
            </div>
            <div id="mpEditDetailsBody">
                <form id="mpEditForm">
                    <label class="checkbox-label" style="display:block; margin-bottom:10px;">
                        Назва
                        <input type="text" id="mpEditName" value="${activity.name_of_activity}" required minlength="2"
                            style="width:100%; margin-top:4px; padding:8px 10px; border:1px solid var(--border); border-radius:10px; font-family:inherit;">
                    </label>
                    <label class="checkbox-label" style="display:block; margin-bottom:10px;">
                        Рівень навантаження
                        <select id="mpEditWorkload" style="width:100%; margin-top:4px; padding:8px 10px; border:1px solid var(--border); border-radius:10px; font-family:inherit;">
                            ${workloadOptionsHtml(activity.workload)}
                        </select>
                    </label>
                    <label class="checkbox-label" style="margin-bottom:14px;">
                        <input type="checkbox" id="mpEditDaily" ${activity.is_daily ? 'checked' : ''}> Щодня (в один і той самий час кожного дня)
                    </label>
                    <div style="display:flex; gap:10px;">
                        <button type="submit" class="primary-btn" style="flex:1;">Зберегти</button>
                        <button type="button" class="outline-btn" id="mpEditDeleteBtn">Видалити</button>
                    </div>
                </form>
            </div>
            <div id="mpEditPeopleBody" style="display:none;"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('mpEditCloseBtn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.modal-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            overlay.querySelectorAll('.modal-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
            document.getElementById('mpEditDetailsBody').style.display = tab === 'details' ? '' : 'none';
            document.getElementById('mpEditPeopleBody').style.display = tab === 'people' ? '' : 'none';
            if (tab === 'people') renderActivityPeopleTab(document.getElementById('mpEditPeopleBody'), activity.record_id);
        });
    });

    document.getElementById('mpEditForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('mpEditName').value.trim();
        const workload = document.getElementById('mpEditWorkload').value;
        const isDaily = document.getElementById('mpEditDaily').checked;
        if (name.length < 2) return;

        const payload = { name_of_activity: name, workload, is_daily: isDaily };
        payload.date = isDaily ? null : (activity.date || occurrenceDate);

        try {
            await Api.put(`/master-plan/${activity.record_id}`, payload);
            showBanner('Активність оновлено', 'success');
            close();
            await board.load();
        } catch (err) {
            showBanner(err.message || 'Не вдалося оновити активність');
        }
    });

    document.getElementById('mpEditDeleteBtn').addEventListener('click', async () => {
        if (!window.confirm('Видалити цю активність?')) return;
        try {
            await Api.del(`/master-plan/${activity.record_id}`);
            showBanner('Активність видалено', 'success');
            close();
            await board.load();
        } catch (err) {
            showBanner(err.message || 'Не вдалося видалити активність');
        }
    });
}

function initMasterPlanPage() {
    lucide.createIcons();
    renderAuthBadge(document.getElementById('authBadge'));
    initMobileNav();

    const board = new MasterPlanBoard({ container: document.getElementById('weekBoardContainer') });

    document.getElementById('prevWeekBtn').addEventListener('click', () => board.shiftWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => board.shiftWeek(1));
    document.getElementById('todayWeekBtn').addEventListener('click', () => board.goToday());

    board.load();
}
