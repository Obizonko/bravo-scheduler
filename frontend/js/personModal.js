'use strict';

/**
 * Модалка людини: клік на рядок у списку "Люди" відкриває календар. ОДИН
 * тижневий календар (години×дні, той самий візуальний формат, що й
 * weekCalendar.js/masterPlan.js), що показує ОДРАЗУ обидва типи подій:
 * чергування (жовті бари, GET /people/:id/calendar) і активності Master Plan
 * (сині - людина на них, пунктирні - ні; лід може додати/прибрати участь
 * прямо тут, GET/POST/DELETE /activity-assignments).
 */

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

    // kind === 'activity'
    const cls = event.attending ? 'wc-bar mp-bar' : 'wc-bar wc-bar-empty';
    const dailyMark = event.activity.is_daily ? ' 🔁' : '';
    const toggleBtn = Session.isLead()
        ? event.attending
            ? `<button type="button" class="wc-bar-remove" data-assignment-id="${event.assignmentId}" title="Прибрати з активності">×</button>`
            : `<button type="button" class="agenda-toggle-mini" data-activity-id="${event.activity.record_id}" title="Додати на активність">+</button>`
        : '';
    return `
        <div class="${cls}" style="top:${top}px; height:${height}px;">
            <span class="wc-bar-time">${event.time_start}–${event.time_end}${dailyMark}</span>
            <span class="wc-bar-name">${event.label}${event.attending ? '' : ' (не бере участі)'}</span>
            ${toggleBtn}
        </div>
    `;
}

async function renderCalendarTab(bodyEl, userId, monday) {
    const isFirstLoad = !personModalState.loaded;
    if (isFirstLoad) bodyEl.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
    try {
        const sunday = addDaysStr(monday, 6);
        const [dutyCalendar, allActivities, myAssignments] = await Promise.all([
            Api.get(`/people/${userId}/calendar?date_from=${monday}&date_to=${sunday}`),
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

        const dates = getWeekDates(monday);

        function eventsForDate(date) {
            const duty = (shiftsByDate.get(date) || []).map((s) => ({
                kind: 'duty',
                time_start: s.time_start,
                time_end: s.time_end,
                label: s.service_type,
            }));
            const activities = allActivities
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

        const dayHeaders = dates
            .map((date) => `<div class="wc-day-header" style="grid-column: span ${lanes};"><div class="wc-day-title">${formatDayLabel(date)}</div></div>`)
            .join('');
        const hourRuler = `<div class="wc-hour-ruler" style="height:${DAY_HEIGHT_PX}px;">${hourLabelsHtml()}</div>`;
        const dayLanesHtml = dates
            .map((date, dayIdx) => {
                const { placed } = perDay[dayIdx];
                return Array.from({ length: lanes }, (_, laneIdx) => {
                    const barsHtml = placed.filter((p) => p.lane === laneIdx).map((p) => eventBarHtml(p.event)).join('');
                    return `<div class="wc-lane-track" style="height:${DAY_HEIGHT_PX}px; cursor:default;">${barsHtml}</div>`;
                }).join('');
            })
            .join('');

        bodyEl.innerHTML = `
            <div class="week-nav">
                <button type="button" class="month-nav-btn" id="calPrevWeek">‹</button>
                <strong>${formatWeekRangeLabel(monday)}</strong>
                <button type="button" class="month-nav-btn" id="calNextWeek">›</button>
            </div>
            <div class="agenda-legend">
                <span><span class="agenda-legend-dot agenda-legend-dot--duty"></span>Чергування</span>
                <span><span class="agenda-legend-dot agenda-legend-dot--activity"></span>Активність (бере участь)</span>
                <span><span class="agenda-legend-dot agenda-legend-dot--free"></span>Активність (не бере участі)</span>
            </div>
            <div class="wc-scroll" style="max-height: 50vh;">
                <div class="wc-grid" style="grid-template-columns: 56px repeat(${dates.length * lanes}, minmax(70px, 1fr));">
                    <div class="wc-corner"></div>
                    ${dayHeaders}
                    ${hourRuler}
                    ${dayLanesHtml}
                </div>
            </div>
        `;

        document.getElementById('calPrevWeek').addEventListener('click', () => shiftCalendarWeek(userId, -1));
        document.getElementById('calNextWeek').addEventListener('click', () => shiftCalendarWeek(userId, 1));
        bodyEl.querySelectorAll('.wc-bar-remove').forEach((btn) => {
            btn.addEventListener('click', () => onToggleActivity(userId, btn.dataset.assignmentId, null));
        });
        bodyEl.querySelectorAll('.agenda-toggle-mini').forEach((btn) => {
            btn.addEventListener('click', () => onToggleActivity(userId, null, btn.dataset.activityId));
        });

        const scrollEl = bodyEl.querySelector('.wc-scroll');
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

function shiftCalendarWeek(userId, delta) {
    personModalState.monday = addDaysStr(personModalState.monday, delta * 7);
    renderCalendarTab(document.getElementById('personModalBody'), userId, personModalState.monday);
}

/** assignmentId - прибрати участь; activityId - додати. Рівно один із двох заданий. */
async function onToggleActivity(userId, assignmentId, activityId) {
    try {
        if (assignmentId) {
            await Api.del(`/activity-assignments/${assignmentId}`);
        } else {
            await Api.post('/activity-assignments', { user_id: userId, master_plan_id: activityId });
        }
        await renderCalendarTab(document.getElementById('personModalBody'), userId, personModalState.monday);
    } catch (err) {
        showBanner(err.message || 'Не вдалося оновити участь в активності');
    }
}

function openPersonModal(userId, name) {
    closePersonModal();
    personModalState = { monday: getMonday(todayDateStr()), loaded: false };

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

    renderCalendarTab(document.getElementById('personModalBody'), userId, personModalState.monday);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePersonModal();
});
