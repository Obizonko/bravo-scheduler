'use strict';

/**
 * Тижневий грід водіїв: рядок на КОЖНОГО ВОДІЯ (is_driver=true - виїзд завжди
 * потребує водія, тому інші люди тут узагалі не рядки), колонка на день
 * тижня. У кожній клітинці - інтервали зайнятості (виїзди) цього водія того
 * дня, з можливістю додати новий інтервал чи прибрати наявний.
 */

const TRIP_SERVICE_TYPE = 'Поїздка';

class DriverWeek {
    constructor({ container, defaultDurationMin }) {
        this.container = container;
        this.defaultDurationMin = defaultDurationMin;
        this.monday = getMonday(todayDateStr());
        this.board = null;
        this.openCellKey = null; // 'userId|date', щоб показати форму додавання лише в одній клітинці
        this.editingShiftId = null; // виїзд, відкритий на редагування (час/км/примітка)
    }

    shiftWeek(delta) {
        this.monday = addDaysStr(this.monday, delta * 7);
        return this.load();
    }

    goToday() {
        this.monday = getMonday(todayDateStr());
        return this.load();
    }

    async load() {
        hideBanner();
        const isFirstLoad = this.board === null;
        if (isFirstLoad) {
            this.container.innerHTML = '<div class="spinner-hint">Завантаження...</div>';
        }
        try {
            const sunday = addDaysStr(this.monday, 6);
            this.board = await Api.get(
                `/shifts/week-board?date_from=${this.monday}&date_to=${sunday}&service_type=${encodeURIComponent(TRIP_SERVICE_TYPE)}`
            );
            this.render();
        } catch (err) {
            if (isFirstLoad) this.container.innerHTML = '';
            showBanner(err.message || 'Не вдалося завантажити тижневий грід водіїв');
        }
    }

    /** {userId: {date: [{record_id, shift_id, time_start, time_end}]}} */
    buildIntervalsByPerson() {
        const map = new Map();
        for (const day of this.board.days) {
            for (const shift of day.shifts) {
                for (const assignee of shift.assignees) {
                    if (!map.has(assignee.user_id)) map.set(assignee.user_id, new Map());
                    const byDate = map.get(assignee.user_id);
                    if (!byDate.has(day.date)) byDate.set(day.date, []);
                    byDate.get(day.date).push({
                        record_id: assignee.record_id,
                        shift_id: shift.shift_id,
                        time_start: shift.time_start,
                        time_end: shift.time_end,
                        distance_km: shift.distance_km,
                        note: shift.note,
                    });
                }
            }
        }
        return map;
    }

    render() {
        const weekLabel = document.getElementById('weekLabel');
        if (weekLabel) weekLabel.textContent = formatWeekRangeLabel(this.monday);

        const people = this.board.people
            .filter((p) => p.is_driver)
            .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
        const intervalsByPerson = this.buildIntervalsByPerson();
        const dates = this.board.days.map((d) => d.date);

        const headerCells = dates.map((d) => `<div class="dw-header-cell">${formatDayLabel(d)}</div>`).join('');
        const rowsHtml = people
            .map((person) => this.rowHtml(person, dates, intervalsByPerson.get(person.user_id) || new Map()))
            .join('');

        this.container.innerHTML = `
            <div class="driver-week-grid">
                <div class="dw-corner"></div>
                ${headerCells}
                ${rowsHtml}
            </div>
        `;

        this.container.querySelectorAll('.dw-add-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => this.onToggleAddForm(e));
        });
        // Форма редагування має той самий клас dw-add-form (спільні стилі), але
        // інший обробник - розрізняємо за наявністю data-shift-id.
        this.container.querySelectorAll('.dw-add-form').forEach((form) => {
            form.addEventListener('submit', (e) =>
                form.dataset.shiftId ? this.onSaveInterval(e) : this.onCreateInterval(e)
            );
        });
        this.container.querySelectorAll('.dw-chip-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => this.onRemoveInterval(e));
        });
        this.container.querySelectorAll('.dw-chip-edit').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                this.editingShiftId = e.currentTarget.dataset.shiftId;
                this.openCellKey = null;
                this.render();
            });
        });
        this.container.querySelectorAll('.dw-edit-cancel').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.editingShiftId = null;
                this.render();
            });
        });

        // Той самий панінг і розтягування, що й на годинних сітках, але по
        // власній розмітці: тут прокручується сам грід, а рамка - шапка днів,
        // кутик і колонка з іменами.
        initBoardInteractions(this.container.querySelector('.driver-week-grid'), {
            frameSelector: '.dw-header-cell, .dw-corner, .dw-label-cell',
            headerSelector: '.dw-header-cell',
        });
    }

    rowHtml(person, dates, byDate) {
        // Без 🚗-мітки - на цій сторінці й так усі рядки водії (render() уже
        // відфільтрував), позначати це на кожному рядку було б зайвим.
        const cellsHtml = dates
            .map((date) => this.cellHtml(person.user_id, date, byDate.get(date) || []))
            .join('');
        return `
            <div class="dw-label-cell">${person.name}</div>
            ${cellsHtml}
        `;
    }

    cellHtml(userId, date, intervals) {
        const cellKey = `${userId}|${date}`;
        const chipsHtml = intervals
            .map((iv) => {
                // Той самий виїзд, відкритий на редагування, показуємо формою
                // замість чіпа - решта клітинки лишається на місці.
                if (Session.isLead() && this.editingShiftId === iv.shift_id) {
                    return `
                <form class="dw-add-form dw-edit-form" data-shift-id="${iv.shift_id}">
                    <div class="dw-form-row">
                        <input type="time" class="dw-start" value="${iv.time_start}" required>
                        <input type="time" class="dw-end" value="${iv.time_end}" required>
                    </div>
                    <input type="number" class="dw-km" placeholder="км" min="0" step="1" inputmode="numeric" value="${iv.distance_km == null ? '' : iv.distance_km}">
                    <input type="text" class="dw-note" placeholder="Куди / примітка" maxlength="500" value="${escapeHtml(iv.note || '')}">
                    <div class="dw-form-row">
                        <button type="submit" class="dw-add-confirm">✓ Зберегти</button>
                        <button type="button" class="dw-edit-cancel">Скасувати</button>
                    </div>
                </form>
            `;
                }

                const km = iv.distance_km != null && iv.distance_km !== '' ? `<span class="dw-chip-km">${iv.distance_km} км</span>` : '';
                // Примітка може бути довгою (куди виїзд, контакт) - у чіпі
                // показуємо в один рядок з обрізанням, повний текст у title.
                const note = iv.note ? `<span class="dw-chip-note" title="${escapeHtml(iv.note)}">${escapeHtml(iv.note)}</span>` : '';
                const editBtn = Session.isLead()
                    ? `<button type="button" class="dw-chip-edit" data-shift-id="${iv.shift_id}" title="Редагувати виїзд">✎</button>`
                    : '';
                return `
                <div class="dw-chip">
                    <div class="dw-chip-main">
                        <span class="dw-chip-time">${iv.time_start}–${iv.time_end}</span>
                        ${km}
                    </div>
                    ${note}
                    <div class="dw-chip-actions">
                        ${editBtn}
                        ${Session.isLead() ? `<button type="button" class="dw-chip-remove" data-record-id="${iv.record_id}" title="Прибрати виїзд">×</button>` : ''}
                    </div>
                </div>
            `;
            })
            .join('');

        if (!Session.isLead()) {
            return `<div class="dw-cell">${chipsHtml}</div>`;
        }

        const isOpen = this.openCellKey === cellKey;
        const defaultEnd = minToHm(hmToMin('09:00') + this.defaultDurationMin);
        const formHtml = isOpen
            ? `
                <form class="dw-add-form" data-user-id="${userId}" data-date="${date}">
                    <div class="dw-form-row">
                        <input type="time" class="dw-start" value="09:00" required>
                        <input type="time" class="dw-end" value="${defaultEnd}" required>
                    </div>
                    <input type="number" class="dw-km" placeholder="км" min="0" step="1" inputmode="numeric">
                    <input type="text" class="dw-note" placeholder="Куди / примітка" maxlength="500">
                    <button type="submit" class="dw-add-confirm">✓ Додати</button>
                </form>
            `
            : `<button type="button" class="dw-add-btn" data-cell-key="${cellKey}" title="Додати виїзд для цієї людини на цей день">+</button>`;

        return `<div class="dw-cell">${chipsHtml}${formHtml}</div>`;
    }

    onToggleAddForm(e) {
        this.openCellKey = e.currentTarget.dataset.cellKey;
        this.render();
    }

    /** Збереження правок наявного виїзду: час, кілометраж, примітка. */
    async onSaveInterval(e) {
        e.preventDefault();
        const form = e.currentTarget;
        const shiftId = form.dataset.shiftId;
        const timeStart = form.querySelector('.dw-start').value;
        const timeEnd = form.querySelector('.dw-end').value;
        const kmRaw = form.querySelector('.dw-km').value.trim();
        const note = form.querySelector('.dw-note').value.trim();

        if (!timeStart || !timeEnd || timeStart === timeEnd) {
            showBanner('Вкажіть коректний проміжок часу');
            return;
        }

        this.editingShiftId = null;
        try {
            await Api.put(`/shifts/${shiftId}`, {
                time_start: timeStart,
                time_end: timeEnd,
                distance_km: kmRaw === '' ? null : Number(kmRaw),
                note,
            });
            showBanner('Виїзд оновлено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося зберегти виїзд');
        }
        await this.load();
    }

    async onCreateInterval(e) {
        e.preventDefault();
        const form = e.currentTarget;
        const userId = form.dataset.userId;
        const date = form.dataset.date;
        const timeStart = form.querySelector('.dw-start').value;
        const timeEnd = form.querySelector('.dw-end').value;
        const kmRaw = form.querySelector('.dw-km').value.trim();
        const note = form.querySelector('.dw-note').value.trim();

        if (!timeStart || !timeEnd || timeStart === timeEnd) {
            showBanner('Вкажіть коректний проміжок часу');
            return;
        }

        this.openCellKey = null;
        let shift = null;
        try {
            shift = await Api.post('/shifts', {
                date, time_start: timeStart, time_end: timeEnd, service_type: TRIP_SERVICE_TYPE, max_people: 1,
                // Порожнє поле - це "не вказано", а не нуль кілометрів.
                distance_km: kmRaw === '' ? null : Number(kmRaw),
                note,
            });

            const result = await assignPersonToShift(shift.shift_id, userId);
            if (result.success) {
                // Попередження - ПІСЛЯ успішного запису, одним банером (інакше миттєво
                // перекривається наступним "додано").
                if (result.warnings.length > 0) {
                    showBanner('Додано. Увага: ' + result.warnings.map((w) => w.message).join('; '), 'error');
                } else {
                    showBanner('Інтервал зайнятості додано', 'success');
                }
            } else {
                // Людину не вдалось призначити - прибираємо щойно створену порожню
                // зміну, інакше вона осиротіє (Водії показують лише ПРИЗНАЧЕНІ
                // інтервали, тож порожня зміна стала б невидимим сміттям у базі).
                await Api.del(`/shifts/${shift.shift_id}`);
            }
        } catch (err) {
            showBanner(err.message || 'Не вдалося додати інтервал');
            if (shift) await Api.del(`/shifts/${shift.shift_id}`).catch(() => {});
        }
        await this.load();
    }

    async onRemoveInterval(e) {
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordId;
        if (!window.confirm('Прибрати цей інтервал зайнятості?')) return;
        try {
            await Api.del(`/schedule/${recordId}`);
            showBanner('Інтервал прибрано', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося прибрати інтервал');
        }
        await this.load();
    }
}

// hmToMin/minToHm - спільні, винесені в api.js.

function initDriverWeekPage(defaultDurationMin) {
    lucide.createIcons();
    renderAuthBadge(document.getElementById('authBadge'));
    initMobileNav();
    initColumnWidth();

    const board = new DriverWeek({ container: document.getElementById('weekBoardContainer'), defaultDurationMin });

    document.getElementById('prevWeekBtn').addEventListener('click', () => board.shiftWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => board.shiftWeek(1));
    document.getElementById('todayWeekBtn').addEventListener('click', () => board.goToday());

    board.load();
}
