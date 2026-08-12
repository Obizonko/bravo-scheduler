'use strict';

/**
 * Модалка людини: клік на рядок у списку "Люди" відкриває календар. Дві вкладки -
 * "Чергування" (тижневий календар годин×днів, лише перегляд, GET /people/:id/calendar,
 * той самий візуальний формат, що й weekCalendar.js/masterPlan.js) і "Активності"
 * (агенда-список Master Plan за видимий місяць, з перемикачем участі для адмінів -
 * POST/DELETE /activity-assignments).
 */

let personModalState = null;

function closePersonModal() {
    const overlay = document.getElementById('personModalOverlay');
    if (overlay) overlay.remove();
    personModalState = null;
}

function monthDateRange(year, month) {
    const info = getMonthGridInfo(year, month);
    const lastDateStr = `${year}-${String(month).padStart(2, '0')}-${String(info.daysInMonth).padStart(2, '0')}`;
    return { from: info.firstDateStr, to: lastDateStr, info };
}

/** Авто-пакування без фіксованого ліміту доріжок (як у masterPlan.js) - у людини рідко, але
    можуть бути дві перетинання зміни на різних службах, тож теж уникаємо накладання барів. */
function autoPackDutyLanes(shifts) {
    const sorted = [...shifts].sort((a, b) => a.time_start.localeCompare(b.time_start));
    const laneEndMin = [];
    const placed = [];
    for (const shift of sorted) {
        const start = hmToMin(shift.time_start);
        const end = visualEndMin(shift);
        let lane = laneEndMin.findIndex((endAt) => endAt <= start);
        if (lane === -1) {
            lane = laneEndMin.length;
            laneEndMin.push(end);
        } else {
            laneEndMin[lane] = end;
        }
        placed.push({ shift, lane });
    }
    return { placed, laneCount: Math.max(1, laneEndMin.length) };
}

function dutyBarHtml(shift) {
    const top = minToPx(hmToMin(shift.time_start));
    const height = Math.max(minToPx(visualEndMin(shift) - hmToMin(shift.time_start)), 20);
    return `
        <div class="wc-bar wc-bar-filled" style="top:${top}px; height:${height}px;">
            <span class="wc-bar-time">${shift.time_start}–${shift.time_end}</span>
            <span class="wc-bar-name">${shift.service_type}</span>
        </div>
    `;
}

async function renderDutyTab(bodyEl, userId, monday) {
    const isFirstLoad = !personModalState.duty.loaded;
    if (isFirstLoad) bodyEl.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
    try {
        const sunday = addDaysStr(monday, 6);
        const calendar = await Api.get(`/people/${userId}/calendar?date_from=${monday}&date_to=${sunday}`);
        const shiftsByDate = new Map(calendar.days.map((d) => [d.date, d.shifts]));
        personModalState.duty.loaded = true;

        // Зберігаємо позицію скролу через перерендер (тиждень вперед/назад) - той самий
        // підхід, що й у weekCalendar.js/masterPlan.js, щоб уникнути "стрибка" вгору.
        const prevScrollEl = bodyEl.querySelector('.wc-scroll');
        const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : null;

        const dates = getWeekDates(monday);
        const perDay = dates.map((date) => autoPackDutyLanes(shiftsByDate.get(date) || []));
        const lanes = Math.max(1, ...perDay.map((d) => d.laneCount));

        const dayHeaders = dates
            .map((date) => `<div class="wc-day-header" style="grid-column: span ${lanes};"><div class="wc-day-title">${formatDayLabel(date)}</div></div>`)
            .join('');
        const hourRuler = `<div class="wc-hour-ruler" style="height:${DAY_HEIGHT_PX}px;">${hourLabelsHtml()}</div>`;
        const dayLanesHtml = dates
            .map((date, dayIdx) => {
                const { placed } = perDay[dayIdx];
                return Array.from({ length: lanes }, (_, laneIdx) => {
                    const barsHtml = placed.filter((p) => p.lane === laneIdx).map((p) => dutyBarHtml(p.shift)).join('');
                    return `<div class="wc-lane-track" style="height:${DAY_HEIGHT_PX}px; cursor:default;">${barsHtml}</div>`;
                }).join('');
            })
            .join('');

        bodyEl.innerHTML = `
            <div class="week-nav">
                <button type="button" class="month-nav-btn" id="dutyPrevWeek">‹</button>
                <strong>${formatWeekRangeLabel(monday)}</strong>
                <button type="button" class="month-nav-btn" id="dutyNextWeek">›</button>
            </div>
            <div class="wc-scroll" style="max-height: 52vh;">
                <div class="wc-grid" style="grid-template-columns: 56px repeat(${dates.length * lanes}, minmax(70px, 1fr));">
                    <div class="wc-corner"></div>
                    ${dayHeaders}
                    ${hourRuler}
                    ${dayLanesHtml}
                </div>
            </div>
        `;

        document.getElementById('dutyPrevWeek').addEventListener('click', () => shiftDutyWeek(userId, -1));
        document.getElementById('dutyNextWeek').addEventListener('click', () => shiftDutyWeek(userId, 1));

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
        showBanner(err.message || 'Не вдалося завантажити календар чергувань');
    }
}

function shiftDutyWeek(userId, delta) {
    personModalState.duty.monday = addDaysStr(personModalState.duty.monday, delta * 7);
    renderDutyTab(document.getElementById('personModalBody'), userId, personModalState.duty.monday);
}

async function renderActivitiesTab(bodyEl, userId, year, month) {
    const isFirstLoad = !personModalState.activities.loaded;
    if (isFirstLoad) bodyEl.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
    try {
        const { from, to } = monthDateRange(year, month);
        const [allActivities, myAssignments] = await Promise.all([
            Api.get('/master-plan'),
            Api.get(`/activity-assignments?user_id=${userId}`),
        ]);

        personModalState.activities.loaded = true;
        const assignedByActivity = new Map(myAssignments.map((a) => [a.master_plan_id, a.assignment_id]));
        const inRange = allActivities.filter((a) => a.is_daily || (a.date >= from && a.date <= to));
        inRange.sort((a, b) => (a.is_daily ? '0' : a.date).localeCompare(b.is_daily ? '0' : b.date) || a.time_start.localeCompare(b.time_start));

        const grouped = new Map();
        for (const activity of inRange) {
            const key = activity.is_daily ? 'Щодня' : activity.date;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(activity);
        }

        const groupsHtml = [...grouped.entries()]
            .map(([label, activities]) => {
                const itemsHtml = activities
                    .map((a) => {
                        const isAssigned = assignedByActivity.has(a.record_id);
                        const canEdit = Session.isLead();
                        return `
                            <div class="agenda-item">
                                <div class="agenda-item-info">
                                    <strong>${a.name_of_activity}</strong> · ${a.time_start}–${a.time_end}
                                    ${a.workload ? `<span class="tag">${a.workload}</span>` : ''}
                                </div>
                                ${canEdit ? `<button type="button" class="agenda-toggle-btn ${isAssigned ? 'assigned' : ''}"
                                    data-activity-id="${a.record_id}" data-assignment-id="${assignedByActivity.get(a.record_id) || ''}">
                                    ${isAssigned ? 'Прибрати' : 'Додати'}
                                </button>` : (isAssigned ? '<span class="tag tag--driver">Задіяна(ий)</span>' : '')}
                            </div>
                        `;
                    })
                    .join('');
                return `<div class="agenda-date-group"><h4>${label === 'Щодня' ? 'Щодня' : formatDayLabel(label)}</h4>${itemsHtml}</div>`;
            })
            .join('');

        bodyEl.innerHTML = `
            <div class="month-nav">
                <button type="button" class="month-nav-btn" id="actPrevMonth">‹</button>
                <strong>${formatMonthLabel(year, month)}</strong>
                <button type="button" class="month-nav-btn" id="actNextMonth">›</button>
            </div>
            ${groupsHtml || '<div class="empty-state">Активностей на цей місяць немає.</div>'}
        `;

        document.getElementById('actPrevMonth').addEventListener('click', () => shiftActivitiesMonth(userId, -1));
        document.getElementById('actNextMonth').addEventListener('click', () => shiftActivitiesMonth(userId, 1));
        bodyEl.querySelectorAll('.agenda-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', () => onToggleActivity(userId, btn));
        });
    } catch (err) {
        if (isFirstLoad) bodyEl.innerHTML = '';
        showBanner(err.message || 'Не вдалося завантажити активності');
    }
}

function shiftActivitiesMonth(userId, delta) {
    let { year, month } = personModalState.activities;
    month += delta;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    personModalState.activities = { year, month };
    renderActivitiesTab(document.getElementById('personModalBody'), userId, year, month);
}

async function onToggleActivity(userId, btn) {
    const activityId = btn.dataset.activityId;
    const assignmentId = btn.dataset.assignmentId;
    btn.disabled = true;
    try {
        if (assignmentId) {
            await Api.del(`/activity-assignments/${assignmentId}`);
        } else {
            await Api.post('/activity-assignments', { user_id: userId, master_plan_id: activityId });
        }
        const { year, month } = personModalState.activities;
        await renderActivitiesTab(document.getElementById('personModalBody'), userId, year, month);
    } catch (err) {
        showBanner(err.message || 'Не вдалося оновити участь в активності');
        btn.disabled = false;
    }
}

function switchPersonModalTab(tab, userId) {
    personModalState.tab = tab;
    document.querySelectorAll('.modal-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const bodyEl = document.getElementById('personModalBody');
    if (tab === 'duty') {
        renderDutyTab(bodyEl, userId, personModalState.duty.monday);
    } else {
        const { year, month } = personModalState.activities;
        renderActivitiesTab(bodyEl, userId, year, month);
    }
}

function openPersonModal(userId, name) {
    closePersonModal();
    const now = new Date();
    personModalState = {
        tab: 'duty',
        duty: { monday: getMonday(todayDateStr()), loaded: false },
        activities: { year: now.getFullYear(), month: now.getMonth() + 1, loaded: false },
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'personModalOverlay';
    overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h2>${name}</h2>
                <button type="button" class="modal-close-btn" id="personModalCloseBtn">×</button>
            </div>
            <div class="modal-tabs">
                <button type="button" class="modal-tab-btn active" data-tab="duty">Чергування</button>
                <button type="button" class="modal-tab-btn" data-tab="activities">Активності</button>
            </div>
            <div id="personModalBody"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('personModalCloseBtn').addEventListener('click', closePersonModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePersonModal();
    });
    document.querySelectorAll('.modal-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchPersonModalTab(btn.dataset.tab, userId));
    });

    renderDutyTab(document.getElementById('personModalBody'), userId, personModalState.duty.monday);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePersonModal();
});
