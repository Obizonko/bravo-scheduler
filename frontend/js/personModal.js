'use strict';

/**
 * Модалка людини: клік на рядок у списку "Люди" відкриває календар (години×дні,
 * той самий візуальний формат, що й weekCalendar.js/masterPlan.js), який показує
 * ОДРАЗУ обидва типи подій: чергування (жовті бари, GET /people/:id/calendar) і
 * активності Master Plan (сині - людина на них, пунктирні - ні; лід може
 * додати/прибрати участь прямо тут, GET/POST/DELETE /activity-assignments).
 *
 * Два режими перегляду - тиждень і один день; перемикач у шапці, вибір
 * запамʼятовується між відкриттями.
 */

const PERSON_VIEW_KEY = 'bravo_person_view';

let personModalState = null;

function closePersonModal() {
    const overlay = document.getElementById('personModalOverlay');
    if (overlay) overlay.remove();
    personModalState = null;
}

/** Авто-пакування ЗМІШАНИХ подій (чергування + активності) без фіксованого ліміту доріжок. */
function autoPackEvents(events) {
    const sorted = [...events].sort((a, b) => a.time_start.localeCompare(b.time_start));
    const laneEndMin = [];
    const placed = [];
    for (const event of sorted) {
        const start = hmToMin(event.time_start);
        const end = visualEndMin(event);
        let lane = laneEndMin.findIndex((endAt) => endAt <= start);
        if (lane === -1) {
            lane = laneEndMin.length;
            laneEndMin.push(end);
        } else {
            laneEndMin[lane] = end;
        }
        placed.push({ event, lane });
    }
    return { placed, laneCount: Math.max(1, laneEndMin.length) };
}

/** Горизонтальна лінія поточного часу - викликач сам перевіряє, що це сьогоднішня колонка. */
function nowLineHtml() {
    const top = minToPx(hmToMin(nowTimeStr()));
    return `<div class="wc-now-line" style="top:${top}px;"><span class="wc-now-dot"></span></div>`;
}

function eventBarHtml(event) {
    const top = minToPx(hmToMin(event.time_start));
    const height = Math.max(minToPx(visualEndMin(event) - hmToMin(event.time_start)), 20);

    if (event.kind === 'duty') {
        return `
            <div class="wc-bar wc-bar-filled" style="top:${top}px; height:${height}px;">
                <span class="wc-bar-time">${event.time_start}–${event.time_end}</span>
                <span class="wc-bar-name">${event.label}</span>
            </div>
        `;
    }

    // kind === 'activity' - сюди потрапляють лише ті, на які людину призначено
    // (renderCalendarTab фільтрує), тож варіанта "не бере участі" тут немає.
    const dailyMark = event.activity.is_daily ? ' 🔁' : '';
    const removeBtn = Session.isLead()
        ? `<button type="button" class="wc-bar-remove" data-assignment-id="${event.assignmentId}" title="Прибрати з активності">×</button>`
        : '';
    return `
        <div class="wc-bar mp-bar" style="top:${top}px; height:${height}px; ${activityColorStyle(event.activity.color)}">
            <span class="wc-bar-time">${event.time_start}–${event.time_end}${dailyMark}</span>
            <span class="wc-bar-name">${event.label}</span>
            ${removeBtn}
        </div>
    `;
}

/**
 * Календар людини. Два режими:
 *   week - понеділок..неділя, оглядово;
 *   day  - одна доба на всю ширину. На телефоні тиждень стискає колонки до
 *          нечитабельних, тож саме день є практичним переглядом.
 * Режим і поточна дата живуть у personModalState, тому перемикання й стрілки
 * не залежать від того, звідки викликано перерендер.
 */
async function renderCalendarTab(bodyEl, userId) {
    const isDay = personModalState.view === 'day';
    const rangeStart = isDay ? personModalState.day : personModalState.monday;
    const rangeEnd = isDay ? personModalState.day : addDaysStr(personModalState.monday, 6);

    const isFirstLoad = !personModalState.loaded;
    if (isFirstLoad) bodyEl.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
    try {
        const [dutyCalendar, allActivities, myAssignments] = await Promise.all([
            Api.get(`/people/${userId}/calendar?date_from=${rangeStart}&date_to=${rangeEnd}`),
            Api.get('/master-plan'),
            Api.get(`/activity-assignments?user_id=${userId}`),
        ]);
        personModalState.loaded = true;

        const shiftsByDate = new Map(dutyCalendar.days.map((d) => [d.date, d.shifts]));
        const assignmentIdByActivity = new Map(myAssignments.map((a) => [a.master_plan_id, a.assignment_id]));

        // Зберігаємо позицію скролу через перерендер (тиждень вперед/назад) - той самий
        // підхід, що й у weekCalendar.js/masterPlan.js, щоб уникнути "стрибка" вгору.
        const prevScrollEl = bodyEl.querySelector('.wc-scroll');
        const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : null;

        const dates = isDay ? [personModalState.day] : getWeekDates(personModalState.monday);

        function eventsForDate(date) {
            const duty = (shiftsByDate.get(date) || []).map((s) => ({
                kind: 'duty',
                time_start: s.time_start,
                time_end: s.time_end,
                label: s.service_type,
            }));
            const activities = allActivities
                // Лише ті активності, на які людину справді призначено. Раніше
                // тут були ВСІ активності табору - чужі малювались пунктиром із
                // позначкою "не бере участі", і календар людини переставав бути
                // її календарем. Додавання людини на активність лишилось там,
                // де для цього є контекст - вкладка "Люди" в модалці активності
                // на сторінці Майстер-план.
                .filter((a) => assignmentIdByActivity.has(a.record_id))
                .filter((a) => a.is_daily || a.date === date)
                .map((a) => ({
                    kind: 'activity',
                    time_start: a.time_start,
                    time_end: a.time_end,
                    label: a.name_of_activity,
                    activity: a,
                    attending: assignmentIdByActivity.has(a.record_id),
                    assignmentId: assignmentIdByActivity.get(a.record_id),
                }));
            return [...duty, ...activities];
        }

        const perDay = dates.map((date) => autoPackEvents(eventsForDate(date)));
        const lanes = Math.max(1, ...perDay.map((d) => d.laneCount));
        const today = todayDateStr();

        const dayHeaders = dates
            .map((date) => {
                const todayClass = date === today ? ' wc-today' : '';
                return `<div class="wc-day-header wc-day-start${todayClass}" style="grid-column: span ${lanes};"><div class="wc-day-title">${formatDayLabel(date)}</div></div>`;
            })
            .join('');
        const hourRuler = `<div class="wc-hour-ruler" style="height:${DAY_HEIGHT_PX}px;">${hourLabelsHtml()}</div>`;
        const dayLanesHtml = dates
            .map((date, dayIdx) => {
                const { placed } = perDay[dayIdx];
                const isToday = date === today;
                return Array.from({ length: lanes }, (_, laneIdx) => {
                    const nowLine = isToday ? nowLineHtml() : '';
                    const barsHtml = placed.filter((p) => p.lane === laneIdx).map((p) => eventBarHtml(p.event)).join('');
                    const dayStartClass = laneIdx === 0 ? ' wc-day-start' : '';
                    const todayClass = isToday ? ' wc-today' : '';
                    return `<div class="wc-lane-track${dayStartClass}${todayClass}" style="height:${DAY_HEIGHT_PX}px; cursor:default;">${nowLine}${barsHtml}</div>`;
                }).join('');
            })
            .join('');

        bodyEl.innerHTML = `
            <div class="week-nav">
                <button type="button" class="month-nav-btn" id="calPrevWeek" title="${isDay ? 'Попередній день' : 'Попередній тиждень'}">‹</button>
                <strong>${isDay ? formatDayLabel(personModalState.day) : formatWeekRangeLabel(personModalState.monday)}</strong>
                <button type="button" class="month-nav-btn" id="calNextWeek" title="${isDay ? 'Наступний день' : 'Наступний тиждень'}">›</button>
                <div class="view-toggle">
                    <button type="button" class="view-toggle-btn${isDay ? '' : ' active'}" data-view="week">Тиждень</button>
                    <button type="button" class="view-toggle-btn${isDay ? ' active' : ''}" data-view="day">День</button>
                </div>
            </div>
            <div class="agenda-legend">
                <span><span class="agenda-legend-dot agenda-legend-dot--duty"></span>Чергування</span>
                <span><span class="agenda-legend-dot agenda-legend-dot--activity"></span>Активність (бере участь)</span>
                <span class="agenda-legend-hint">Показано лише те, на що цю людину призначено</span>
            </div>
            <div class="wc-scroll" style="max-height: 50vh;">
                <div class="wc-grid" style="grid-template-columns: 56px repeat(${dates.length * lanes}, minmax(var(--wc-col-w, 70px), 1fr));">
                    <div class="wc-corner"></div>
                    ${dayHeaders}
                    ${hourRuler}
                    ${dayLanesHtml}
                </div>
            </div>
        `;

        document.getElementById('calPrevWeek').addEventListener('click', () => shiftCalendarRange(userId, -1));
        document.getElementById('calNextWeek').addEventListener('click', () => shiftCalendarRange(userId, 1));
        bodyEl.querySelectorAll('.view-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', () => setCalendarView(userId, btn.dataset.view));
        });
        bodyEl.querySelectorAll('.wc-bar-remove').forEach((btn) => {
            btn.addEventListener('click', () => onRemoveFromActivity(userId, btn.dataset.assignmentId));
        });

        const scrollEl = bodyEl.querySelector('.wc-scroll');
        initBoardInteractions(scrollEl);
        if (scrollEl) {
            if (savedScroll) {
                scrollEl.scrollTop = savedScroll.top;
                scrollEl.scrollLeft = savedScroll.left;
            } else {
                scrollEl.scrollTop = Math.max(0, minToPx(hmToMin('06:00')) - 40);
            }
        }
    } catch (err) {
        if (isFirstLoad) bodyEl.innerHTML = '';
        showBanner(err.message || 'Не вдалося завантажити календар');
    }
}

/** Стрілки: у тижневому режимі крок 7 днів, у денному - один. */
function shiftCalendarRange(userId, delta) {
    if (personModalState.view === 'day') {
        personModalState.day = addDaysStr(personModalState.day, delta);
    } else {
        personModalState.monday = addDaysStr(personModalState.monday, delta * 7);
    }
    renderCalendarTab(document.getElementById('personModalBody'), userId);
}

/**
 * Перемикання тиждень/день. Переходи узгоджені між собою: з тижня в день
 * потрапляємо на сьогодні, якщо воно в цьому тижні (найчастіший намір), інакше
 * на його понеділок; з дня в тиждень - на тиждень, що містить обраний день.
 * Вибір запамʼятовується, щоб не перемикати його щоразу заново.
 */
function setCalendarView(userId, view) {
    if (view === personModalState.view) return;

    if (view === 'day') {
        const today = todayDateStr();
        const week = getWeekDates(personModalState.monday);
        personModalState.day = week.includes(today) ? today : personModalState.monday;
    } else {
        personModalState.monday = getMonday(personModalState.day);
    }

    personModalState.view = view;
    try {
        localStorage.setItem(PERSON_VIEW_KEY, view);
    } catch {
        /* приватний режим браузера - не критично, просто не запамʼятаємо */
    }
    renderCalendarTab(document.getElementById('personModalBody'), userId);
}

/**
 * Прибрати людину з активності. Зворотної дії тут немає навмисно: у календарі
 * людини видно лише її активності, тож "додати" не має до чого причепитись -
 * для цього є вкладка "Люди" в модалці активності на Майстер-плані.
 */
async function onRemoveFromActivity(userId, assignmentId) {
    try {
        await Api.del(`/activity-assignments/${assignmentId}`);
        await renderCalendarTab(document.getElementById('personModalBody'), userId);
    } catch (err) {
        showBanner(err.message || 'Не вдалося оновити участь в активності');
    }
}

function openPersonModal(userId, name) {
    closePersonModal();
    const today = todayDateStr();
    let savedView = 'week';
    try {
        savedView = localStorage.getItem(PERSON_VIEW_KEY) === 'day' ? 'day' : 'week';
    } catch {
        /* приватний режим браузера - лишається тижневий за замовчуванням */
    }
    personModalState = { monday: getMonday(today), day: today, view: savedView, loaded: false };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'personModalOverlay';
    overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h2>${name}</h2>
                <button type="button" class="modal-close-btn" id="personModalCloseBtn">×</button>
            </div>
            <div id="personModalBody"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('personModalCloseBtn').addEventListener('click', closePersonModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePersonModal();
    });

    renderCalendarTab(document.getElementById('personModalBody'), userId);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePersonModal();
});
