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
        // Інлайн-форм у клітинках більше немає - введення й редагування
        // йдуть через модалку, тож і стану "яка клітинка відкрита" не потрібно.
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
            btn.addEventListener('click', (e) =>
                this.openTripModal({ userId: e.currentTarget.dataset.userId, date: e.currentTarget.dataset.date })
            );
        });
        this.container.querySelectorAll('.dw-chip--editable').forEach((chip) => {
            chip.addEventListener('click', (e) => {
                const el = e.currentTarget;
                this.openTripModal({
                    userId: el.dataset.userId,
                    date: el.dataset.date,
                    trip: this.findTrip(el.dataset.shiftId),
                });
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
        // Клітинка дня свідомо тримає лише чіпи й кнопку "+": на телефоні вона
        // завширшки ~130px, і форма з чотирьох полів там не поміщалась. Введення
        // й редагування винесені в модалку (openTripModal).
        const chipsHtml = intervals
            .map((iv) => {
                const km = iv.distance_km != null && iv.distance_km !== '' ? `<span class="dw-chip-km">${iv.distance_km} км</span>` : '';
                // Примітка буває довгою (куди виїзд, контакт) - у чіпі один рядок
                // з обрізанням, повний текст у title.
                const note = iv.note ? `<span class="dw-chip-note" title="${escapeHtml(iv.note)}">${escapeHtml(iv.note)}</span>` : '';
                // Для ліда клікабельний увесь чіп, а не значок: на дотик це
                // ціль у півсотні пікселів замість десяти.
                const tag = Session.isLead() ? 'button' : 'div';
                const attrs = Session.isLead()
                    ? `type="button" class="dw-chip dw-chip--editable" data-shift-id="${iv.shift_id}" data-user-id="${userId}" data-date="${date}" title="Редагувати виїзд"`
                    : 'class="dw-chip"';
                return `
                <${tag} ${attrs}>
                    <div class="dw-chip-main">
                        <span class="dw-chip-time">${iv.time_start}–${iv.time_end}</span>
                        ${km}
                    </div>
                    ${note}
                </${tag}>
            `;
            })
            .join('');

        if (!Session.isLead()) {
            return `<div class="dw-cell">${chipsHtml}</div>`;
        }

        return `<div class="dw-cell">${chipsHtml}<button type="button" class="dw-add-btn" data-user-id="${userId}" data-date="${date}" title="Додати виїзд для цієї людини на цей день">+ Виїзд</button></div>`;
    }

    /** Виїзд за shift_id серед уже завантаженого борду - без зайвого запиту до API. */
    findTrip(shiftId) {
        for (const day of this.board.days) {
            for (const shift of day.shifts) {
                if (shift.shift_id !== shiftId) continue;
                return {
                    shift_id: shift.shift_id,
                    time_start: shift.time_start,
                    time_end: shift.time_end,
                    distance_km: shift.distance_km,
                    note: shift.note,
                };
            }
        }
        return null;
    }

    /**
     * Одна модалка на створення й на редагування виїзду.
     *
     * Раніше форма жила всередині клітинки дня, а та на телефоні завширшки
     * ~130px - чотири поля туди фізично не влазили, і вводити з телефону було
     * неможливо. Модалка займає всю ширину екрана, поля великі, порядок
     * природний: коли - скільки - куди.
     */
    openTripModal({ userId, date, trip = null }) {
        const isEdit = Boolean(trip);
        const person = this.board.people.find((p) => p.user_id === userId);
        const defaultEnd = minToHm(hmToMin('09:00') + this.defaultDurationMin);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'tripModalOverlay';
        overlay.innerHTML = `
            <div class="modal-box modal-box--narrow" role="dialog" aria-modal="true">
                <div class="modal-header">
                    <h2>${isEdit ? 'Редагувати виїзд' : 'Новий виїзд'}</h2>
                    <button type="button" class="modal-close-btn" id="tripModalClose">×</button>
                </div>
                <p class="modal-subtitle">${escapeHtml(person ? person.name : '')} · ${formatDayLabel(date)}</p>
                <form id="tripForm" class="stacked-form">
                    <div class="field-row">
                        <label class="field-label">Початок
                            <input type="time" id="tripStart" value="${isEdit ? trip.time_start : '09:00'}" required>
                        </label>
                        <label class="field-label">Кінець
                            <input type="time" id="tripEnd" value="${isEdit ? trip.time_end : defaultEnd}" required>
                        </label>
                    </div>
                    <label class="field-label">Кілометраж
                        <input type="number" id="tripKm" min="0" step="1" inputmode="numeric" placeholder="напр. 120"
                               value="${isEdit && trip.distance_km != null ? trip.distance_km : ''}">
                    </label>
                    <label class="field-label">Куди / примітка
                        <input type="text" id="tripNote" maxlength="500" placeholder="напр. Львів, забрати генератор"
                               value="${isEdit ? escapeHtml(trip.note || '') : ''}">
                    </label>
                    <div class="form-actions">
                        <button type="submit" class="primary-btn">${isEdit ? 'Зберегти' : 'Додати'}</button>
                        <button type="button" class="outline-btn" id="tripCancel">Скасувати</button>
                    </div>
                    ${isEdit ? '<button type="button" class="danger-link" id="tripDelete">Видалити виїзд</button>' : ''}
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('tripModalClose').addEventListener('click', close);
        document.getElementById('tripCancel').addEventListener('click', close);
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) close();
        });

        if (isEdit) {
            document.getElementById('tripDelete').addEventListener('click', async () => {
                if (!window.confirm('Видалити цей виїзд?')) return;
                close();
                await this.deleteTrip(trip.shift_id);
            });
        }

        document.getElementById('tripForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const timeStart = document.getElementById('tripStart').value;
            const timeEnd = document.getElementById('tripEnd').value;
            const kmRaw = document.getElementById('tripKm').value.trim();
            const note = document.getElementById('tripNote').value.trim();

            if (!timeStart || !timeEnd || timeStart === timeEnd) {
                showBanner('Вкажіть коректний проміжок часу');
                return;
            }
            // Порожнє поле - це "не вказано", а не нуль кілометрів.
            const distanceKm = kmRaw === '' ? null : Number(kmRaw);

            close();
            if (isEdit) await this.saveTrip(trip.shift_id, { timeStart, timeEnd, distanceKm, note });
            else await this.createTrip({ userId, date, timeStart, timeEnd, distanceKm, note });
        });
    }

    async createTrip({ userId, date, timeStart, timeEnd, distanceKm, note }) {
        let shift = null;
        try {
            shift = await Api.post('/shifts', {
                date, time_start: timeStart, time_end: timeEnd, service_type: TRIP_SERVICE_TYPE, max_people: 1,
                distance_km: distanceKm, note,
            });

            const result = await assignPersonToShift(shift.shift_id, userId);
            if (result.success) {
                // Попередження - ПІСЛЯ успішного запису, одним банером (інакше миттєво
                // перекривається наступним "додано").
                if (result.warnings.length > 0) {
                    showBanner('Додано. Увага: ' + result.warnings.map((w) => w.message).join('; '), 'error');
                } else {
                    showBanner('Виїзд додано', 'success');
                }
            } else {
                // Людину не вдалось призначити - прибираємо щойно створену порожню
                // зміну, інакше вона осиротіє (Водії показують лише ПРИЗНАЧЕНІ
                // інтервали, тож порожня зміна стала б невидимим сміттям у базі).
                await Api.del(`/shifts/${shift.shift_id}`);
            }
        } catch (err) {
            showBanner(err.message || 'Не вдалося додати виїзд');
            if (shift) await Api.del(`/shifts/${shift.shift_id}`).catch(() => {});
        }
        await this.load();
    }

    async saveTrip(shiftId, { timeStart, timeEnd, distanceKm, note }) {
        try {
            await Api.put(`/shifts/${shiftId}`, {
                time_start: timeStart, time_end: timeEnd, distance_km: distanceKm, note,
            });
            showBanner('Виїзд оновлено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося зберегти виїзд');
        }
        await this.load();
    }

    /**
     * Видаляємо саму ЗМІНУ, а не лише запис графіка. Виїзд - це зміна на одну
     * людину, і знявши тільки призначення, ми лишали б у базі порожню зміну:
     * ця сторінка показує тільки призначені інтервали, тож вона ставала б
     * невидимим сміттям. Бекенд при видаленні зміни прибирає й призначення.
     */
    async deleteTrip(shiftId) {
        try {
            await Api.del(`/shifts/${shiftId}`);
            showBanner('Виїзд видалено', 'success');
        } catch (err) {
            showBanner(err.message || 'Не вдалося видалити виїзд');
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
