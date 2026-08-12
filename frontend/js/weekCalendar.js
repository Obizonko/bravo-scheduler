'use strict';

/**
 * Справжній тижневий календар (як Google Calendar week view): вертикальна
 * шкала годин, 7 днів по горизонталі, у кожному дні - до N паралельних
 * "слот"-колонок (3 для Складу, 2 для ТЕЦ). Клік/драг у слоті створює подію
 * (окрема зміна, max_people=1 для цього слота), ручка знизу розтягує,
 * порожній слот показує select для вибору людини.
 */

// HOUR_PX, DAY_HEIGHT_PX, SNAP_MIN, MIN_DURATION_MIN, CLICK_THRESHOLD_PX,
// hmToMin/minToHm/snapMin/pxToMin/minToPx/visualEndMin/hourLabelsHtml - спільні
// з masterPlan.js, винесені в api.js.

// Скільки людей рекомендує рівень навантаження активності Master Plan - лише ці
// 3 (за вимогою: "Ці рівні завантаженості став саме для складу"). Значення поза
// цим словником (all_hands/off_hours/не задано) не впливають на підсвічування -
// період лишається на дефолтних 2.
const WORKLOAD_HEADCOUNT = { quiet: 1, normal: 2, peak: 3 };
const DEFAULT_HEADCOUNT = 2;

class WeekCalendar {
    constructor({ container, serviceType, defaultDurationMin, lanes, showWorkloadOverlay = false }) {
        this.container = container;
        this.serviceType = serviceType;
        this.defaultDurationMin = defaultDurationMin;
        this.lanes = lanes;
        this.showWorkloadOverlay = showWorkloadOverlay;
        this.monday = getMonday(todayDateStr());
        this.board = null;
        this.masterPlanActivities = [];
        this.dragState = null;
        this._scrolledOnce = false;

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

    /**
     * Спінер-заглушка показується ЛИШЕ на найпершому завантаженні (нема чого
     * показати натомість). Кожне наступне оновлення (після створення/призначення/
     * ресайзу тощо) тихо підвантажує дані й перерендерює поверх наявного - без
     * проміжного "блимання" порожнім екраном і зі збереженою позицією скролу
     * (render() сам відновлює scrollTop/scrollLeft).
     */
    async load() {
        hideBanner();
        const isFirstLoad = this.board === null;
        if (isFirstLoad) {
            this.container.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
        }
        try {
            const sunday = addDaysStr(this.monday, 6);
            const requests = [
                Api.get(`/shifts/week-board?date_from=${this.monday}&date_to=${sunday}&service_type=${encodeURIComponent(this.serviceType)}`),
            ];
            if (this.showWorkloadOverlay) requests.push(Api.get('/master-plan'));
            const [board, activities] = await Promise.all(requests);
            this.board = board;
            if (this.showWorkloadOverlay) this.masterPlanActivities = activities;
            this.render();
        } catch (err) {
            if (isFirstLoad) this.container.innerHTML = '';
            showBanner(err.message || 'Не вдалося завантажити тижневий календар');
        }
    }

    /**
     * Скільки людей рекомендовано на кожен проміжок дня, за перетином з
     * активностями Master Plan. Кілька активностей одночасно - бере
     * НАЙБІЛЬШИЙ headcount (не сумує) - "рівень завантаженості в проміжок
     * визначається за найбільшим який є". Проміжки без жодної активності -
     * дефолтні 2 (як стандартна квота Складу).
     */
    computeHeadcountSegments(date) {
        const relevant = this.masterPlanActivities
            .filter((a) => a.is_daily || a.date === date)
            .map((a) => ({ start: hmToMin(a.time_start), end: visualEndMin(a), headcount: WORKLOAD_HEADCOUNT[a.workload] }))
            .filter((a) => a.headcount !== undefined);

        if (relevant.length === 0) return [{ start: 0, end: 1440, headcount: DEFAULT_HEADCOUNT }];

        const breakpoints = new Set([0, 1440]);
        relevant.forEach((a) => { breakpoints.add(a.start); breakpoints.add(a.end); });
        const sorted = [...breakpoints].sort((a, b) => a - b);

        const segments = [];
        for (let i = 0; i < sorted.length - 1; i += 1) {
            const segStart = sorted[i];
            const segEnd = sorted[i + 1];
            if (segStart >= segEnd) continue;
            const mid = (segStart + segEnd) / 2;
            const covering = relevant.filter((a) => a.start <= mid && a.end > mid);
            const headcount = covering.length > 0 ? Math.max(...covering.map((a) => a.headcount)) : DEFAULT_HEADCOUNT;
            segments.push({ start: segStart, end: segEnd, headcount });
        }

        const merged = [];
        for (const seg of segments) {
            const last = merged[merged.length - 1];
            if (last && last.headcount === seg.headcount && last.end === seg.start) {
                last.end = seg.end;
            } else {
                merged.push({ ...seg });
            }
        }
        return merged;
    }

    /** Сірі накладення для колонок, де за поточним рівнем навантаження людина не потрібна. */
    workloadOverlayHtml(date, laneIdx) {
        if (!this.showWorkloadOverlay || laneIdx === 0) return '';
        return this.computeHeadcountSegments(date)
            .filter((seg) => seg.headcount < laneIdx + 1)
            .map((seg) => {
                const top = minToPx(seg.start);
                const height = minToPx(seg.end - seg.start);
                return `<div class="wc-workload-overlay" style="top:${top}px; height:${height}px;"></div>`;
            })
            .join('');
    }

    /**
     * Розкладає зміни дня по слот-колонках. Колонка - це свідомий вибір адміна
     * (куди він перетягнув подію), тому shift.lane, якщо він заданий явно,
     * ЗАВЖДИ перемагає - інакше повторний рендер після кожної дії "перепаковував"
     * би вже розставлені по колонках зміни за часом і скидав вибір адміна.
     * Автопакування (перший вільний слот без перетину) - лише для змін без
     * явної lane (напр. створені старим API-викликом).
     */
    assignLanes(shifts) {
        const laneEndMin = new Array(this.lanes).fill(-1);
        const placed = [];

        const withLane = shifts.filter((s) => s.lane !== null && s.lane !== undefined && s.lane < this.lanes);
        const withoutLane = shifts.filter((s) => s.lane === null || s.lane === undefined || s.lane >= this.lanes);

        for (const shift of withLane) {
            const end = visualEndMin(shift);
            laneEndMin[shift.lane] = Math.max(laneEndMin[shift.lane], end);
            placed.push({ shift, lane: shift.lane });
        }

        const sorted = [...withoutLane].sort((a, b) => a.time_start.localeCompare(b.time_start));
        for (const shift of sorted) {
            const start = hmToMin(shift.time_start);
            const end = visualEndMin(shift);
            let lane = laneEndMin.findIndex((endAt) => endAt <= start);
            if (lane === -1) lane = this.lanes - 1; // понад ліміт слотів - показуємо в останньому (рідкісний overflow)
            laneEndMin[lane] = end;
            placed.push({ shift, lane });
        }
        return placed;
    }

    render() {
        // Перерендер повністю замінює .wc-scroll новим елементом - без явного
        // збереження/відновлення scrollTop/scrollLeft браузер скидав би позицію
        // на кожну дію (створення/призначення/ресайз), що й було головною причиною
        // "блимання": екран щоразу підстрибував угору.
        const prevScrollEl = this.container.querySelector('.wc-scroll');
        const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : null;

        const weekLabel = document.getElementById('weekLabel');
        if (weekLabel) weekLabel.textContent = formatWeekRangeLabel(this.monday);

        const laneNumbersHtml = Array.from({ length: this.lanes }, (_, i) => `<span>${i + 1}</span>`).join('');
        const dayHeaders = this.board.days
            .map((day) => `
                <div class="wc-day-header" style="grid-column: span ${this.lanes};">
                    <div class="wc-day-title">${formatDayLabel(day.date)}</div>
                    <div class="wc-day-lane-labels">${laneNumbersHtml}</div>
                </div>
            `)
            .join('');

        const hourRuler = `<div class="wc-hour-ruler" style="height:${DAY_HEIGHT_PX}px;">${hourLabelsHtml()}</div>`;

        const dayLanesHtml = this.board.days
            .map((day) => {
                const placed = this.assignLanes(day.shifts);
                const laneBars = Array.from({ length: this.lanes }, (_, laneIdx) => {
                    const overlayHtml = this.workloadOverlayHtml(day.date, laneIdx);
                    const barsHtml = placed
                        .filter((p) => p.lane === laneIdx)
                        .map((p) => this.barHtml(p.shift))
                        .join('');
                    return `<div class="wc-lane-track" style="height:${DAY_HEIGHT_PX}px;" data-date="${day.date}" data-lane="${laneIdx}">${overlayHtml}${barsHtml}</div>`;
                }).join('');
                return laneBars;
            })
            .join('');

        this.container.innerHTML = `
            <div class="wc-scroll">
                <div class="wc-grid" style="grid-template-columns: 56px repeat(${this.board.days.length * this.lanes}, minmax(74px, 1fr));">
                    <div class="wc-corner"></div>
                    ${dayHeaders}
                    ${hourRuler}
                    ${dayLanesHtml}
                </div>
            </div>
        `;

        this.container.querySelectorAll('.wc-lane-track').forEach((track) => {
            track.addEventListener('mousedown', (e) => this.onTrackMouseDown(e, track));
        });
        this.container.querySelectorAll('.wc-assign-select').forEach((select) => {
            select.addEventListener('change', (e) => this.onAssignSlot(e));
        });
        this.container.querySelectorAll('.wc-replace-select').forEach((select) => {
            select.addEventListener('change', (e) => this.onReplaceAssignment(e));
        });
        this.container.querySelectorAll('.wc-bar-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => this.onRemoveAssignment(e));
        });
        this.container.querySelectorAll('.wc-bar-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => this.onDeleteEmptyShift(e));
        });
        this.container.querySelectorAll('.wc-resize-handle').forEach((handle) => {
            handle.addEventListener('mousedown', (e) => this.onResizeMouseDown(e));
        });
        this.container.querySelectorAll('.wc-bar').forEach((bar) => {
            bar.addEventListener('mousedown', (e) => this.onBarMouseDown(e, bar));
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

    barHtml(shift) {
        const top = minToPx(hmToMin(shift.time_start));
        const height = Math.max(minToPx(visualEndMin(shift) - hmToMin(shift.time_start)), 20);
        const assignee = shift.assignees[0];

        if (assignee) {
            const driverMark = assignee.is_driver ? ' 🚗' : '';
            const removeBtn = Session.isLead()
                ? `<button type="button" class="wc-bar-remove" data-record-id="${assignee.record_id}" title="Зняти">×</button>`
                : '';
            const resizeHandle = Session.isLead()
                ? `<span class="wc-resize-handle" data-shift-id="${shift.shift_id}"></span>` : '';
            // Лід бачить select замість статичного імені - вибір іншої людини одразу
            // замінює призначення (зняти стару + призначити нову), без окремих кроків.
            const nameOrReplace = Session.isLead()
                ? `<select class="wc-replace-select" data-shift-id="${shift.shift_id}" data-record-id="${assignee.record_id}">
                       ${this.peopleOptionsHtml(assignee.user_id)}
                   </select>`
                : `<span class="wc-bar-name">${assignee.name}${driverMark}</span>`;
            return `
                <div class="wc-bar wc-bar-filled" style="top:${top}px; height:${height}px;" data-shift-id="${shift.shift_id}">
                    <span class="wc-bar-time">${shift.time_start}–${shift.time_end}</span>
                    ${nameOrReplace}
                    ${removeBtn}${resizeHandle}
                </div>
            `;
        }

        if (!Session.isLead()) {
            return `<div class="wc-bar wc-bar-empty" style="top:${top}px; height:${height}px;"><span class="wc-bar-time">${shift.time_start}–${shift.time_end}</span></div>`;
        }

        const deleteBtn = `<button type="button" class="wc-bar-delete" data-shift-id="${shift.shift_id}" title="Видалити">×</button>`;
        const resizeHandle = `<span class="wc-resize-handle" data-shift-id="${shift.shift_id}"></span>`;
        return `
            <div class="wc-bar wc-bar-empty" style="top:${top}px; height:${height}px;" data-shift-id="${shift.shift_id}">
                <span class="wc-bar-time">${shift.time_start}–${shift.time_end}</span>
                <select class="wc-assign-select" data-shift-id="${shift.shift_id}">
                    <option value="">+ Хто?</option>
                    ${this.peopleOptionsHtml()}
                </select>
                ${deleteBtn}${resizeHandle}
            </div>
        `;
    }

    /** selectedUserId заданий - позначає поточного призначеного як обраний (для select-заміни). */
    peopleOptionsHtml(selectedUserId) {
        return this.board.people
            .map((p) => `<option value="${p.user_id}" ${p.user_id === selectedUserId ? 'selected' : ''}>${p.name}${p.is_driver ? ' (водій)' : ''}</option>`)
            .join('');
    }

    // --- Створення нової події: клік = дефолтна тривалість, драг = довільна ---

    onTrackMouseDown(e, track) {
        if (e.target.closest('.wc-bar')) return;
        if (!Session.isLead()) return;
        e.preventDefault();

        const rect = track.getBoundingClientRect();
        const startY = Math.min(Math.max(e.clientY - rect.top, 0), DAY_HEIGHT_PX);

        const ghost = document.createElement('div');
        ghost.className = 'wc-ghost';
        ghost.style.top = `${startY}px`;
        ghost.style.height = '0px';
        track.appendChild(ghost);

        this.dragState = {
            mode: 'create',
            track,
            date: track.dataset.date,
            lane: Number(track.dataset.lane),
            startY,
            ghost,
        };
    }

    onDocMouseMove(e) {
        if (!this.dragState) return;

        if (this.dragState.mode === 'create') {
            const { track, startY, ghost } = this.dragState;
            const rect = track.getBoundingClientRect();
            const currentY = Math.min(Math.max(e.clientY - rect.top, 0), DAY_HEIGHT_PX);
            const top = Math.min(startY, currentY);
            const height = Math.abs(currentY - startY);
            ghost.style.top = `${top}px`;
            ghost.style.height = `${height}px`;
            this.dragState.currentY = currentY;
        } else if (this.dragState.mode === 'resize') {
            const { track, bar, barTopPx } = this.dragState;
            // Свіжий rect на кожен рух миші (не кешований з mousedown) - інакше
            // прокрутка ПІД час ресайзу зробила б trackRect застарілим і бар
            // "стрибав" би вбік від курсора.
            const trackRect = track.getBoundingClientRect();
            const currentY = Math.min(Math.max(e.clientY - trackRect.top, 0), DAY_HEIGHT_PX);
            const height = Math.max(currentY - barTopPx, minToPx(MIN_DURATION_MIN));
            bar.style.height = `${height}px`;
            this.dragState.currentY = currentY;
        } else if (this.dragState.mode === 'move') {
            const { bar, barTopPx, barHeightPx, startClientY } = this.dragState;
            const deltaY = e.clientY - startClientY;
            if (Math.abs(deltaY) > CLICK_THRESHOLD_PX) this.dragState.moved = true;
            const newTop = Math.min(Math.max(barTopPx + deltaY, 0), DAY_HEIGHT_PX - barHeightPx);
            bar.style.top = `${newTop}px`;
            this.dragState.newTopPx = newTop;
        }
    }

    async onDocMouseUp() {
        const state = this.dragState;
        if (!state) return;
        this.dragState = null;

        if (state.mode === 'create') {
            state.ghost.remove();
            const endY = state.currentY !== undefined ? state.currentY : state.startY;
            const isClick = Math.abs(endY - state.startY) < CLICK_THRESHOLD_PX;

            let startMin = snapMin(pxToMin(Math.min(state.startY, endY)));
            let endMin = isClick ? startMin + this.defaultDurationMin : snapMin(pxToMin(Math.max(state.startY, endY)));

            if (endMin - startMin < MIN_DURATION_MIN) endMin = startMin + MIN_DURATION_MIN;
            if (endMin > 1440) {
                endMin = 1440;
                startMin = Math.max(0, endMin - Math.max(this.defaultDurationMin, MIN_DURATION_MIN));
            }

            await this.createShift(state.date, state.lane, startMin, endMin);
        } else if (state.mode === 'resize') {
            const newEndMin = snapMin(pxToMin(state.currentY !== undefined ? state.currentY : state.barTopPx));
            await this.resizeShift(state.shiftId, newEndMin);
        } else if (state.mode === 'move' && state.moved) {
            const newStartMin = snapMin(pxToMin(state.newTopPx));
            const durationMin = pxToMin(state.barHeightPx);
            await this.moveShift(state.shiftId, newStartMin, durationMin);
        }
    }

    async createShift(date, lane, startMin, endMin) {
        try {
            await Api.post('/shifts', {
                date,
                time_start: minToHm(startMin),
                time_end: minToHm(endMin),
                service_type: this.serviceType,
                max_people: 1,
                lane,
            });
            showBanner('Слот створено - оберіть людину', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося створити слот');
        }
        await this.load();
    }

    async onAssignSlot(e) {
        const select = e.currentTarget;
        const shiftId = select.dataset.shiftId;
        const userId = select.value;
        if (!userId) return;

        try {
            const check = await Api.post('/schedule/check', { shift_id: shiftId, user_id: userId });
            if (!check.ok) {
                const proceed = window.confirm(
                    'Знайдено жорсткі порушення правил:\n\n' +
                    check.violations.map((v) => '- ' + v.message).join('\n') +
                    '\n\nВсе одно призначити?'
                );
                if (!proceed) { await this.load(); return; }
            }
            await Api.post('/schedule', { shift_id: shiftId, user_id: userId });
            if (check.warnings.length > 0) {
                showBanner('Призначено. Увага: ' + check.warnings.map((w) => w.message).join('; '), 'error');
            } else {
                showBanner('Людину призначено', 'success');
            }
        } catch (err) {
            showBanner(err.message || 'Не вдалося призначити людину');
        }
        await this.load();
    }

    async onRemoveAssignment(e) {
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordId;
        if (!window.confirm('Зняти цю людину з призначення?')) return;
        try {
            await Api.del(`/schedule/${recordId}`);
            showBanner('Призначення знято', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося зняти призначення');
        }
        await this.load();
    }

    async onDeleteEmptyShift(e) {
        e.stopPropagation();
        const shiftId = e.currentTarget.dataset.shiftId;
        if (!window.confirm('Видалити цей порожній слот?')) return;
        try {
            await Api.del(`/shifts/${shiftId}`);
            showBanner('Слот видалено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося видалити слот');
        }
        await this.load();
    }

    // --- Переміщення наявної події (перетягування самого бару, той самий день/колонка) ---

    onBarMouseDown(e, bar) {
        if (e.target.closest('.wc-resize-handle, .wc-bar-remove, .wc-bar-delete, .wc-assign-select, .wc-replace-select')) return;
        if (!Session.isLead()) return;
        e.preventDefault();

        const track = bar.closest('.wc-lane-track');
        const barTopPx = parseFloat(bar.style.top);
        const barHeightPx = parseFloat(bar.style.height);

        this.dragState = {
            mode: 'move',
            shiftId: bar.dataset.shiftId,
            bar,
            track,
            barTopPx,
            barHeightPx,
            startClientY: e.clientY,
            moved: false,
        };
    }

    async moveShift(shiftId, newStartMin, durationMin) {
        let startMin = Math.max(0, Math.min(newStartMin, 1440 - MIN_DURATION_MIN));
        let endMin = startMin + durationMin;
        if (endMin > 1440) {
            endMin = 1440;
            startMin = Math.max(0, endMin - durationMin);
        }
        try {
            await Api.put(`/shifts/${shiftId}`, {
                time_start: minToHm(startMin),
                time_end: minToHm(endMin === 1440 ? 0 : endMin),
            });
            showBanner('Час зміни оновлено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося перемістити зміну');
        }
        await this.load();
    }

    async onReplaceAssignment(e) {
        const select = e.currentTarget;
        const shiftId = select.dataset.shiftId;
        const oldRecordId = select.dataset.recordId;
        const newUserId = select.value;
        if (!newUserId) return;

        try {
            // Спершу знімаємо стару людину, і лише ПОТІМ перевіряємо нову - інакше
            // рушій бачить зміну як уже заповнену (стара людина ще формально на
            // ній) і на односайтових слотах (max_people:1, найчастіший випадок)
            // ЗАВЖДИ повертав би SHIFT_CAPACITY_EXCEEDED навіть для звичайної заміни.
            await Api.del(`/schedule/${oldRecordId}`);

            const check = await Api.post('/schedule/check', { shift_id: shiftId, user_id: newUserId });
            if (!check.ok) {
                const proceed = window.confirm(
                    'Знайдено жорсткі порушення правил:\n\n' +
                    check.violations.map((v) => '- ' + v.message).join('\n') +
                    '\n\nВсе одно замінити?'
                );
                if (!proceed) { await this.load(); return; }
            }
            await Api.post('/schedule', { shift_id: shiftId, user_id: newUserId });
            if (check.warnings.length > 0) {
                showBanner('Людину замінено. Увага: ' + check.warnings.map((w) => w.message).join('; '), 'error');
            } else {
                showBanner('Людину замінено', 'success');
            }
        } catch (err) {
            showBanner(err.message || 'Не вдалося замінити людину');
        }
        await this.load();
    }

    // --- Розтягування наявної події (ручка знизу) ---

    onResizeMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!Session.isLead()) return;

        const handle = e.currentTarget;
        const shiftId = handle.dataset.shiftId;
        const bar = handle.closest('.wc-bar');
        const track = bar.closest('.wc-lane-track');
        const barTopPx = parseFloat(bar.style.top);

        this.dragState = { mode: 'resize', shiftId, bar, track, barTopPx };
    }

    async resizeShift(shiftId, newEndMin) {
        const clampedEnd = Math.max(newEndMin, MIN_DURATION_MIN);
        try {
            await Api.put(`/shifts/${shiftId}`, { time_end: minToHm(clampedEnd === 1440 ? 0 : clampedEnd) });
            showBanner('Тривалість оновлено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося розтягнути слот');
        }
        await this.load();
    }
}

function initWeekCalendarPage(serviceType, defaultDurationMin, lanes, showWorkloadOverlay = false) {
    lucide.createIcons();
    renderAuthBadge(document.getElementById('authBadge'));
    initMobileNav();

    const calendar = new WeekCalendar({
        container: document.getElementById('weekBoardContainer'),
        serviceType,
        defaultDurationMin,
        lanes,
        showWorkloadOverlay,
    });

    document.getElementById('prevWeekBtn').addEventListener('click', () => calendar.shiftWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => calendar.shiftWeek(1));
    document.getElementById('todayWeekBtn').addEventListener('click', () => calendar.goToday());

    calendar.load();
}
