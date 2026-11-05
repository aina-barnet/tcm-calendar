/**
 * Calendar Module - TCM Calendar
 */

document.addEventListener('DOMContentLoaded', function () {
    const SAVED_CALENDARS_KEY = 'tcm_saved_calendars';
    const ACTIVE_SAVED_CALENDAR_KEY = 'tcm_active_saved_calendar';
    const CALENDAR_EVENTS_KEY = 'tcm_calendar_events';

    // State
    let currentDate = new Date();
    let selectedDate = null;
    let currentView = 'week';
    let events = loadEvents();

    // DOM Elements
    const heroClock = document.getElementById('heroClock');
    const heroDate = document.getElementById('heroDate');
    const currentMonthEl = document.getElementById('currentMonth');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const todayBtn = document.getElementById('todayBtn');
    const prevWeekBtn = document.getElementById('prevWeekBtn');
    const nextWeekBtn = document.getElementById('nextWeekBtn');
    const weekLabelElement = document.getElementById('weekLabel');
    const calendarDays = document.getElementById('calendarDays');
    const weekChangerEl = document.getElementById('weekChanger');
    const viewButtons = document.querySelectorAll('.view-toggle .view-btn');
    const monthView = document.getElementById('monthView');
    const weekView = document.getElementById('weekView');
    const agendaView = document.getElementById('agendaView');
    const isVisualizationOnly = document.body.classList.contains('calendar-visualization-only');
    const savedSchedulesSelect = document.getElementById('savedSchedulesSelect');
    const loadSavedScheduleBtn = document.getElementById('loadSavedScheduleBtn');
    const renameSavedScheduleBtn = document.getElementById('renameSavedScheduleBtn');
    const removeSavedScheduleBtn = document.getElementById('removeSavedScheduleBtn');
    const renameScheduleModalOverlay = document.getElementById('renameScheduleModalOverlay');
    const renameScheduleForm = document.getElementById('renameScheduleForm');
    const renameScheduleInput = document.getElementById('renameScheduleInput');
    const cancelRenameScheduleBtn = document.getElementById('cancelRenameScheduleBtn');
    const savedSchedulesCount = document.getElementById('savedSchedulesCount');
    const activeViewLabel = document.getElementById('activeViewLabel');
    const visibleEventsCount = document.getElementById('visibleEventsCount');
    const nextEventLabel = document.getElementById('nextEventLabel');
    // Month names in Catalan
    const monthNames = [
        'Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny',
        'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'
    ];

    const dayNames = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'];
    const shortDayNames = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds'];

    function hasStorageHelper() {
        return typeof StorageHelper !== 'undefined' && StorageHelper && typeof StorageHelper.getItem === 'function';
    }

    function safeGetStoredItem(key, fallbackValue) {
        try {
            if (hasStorageHelper()) {
                return StorageHelper.getItem(key, fallbackValue);
            }

            const storedValue = localStorage.getItem(key);
            if (storedValue === null || storedValue === undefined) {
                return fallbackValue;
            }

            return JSON.parse(storedValue);
        } catch (error) {
            console.warn('safeGetStoredItem failed for', key, error);
            return fallbackValue;
        }
    }

    function safeSetStoredItem(key, value) {
        try {
            if (hasStorageHelper() && typeof StorageHelper.setItem === 'function') {
                StorageHelper.setItem(key, value);
                return;
            }

            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn('safeSetStoredItem failed for', key, error);
        }
    }

    function safeRemoveStoredItem(key) {
        try {
            if (hasStorageHelper() && typeof StorageHelper.removeItem === 'function') {
                StorageHelper.removeItem(key);
                return;
            }

            localStorage.removeItem(key);
        } catch (error) {
            console.warn('safeRemoveStoredItem failed for', key, error);
        }
    }

    // ============================================
    // EVENTS STORAGE
    // ============================================
    function loadEvents() {
        return normalizeCalendarEvents(safeGetStoredItem(CALENDAR_EVENTS_KEY, []));
    }

    function saveEvents() {
        safeSetStoredItem(CALENDAR_EVENTS_KEY, normalizeCalendarEvents(events));
    }

    function parseCalendarDateValue(dateValue) {
        if (dateValue instanceof Date) {
            return Number.isNaN(dateValue.getTime()) ? null : new Date(dateValue);
        }

        if (typeof dateValue === 'string') {
            const trimmed = dateValue.trim();
            if (!trimmed) {
                return null;
            }

            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                const [year, month, day] = trimmed.split('-').map(Number);
                const localDate = new Date(year, month - 1, day);
                return Number.isNaN(localDate.getTime()) ? null : localDate;
            }

            const parsed = new Date(trimmed);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        const parsed = new Date(dateValue);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function normalizeCalendarEvent(event) {
        if (!event || typeof event !== 'object') {
            return null;
        }

        const parsedDate = parseCalendarDateValue(event.date);
        if (!parsedDate) {
            return null;
        }

        const normalizedEvent = { ...event };
        normalizedEvent.date = formatDateStr(parsedDate);

        if (normalizedEvent.title != null) {
            const title = String(normalizedEvent.title).trim();
            normalizedEvent.title = title || 'Esdeveniment';
        }

        if (normalizedEvent.startTime != null) {
            normalizedEvent.startTime = String(normalizedEvent.startTime).trim();
        }

        if (normalizedEvent.endTime != null) {
            normalizedEvent.endTime = String(normalizedEvent.endTime).trim();
        }

        if (normalizedEvent.location != null) {
            const location = String(normalizedEvent.location).trim();
            normalizedEvent.location = location || null;
        }

        if (normalizedEvent.color != null) {
            const color = String(normalizedEvent.color).trim();
            normalizedEvent.color = color || null;
        }

        return normalizedEvent;
    }

    function normalizeCalendarEvents(rawEvents) {
        if (!Array.isArray(rawEvents)) {
            return [];
        }

        return rawEvents.map(normalizeCalendarEvent).filter(Boolean);
    }

    function getEarliestEventDate(eventList) {
        if (!Array.isArray(eventList) || eventList.length === 0) {
            return null;
        }

        const orderedDates = eventList
            .map(eventItem => parseCalendarDateValue(eventItem?.date))
            .filter(dateItem => dateItem instanceof Date && !Number.isNaN(dateItem.getTime()))
            .sort((left, right) => left.getTime() - right.getTime());

        return orderedDates.length > 0 ? orderedDates[0] : null;
    }

    function setEventsAndFocusDate(nextEvents) {
        events = normalizeCalendarEvents(nextEvents);

        const firstLoadedEvent = getEarliestEventDate(events);
        if (firstLoadedEvent) {
            currentDate = new Date(firstLoadedEvent);
            selectedDate = new Date(firstLoadedEvent);
        }

        return events;
    }

    function hasRenderableScheduleEvents(eventList) {
        return Array.isArray(eventList) && eventList.some(eventItem => {
            const eventDate = parseCalendarDateValue(eventItem?.date);
            return Boolean(eventDate) && parseTimeToMinutes(eventItem?.startTime) !== null;
        });
    }

    function loadSavedCalendars() {
        return safeGetStoredItem(SAVED_CALENDARS_KEY, []);
    }

    function saveSavedCalendars(savedCalendars) {
        safeSetStoredItem(SAVED_CALENDARS_KEY, savedCalendars);
    }

    function loadActiveSavedCalendarId() {
        const storedValue = safeGetStoredItem(ACTIVE_SAVED_CALENDAR_KEY, null);
        if (!storedValue) {
            return null;
        }

        try {
            return JSON.parse(storedValue);
        } catch (error) {
            return storedValue;
        }
    }

    function formatDateForOption(isoDate) {
        const date = parseCalendarDateValue(isoDate);
        if (!date) return 'data desconeguda';
        return date.toLocaleString('ca-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function populateSavedCalendarsSelect() {
        if (!savedSchedulesSelect) return;

        const savedCalendars = loadSavedCalendars();
        const activeId = loadActiveSavedCalendarId();
        console.debug('populateSavedCalendarsSelect loaded', { savedCalendars, activeId });

        savedSchedulesSelect.innerHTML = '';

        if (savedCalendars.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No hi ha horaris guardats';
            savedSchedulesSelect.appendChild(option);
            savedSchedulesSelect.disabled = true;
            if (loadSavedScheduleBtn) loadSavedScheduleBtn.disabled = true;
            if (renameSavedScheduleBtn) renameSavedScheduleBtn.disabled = true;
            if (removeSavedScheduleBtn) removeSavedScheduleBtn.disabled = true;
            if (savedSchedulesCount) savedSchedulesCount.textContent = '0 guardats';
            return;
        }

        savedSchedulesSelect.disabled = false;

        savedCalendars.forEach((calendar, index) => {
            const option = document.createElement('option');
            option.value = calendar.id;
            option.textContent = `${calendar.name || `Horari ${index + 1}`}`;
            savedSchedulesSelect.appendChild(option);
        });

        if (activeId && savedCalendars.some(c => c.id === activeId)) {
            savedSchedulesSelect.value = activeId;
        } else {
            savedSchedulesSelect.selectedIndex = 0;
        }

        if (loadSavedScheduleBtn) loadSavedScheduleBtn.disabled = false;
        if (renameSavedScheduleBtn) renameSavedScheduleBtn.disabled = false;
        if (removeSavedScheduleBtn) removeSavedScheduleBtn.disabled = false;
        if (savedSchedulesCount) savedSchedulesCount.textContent = `${savedCalendars.length} guardats`;
    }

    function renameSavedCalendar(calendarId, newName) {
        const trimmedName = String(newName || '').trim();
        if (!trimmedName) {
            showNotification('El nom no pot estar buit.', 'error');
            return false;
        }

        const savedCalendars = loadSavedCalendars();
        const target = savedCalendars.find(c => c.id === calendarId);
        if (!target) {
            showNotification('No s\'ha trobat l\'horari seleccionat.', 'error');
            return false;
        }

        target.name = trimmedName;
        saveSavedCalendars(savedCalendars);
        populateSavedCalendarsSelect();

        if (savedSchedulesSelect) {
            savedSchedulesSelect.value = calendarId;
        }

        showNotification('Horari renombrat correctament.', 'success');
        return true;
    }

    function openRenameScheduleModal(calendarId) {
        if (!renameScheduleModalOverlay || !renameScheduleForm || !renameScheduleInput) {
            return;
        }

        const savedCalendars = loadSavedCalendars();
        const selected = savedCalendars.find(c => c.id === calendarId);
        const defaultName = selected?.name || 'Horari';

        renameScheduleForm.dataset.calendarId = calendarId;
        renameScheduleInput.value = defaultName;
        renameScheduleModalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            renameScheduleInput.focus();
            renameScheduleInput.select();
        }, 0);
    }

    function closeRenameScheduleModal() {
        if (!renameScheduleModalOverlay || !renameScheduleForm) {
            return;
        }

        renameScheduleModalOverlay.classList.remove('active');
        document.body.style.overflow = '';
        delete renameScheduleForm.dataset.calendarId;
    }

    function buildEventsFromScheduleFallback(scheduleData, calendarId) {
        const weekVariants = Array.isArray(scheduleData?.weeks) && scheduleData.weeks.length > 0
            ? scheduleData.weeks
            : Array.isArray(scheduleData?.classes)
                ? [{ parity: 'odd', classes: scheduleData.classes }]
                : [];
        const semesterStart = new Date();
        const currentDay = semesterStart.getDay();
        const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
        semesterStart.setDate(semesterStart.getDate() + diffToMonday);
        semesterStart.setHours(0, 0, 0, 0);

        const formatMinutes = totalMinutes => {
            const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
            const minutes = String(totalMinutes % 60).padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        const getColorForType = type => {
            if (type === 'lab') {
                return '#3B82F6';
            }

            if (type === 'seminar') {
                return '#8B5CF6';
            }

            return '#DFA023';
        };

        const generatedEvents = [];

        for (let week = 0; week < 16; week++) {
            const parity = week % 2 === 0 ? 'odd' : 'even';
            const variant = weekVariants.find(w => w?.parity === parity) || weekVariants[0];
            const classes = Array.isArray(variant?.classes) ? variant.classes : [];

            classes.forEach((classInfo, classIndex) => {
                if (!classInfo || !Number.isFinite(classInfo.day)) {
                    return;
                }

                const classDate = new Date(semesterStart);
                classDate.setDate(classDate.getDate() + (week * 7) + (classInfo.day - 1));
                classDate.setHours(0, 0, 0, 0);

                let startMinutes = Number.isFinite(classInfo.startMinute) ? classInfo.startMinute : null;
                let endMinutes = Number.isFinite(classInfo.endMinute) ? classInfo.endMinute : null;

                if (startMinutes === null || endMinutes === null) {
                    const timeRange = typeof classInfo.timeRange === 'string' ? classInfo.timeRange.split('-') : [];
                    if (timeRange.length === 2) {
                        const parsedStart = parseTimeToMinutes(timeRange[0]);
                        const parsedEnd = parseTimeToMinutes(timeRange[1]);
                        if (parsedStart !== null && parsedEnd !== null && parsedEnd > parsedStart) {
                            startMinutes = parsedStart;
                            endMinutes = parsedEnd;
                        }
                    }
                }

                if (startMinutes === null || endMinutes === null) {
                    const fallbackStartHour = Number(classInfo.start || 8);
                    const fallbackDurationMinutes = Number(classInfo.duration || 1) * 60;
                    startMinutes = Math.round(fallbackStartHour * 60);
                    endMinutes = startMinutes + Math.round(fallbackDurationMinutes);
                }

                generatedEvents.push({
                    id: `generated-${calendarId}-${week}-${classIndex}`,
                    title: classInfo.name || classInfo.subjectCode || 'Classe',
                    date: formatDateStr(classDate),
                    startTime: formatMinutes(startMinutes),
                    endTime: formatMinutes(endMinutes),
                    location: classInfo.room || null,
                    category: 'class',
                    color: getColorForType(classInfo.type),
                    source: 'saved-schedule',
                    scheduleId: calendarId,
                    readOnly: true
                });
            });
        }

        return generatedEvents;
    }

    async function buildEventsFromSchedule(scheduleData, calendarId) {
        try {
            if (window.AcademicCalendar && typeof window.AcademicCalendar.buildScheduleEvents === 'function') {
                const academicEvents = await window.AcademicCalendar.buildScheduleEvents(scheduleData, calendarId);
                if (Array.isArray(academicEvents)) {
                    return academicEvents;
                }
            }
        } catch (error) {
            console.warn('AcademicCalendar build failed, using local fallback', error);
        }

        return buildEventsFromScheduleFallback(scheduleData, calendarId);
    }

    async function loadSavedCalendarToEvents(calendarId, silent = false) {
        const savedCalendars = loadSavedCalendars();
        const selected = savedCalendars.find(c => c.id === calendarId);

        console.debug('loadSavedCalendarToEvents', { calendarId, savedCount: savedCalendars.length, found: !!selected });

        if (!selected) {
            showNotification('No s\'ha trobat l\'horari seleccionat.', 'error');
            return;
        }

        const existingEvents = normalizeCalendarEvents(events);
        const persistedEventsForCalendar = existingEvents.filter(e => e.source === 'saved-schedule' && e.scheduleId === selected.id);
        const baseEvents = existingEvents.filter(e => e.source !== 'saved-schedule' && e.source !== 'academic-calendar');
        const academicPeriodEvents = [];
        if (window.AcademicCalendar && typeof window.AcademicCalendar.buildPeriodEvents === 'function') {
            try {
                // Prefer trimester from the saved schedule when available so periods are coordinated
                // with the schedule's own dates. Fallback to 'ALL' to generate the full year.
                let requestedTrimester = 'ALL';
                try {
                    const scheduleTrim = selected?.schedule?.trimesterWindow?.trimester ?? selected?.schedule?.selectedTrimester ?? null;
                    requestedTrimester = scheduleTrim === null || scheduleTrim === undefined ? 'ALL' : scheduleTrim;
                } catch (e) {
                    requestedTrimester = 'ALL';
                }

                const periodEvents = window.AcademicCalendar.buildPeriodEvents(requestedTrimester) || [];
                if (Array.isArray(periodEvents)) {
                    academicPeriodEvents.push(...periodEvents);
                }
            } catch (err) {
                console.error('Error building academic period events', err);
            }
        }
        let rebuiltEvents = [];
        try {
            const built = await buildEventsFromSchedule(selected.schedule, selected.id);
            rebuiltEvents = Array.isArray(built) ? built : [];
            console.debug('built events from schedule', { builtLength: rebuiltEvents.length });
        } catch (err) {
            console.error('Error building events from schedule', err);
        }

        const cleanRebuiltEvents = rebuiltEvents.filter(e => e.source !== 'academic-calendar');
        const academicFromSchedule = rebuiltEvents.filter(e => e.source === 'academic-calendar');

        // Prefer academic events produced together with the rebuilt schedule; otherwise fall back to standalone period events.
        const mergedAcademic = academicFromSchedule.length > 0
            ? academicFromSchedule
            : academicPeriodEvents;

        if (cleanRebuiltEvents.length > 0) {
            setEventsAndFocusDate([...baseEvents, ...cleanRebuiltEvents, ...mergedAcademic]);
        } else if (persistedEventsForCalendar.length > 0) {
            console.warn('Using persisted saved-calendar events as fallback', { calendarId, count: persistedEventsForCalendar.length });
            setEventsAndFocusDate([...baseEvents, ...persistedEventsForCalendar, ...mergedAcademic]);
        } else {
            console.warn('Rebuild returned no events; keeping the currently loaded calendar data as a fallback', { calendarId });
            setEventsAndFocusDate([...baseEvents, ...mergedAcademic]);
        }

        saveEvents();
        safeSetStoredItem(ACTIVE_SAVED_CALENDAR_KEY, selected.id);
        console.debug('events after load', { eventsLength: Array.isArray(events) ? events.length : 0 });
        renderCurrentView();
        updateMonthDisplay();
        if (!silent) {
            showNotification('Horari carregat al calendari.', 'success');
        }
    }

    function removeSavedCalendar(calendarId) {
        let savedCalendars = loadSavedCalendars();
        const toDelete = savedCalendars.find(c => c.id === calendarId);

        if (!toDelete) {
            showNotification('No s\'ha trobat l\'horari seleccionat.', 'error');
            return;
        }

        savedCalendars = savedCalendars.filter(c => c.id !== calendarId);
        saveSavedCalendars(savedCalendars);

        const activeId = loadActiveSavedCalendarId();
        if (activeId === calendarId) {
            safeRemoveStoredItem(ACTIVE_SAVED_CALENDAR_KEY);
            events = events.filter(e => e.source !== 'saved-schedule' && e.source !== 'academic-calendar');
            saveEvents();
            renderCurrentView();
        }

        populateSavedCalendarsSelect();
        showNotification('Horari guardat eliminat.', 'success');
    }

    function getEventsForDate(date) {
        const dateStr = formatDateStr(date);
        return events.filter(e => e.date === dateStr).sort((a, b) => {
            if (!a.startTime) return 1;
            if (!b.startTime) return -1;
            return a.startTime.localeCompare(b.startTime);
        });
    }

    function getAcademicBackgroundEventForDate(date) {
        const dateStr = formatDateStr(date);
        if (!dateStr) {
            return null;
        }

        const priority = {
            examens: 4,
            recuperacions: 3,
            vacances: 2,
            no_lectiu: 1
        };

        return events
            .filter(event => event.date === dateStr && event.backgroundColor)
            .sort((left, right) => (priority[right.category] || 0) - (priority[left.category] || 0))[0] || null;
    }

    function applyAcademicBackground(cellElement, event) {
        if (!cellElement || !event) {
            return;
        }

        cellElement.classList.add('academic-period');
        cellElement.style.setProperty('--academic-period-color', event.backgroundColor || '#6B7280');
        cellElement.dataset.academicPeriod = event.category || 'academic';
        if (event.title) {
            cellElement.title = event.title;
        }
    }

    function getEventsForHour(date, hour) {
        const dateStr = formatDateStr(date);
        return events.filter(e => {
            if (e.date !== dateStr) return false;
            if (!e.startTime) return false;
            const eventHour = parseInt(e.startTime.split(':')[0]);
            return eventHour === hour;
        });
    }

    function formatDateStr(date) {
        const d = parseCalendarDateValue(date);
        if (!d) {
            return '';
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    async function loadSavedScheduleEvents() {
        const directEvents = loadEvents();
        if (directEvents.length > 0) {
            setEventsAndFocusDate(directEvents);

            const savedCalendars = loadSavedCalendars();
            const activeSavedCalendarId = loadActiveSavedCalendarId();
            const fallbackCalendar = activeSavedCalendarId && savedCalendars.some(calendar => calendar.id === activeSavedCalendarId)
                ? activeSavedCalendarId
                : savedCalendars[0]?.id || null;

            if (!fallbackCalendar) {
                return events;
            }

            console.warn('Rebuilding persisted saved schedule with academic periods', { fallbackCalendar });
            await loadSavedCalendarToEvents(fallbackCalendar, true);
            return events;
        }

        const savedCalendars = loadSavedCalendars();
        const activeSavedCalendarId = loadActiveSavedCalendarId();
        const fallbackCalendar = activeSavedCalendarId && savedCalendars.some(calendar => calendar.id === activeSavedCalendarId)
            ? activeSavedCalendarId
            : savedCalendars[0]?.id || null;

        if (fallbackCalendar) {
            await loadSavedCalendarToEvents(fallbackCalendar, true);
            return events;
        }

        setEventsAndFocusDate([]);
        return events;
    }

    function formatDisplayDate(dateStr) {
        const [year, month, day] = dateStr.split('-');
        return `${parseInt(day)} de ${monthNames[parseInt(month) - 1]} de ${year}`;
    }

    // ============================================
    // CLOCK FUNCTIONS
    // ============================================
    function updateClock() {
        const now = new Date();

        // Update hero clock
        if (heroClock) {
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            heroClock.textContent = `${hours}:${minutes}:${seconds}`;
        }

        // Update hero date
        if (heroDate) {
            const dayName = dayNames[now.getDay()];
            const day = now.getDate();
            const month = monthNames[now.getMonth()];
            const year = now.getFullYear();
            heroDate.textContent = `${dayName}, ${day} de ${month} de ${year}`;
        }
    }

    // ============================================
    // CALENDAR NAVIGATION
    // ============================================
    function getStartOfWeek(baseDate) {
        const start = new Date(baseDate);
        const dayOfWeek = start.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        start.setDate(start.getDate() + diff);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    function formatWeekRangeLabel(baseDate) {
        const start = getStartOfWeek(baseDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);

        const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
        if (sameMonth) {
            return `${start.getDate()} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
        }

        if (start.getFullYear() === end.getFullYear()) {
            return `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
        }

        return `${start.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
    }

    function updateMonthDisplay() {
        if (currentMonthEl) {
            if (currentView === 'week' || currentView === 'agenda') {
                currentMonthEl.textContent = formatWeekRangeLabel(currentDate);
                return;
            }

            currentMonthEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        }
    }

    function navigateMonth(direction) {
        if (currentView === 'week' || currentView === 'agenda') {
            const next = new Date(currentDate);
            next.setDate(next.getDate() + (direction * 7));
            currentDate = next;
        } else {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1);
        }

        updateMonthDisplay();
        renderCurrentView();
    }

    function goToToday() {
        currentDate = new Date();
        selectedDate = new Date();
        updateMonthDisplay();
        renderCurrentView();
    }

    // ============================================
    // MONTH VIEW
    // ============================================
    function renderMonthView() {
        if (!calendarDays) return;

        calendarDays.innerHTML = '';
        const today = new Date();

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        let startDay = firstDay.getDay();
        startDay = startDay === 0 ? 6 : startDay - 1;

        const prevMonthLastDay = new Date(year, month, 0).getDate();

        // Previous month days
        for (let i = startDay - 1; i >= 0; i--) {
            const dayEl = createDayElement(prevMonthLastDay - i, true, false, year, month - 1);
            calendarDays.appendChild(dayEl);
        }

        // Current month days
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const isToday = day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();
            const isSelected = selectedDate &&
                day === selectedDate.getDate() &&
                month === selectedDate.getMonth() &&
                year === selectedDate.getFullYear();

            const dayEl = createDayElement(day, false, isToday, year, month, isSelected);
            calendarDays.appendChild(dayEl);
        }

        // Next month days
        const totalCells = startDay + lastDay.getDate();
        const remainingCells = totalCells > 35 ? 42 - totalCells : 35 - totalCells;

        for (let day = 1; day <= remainingCells; day++) {
            const dayEl = createDayElement(day, true, false, year, month + 1);
            calendarDays.appendChild(dayEl);
        }
    }

    function createDayElement(day, isOtherMonth, isToday, year, month, isSelected = false) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        if (isOtherMonth) dayEl.classList.add('other-month');
        if (isToday) dayEl.classList.add('today');
        if (isSelected && !isToday) dayEl.classList.add('selected');

        // Day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayEl.appendChild(dayNumber);

        // Events container
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'day-events';

        const dayDate = new Date(year, month, day);
        const dayEvents = getEventsForDate(dayDate);
        const backgroundEvent = getAcademicBackgroundEventForDate(dayDate);

        applyAcademicBackground(dayEl, backgroundEvent);

        const maxVisible = 3;
        dayEvents.slice(0, maxVisible).forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'day-event';
            eventEl.textContent = event.title;
            eventEl.style.backgroundColor = event.color || event.backgroundColor || '#DFA023';
            eventEl.dataset.eventId = event.id;
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openEventDetail(event.id);
            });
            eventsContainer.appendChild(eventEl);
        });

        if (dayEvents.length > maxVisible) {
            const moreEl = document.createElement('div');
            moreEl.className = 'more-events';
            moreEl.textContent = `+${dayEvents.length - maxVisible} més`;
            eventsContainer.appendChild(moreEl);
        }

        dayEl.appendChild(eventsContainer);

        // Click handler to add event
        dayEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('day-event')) return;
            if (isVisualizationOnly) return;
            handleDayClick(day, year, month, isOtherMonth, e);
        });

        return dayEl;
    }

    function handleDayClick(day, year, month, isOtherMonth, clickEvent) {
        if (isOtherMonth) {
            currentDate = new Date(year, month, 1);
            selectedDate = new Date(year, month, day);
            updateMonthDisplay();
            renderCurrentView();
            return;
        }

        selectedDate = new Date(year, month, day);

        document.querySelectorAll('.calendar-day').forEach(el => {
            el.classList.remove('selected');
        });

        clickEvent.currentTarget.classList.add('selected');

        // Open modal to create event on this day
        const dateStr = formatDateStr(selectedDate);
        openEventModal(dateStr);
    }

    // ============================================
    // WEEK VIEW
    // ============================================
    function parseTimeToMinutes(value) {
        if (typeof value !== 'string') return null;

        const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        return hours * 60 + minutes;
    }

    function getRenderableEventRange(event, visibleStartMinute = 8 * 60, visibleEndMinute = 22 * 60) {
        const parsedStart = parseTimeToMinutes(event?.startTime);
        const parsedEnd = parseTimeToMinutes(event?.endTime);

        let startMinute = parsedStart;
        let endMinute = parsedEnd;

        if (!Number.isFinite(startMinute)) {
            return null;
        }

        if (!Number.isFinite(endMinute) || endMinute <= startMinute) {
            endMinute = startMinute + 60;
        }

        const clampedStart = Math.max(startMinute, visibleStartMinute);
        const clampedEnd = Math.min(endMinute, visibleEndMinute);

        if (clampedEnd <= clampedStart) {
            return null;
        }

        return {
            startMinute: clampedStart,
            endMinute: clampedEnd,
            originalStart: startMinute,
            originalEnd: endMinute
        };
    }

    function eventRangesOverlap(first, second) {
        if (!first?._renderRange || !second?._renderRange) {
            return false;
        }

        return first._renderRange.startMinute < second._renderRange.endMinute
            && second._renderRange.startMinute < first._renderRange.endMinute;
    }

    function computeDayEventLayout(dayEvents, visibleStartMinute = 8 * 60, visibleEndMinute = 22 * 60) {
        const renderableEvents = (dayEvents || [])
            .map(event => {
                const range = getRenderableEventRange(event, visibleStartMinute, visibleEndMinute);
                if (!range) {
                    return null;
                }

                return {
                    ...event,
                    _renderRange: range,
                    _overlapColumn: 0,
                    _overlapColumns: 1,
                    _isOverlapping: false
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a._renderRange.startMinute !== b._renderRange.startMinute) {
                    return a._renderRange.startMinute - b._renderRange.startMinute;
                }

                return a._renderRange.endMinute - b._renderRange.endMinute;
            });

        const active = [];
        renderableEvents.forEach(current => {
            for (let i = active.length - 1; i >= 0; i--) {
                if (active[i]._renderRange.endMinute <= current._renderRange.startMinute) {
                    active.splice(i, 1);
                }
            }

            const usedColumns = new Set(active.map(item => item._overlapColumn));
            let overlapColumn = 0;
            while (usedColumns.has(overlapColumn)) {
                overlapColumn++;
            }

            current._overlapColumn = overlapColumn;
            active.push(current);
        });

        renderableEvents.forEach(current => {
            let overlapColumns = 1;
            renderableEvents.forEach(other => {
                if (eventRangesOverlap(current, other)) {
                    overlapColumns = Math.max(overlapColumns, (other._overlapColumn || 0) + 1);
                }
            });

            current._overlapColumns = overlapColumns;
            current._isOverlapping = overlapColumns > 1;
        });

        return renderableEvents;
    }

    function addWeekEventBlock(weekGrid, event, dayIndex) {
        const range = event?._renderRange || getRenderableEventRange(event);
        if (!range) return;

        const startHour = Math.floor(range.startMinute / 60);
        const startCell = weekGrid.querySelector(`.week-cell[data-day="${dayIndex}"][data-hour="${startHour}"]`);
        if (!startCell) return;

        const minuteOffset = range.startMinute % 60;
        const durationMinutes = range.endMinute - range.startMinute;
        const crossedHourSeparators = Math.floor((minuteOffset + durationMinutes - 1) / 60);
        const separatorCompensationPx = crossedHourSeparators;

        const eventEl = document.createElement('div');
        eventEl.className = 'week-event-block';
        eventEl.dataset.eventId = event.id;
        eventEl.style.backgroundColor = event.color || '#DFA023';
        eventEl.style.top = `${minuteOffset}px`;
        eventEl.style.height = `${Math.max(22, durationMinutes + separatorCompensationPx)}px`;

        // If this is an academic indicator (recuperacions, no_lectiu, vacances, ...)
        // add a specific class so we can style it and ensure the title is visible.
        if (event && event.indicatorType) {
            try {
                const safeType = String(event.indicatorType).replace(/[^a-z0-9_-]+/gi, '_');
                eventEl.classList.add(`indicator-${safeType}`);
            } catch (err) {
                // ignore
            }

            // ensure indicator blocks are tall enough to show the descriptive title
            const minIndicatorHeight = 48; // px
            const currentH = parseInt(eventEl.style.height, 10) || 0;
            if (currentH < minIndicatorHeight) {
                eventEl.style.height = `${minIndicatorHeight}px`;
            }
        }

        const eventTitle = document.createElement('div');
        eventTitle.className = 'week-event-title';
        // Prefer explicit title; if missing use humanized indicatorType
        const hasTitle = String(event.title || '').trim().length > 0 && String(event.title || '').trim() !== '-';
        if (hasTitle) {
            eventTitle.textContent = event.title;
        } else if (event.indicatorType) {
            eventTitle.textContent = String(event.indicatorType).replace(/_/g, ' ');
        } else {
            eventTitle.textContent = 'Esdeveniment';
        }
        // Styling for indicator titles is handled via CSS; avoid inline sizing here.
        eventEl.appendChild(eventTitle);

        // Show explicit time for normal events; indicator events should not show a time label
        if (durationMinutes >= 45 && !event.indicatorType) {
            const eventTime = document.createElement('div');
            eventTime.className = 'week-event-time';
            eventTime.textContent = `${event.startTime || '--:--'} - ${event.endTime || '--:--'}`;
            eventEl.appendChild(eventTime);
        }

        // Only add meta if there's meaningful data (e.g., location).
        if (durationMinutes >= 60 && event.location) {
            const eventMeta = document.createElement('div');
            eventMeta.className = 'week-event-meta';

            const eventLocation = document.createElement('span');
            eventLocation.className = 'week-event-location';
            eventLocation.textContent = event.location;

            eventMeta.appendChild(eventLocation);

            eventEl.appendChild(eventMeta);
        }

        // If this is any indicator event, ensure no time nodes remain and title is visible
        if (event && event.indicatorType) {
            const timeNode = eventEl.querySelector('.week-event-time');
            if (timeNode) timeNode.remove();
            const metaNode = eventEl.querySelector('.week-event-meta');
            if (metaNode) metaNode.remove();
        }

        const overlapColumns = Number.isFinite(event._overlapColumns) ? event._overlapColumns : 1;
        const overlapColumn = Number.isFinite(event._overlapColumn) ? event._overlapColumn : 0;
        if (overlapColumns > 1) {
            const horizontalPaddingPct = 4;
            const usablePct = 100 - (horizontalPaddingPct * 2);
            const columnWidthPct = usablePct / overlapColumns;
            const leftPct = horizontalPaddingPct + (columnWidthPct * overlapColumn);

            eventEl.style.left = `${leftPct}%`;
            eventEl.style.right = 'auto';
            eventEl.style.width = `${Math.max(15, columnWidthPct - 1)}%`;
            eventEl.style.zIndex = String(20 + overlapColumn);
        } else {
            eventEl.style.left = '4px';
            eventEl.style.right = '4px';
            eventEl.style.width = 'auto';
            eventEl.style.zIndex = '12';
        }

        eventEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openEventDetail(event.id);
        });

        startCell.appendChild(eventEl);
    }

    function renderWeekView() {
        const weekHeader = document.getElementById('weekHeader');
        const weekGrid = document.getElementById('weekGrid');

        if (!weekHeader || !weekGrid) return;

        weekHeader.innerHTML = '';
        weekGrid.innerHTML = '';

        if (weekLabelElement) {
            weekLabelElement.textContent = formatWeekRangeLabel(currentDate);
        }

        const today = new Date();

        const startOfWeek = new Date(currentDate);
        const dayOfWeek = startOfWeek.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startOfWeek.setDate(startOfWeek.getDate() + diff);

        // Store week dates for reference
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            weekDates.push(date);
        }

        // Empty corner cell
        const cornerCell = document.createElement('div');
        cornerCell.className = 'week-header-day';
        weekHeader.appendChild(cornerCell);

        // Day headers
        for (let i = 0; i < 7; i++) {
            const date = weekDates[i];

            const headerCell = document.createElement('div');
            headerCell.className = 'week-header-day';

            if (date.toDateString() === today.toDateString()) {
                headerCell.classList.add('today');
            }

            headerCell.innerHTML = `
                <span class="day-name">${shortDayNames[(i + 1) % 7]}</span>
                <span class="day-number">${date.getDate()}</span>
            `;

            weekHeader.appendChild(headerCell);
        }

        const visibleStartHour = 8;
        const visibleEndHour = 21;
        const visibleStartMinute = visibleStartHour * 60;
        const visibleEndMinute = (visibleEndHour + 1) * 60;

        const weekEventsByDay = weekDates.map(date => getEventsForDate(date));
        const weekBackgroundEventsByDay = weekDates.map(date => getAcademicBackgroundEventForDate(date));
        const weekEventLayoutsByDay = weekEventsByDay
            .map(dayEvents => computeDayEventLayout(dayEvents, visibleStartMinute, visibleEndMinute));

        // Time slots (8:00 - 21:00)
        for (let hour = visibleStartHour; hour <= visibleEndHour; hour++) {
            const isBlockedHour = hour === 14;
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            if (isBlockedHour) {
                timeLabel.classList.add('lunch-break');
            }
            timeLabel.textContent = `${hour}:00`;
            weekGrid.appendChild(timeLabel);

            for (let day = 0; day < 7; day++) {
                const cell = document.createElement('div');
                cell.className = 'week-cell';
                cell.dataset.day = day;
                cell.dataset.hour = hour;
                if (isBlockedHour) {
                    cell.classList.add('lunch-break');
                }

                applyAcademicBackground(cell, weekBackgroundEventsByDay[day]);

                const dayEvents = weekEventLayoutsByDay[day] || [];
                const hourStartMinute = hour * 60;
                const hourEndMinute = (hour + 1) * 60;
                const hasEventInHour = dayEvents.some(event => {
                    const range = event._renderRange || getRenderableEventRange(event, visibleStartMinute, visibleEndMinute);
                    if (!range) return false;
                    return range.startMinute < hourEndMinute && range.endMinute > hourStartMinute;
                });

                if (hasEventInHour) {
                    cell.classList.add('has-event');
                }

                // Click to create event at this time slot
                cell.addEventListener('click', (e) => {
                    if (e.target.closest('.week-event-block')) return;
                    if (isVisualizationOnly) return;
                    if (isBlockedHour) return;

                    const cellDate = weekDates[day];
                    const dateStr = formatDateStr(cellDate);
                    const timeStr = `${String(hour).padStart(2, '0')}:00`;
                    openEventModal(dateStr, timeStr);
                });

                weekGrid.appendChild(cell);
            }
        }

        for (let day = 0; day < 7; day++) {
            const dayEvents = weekEventLayoutsByDay[day] || [];
            dayEvents.forEach(event => addWeekEventBlock(weekGrid, event, day));
        }
    }

    // ============================================
    // AGENDA VIEW
    // ============================================
    function renderAgendaView() {
        const agendaList = document.getElementById('agendaList');

        if (!agendaList) return;

        agendaList.innerHTML = '';

        const today = new Date();

        for (let i = 0; i < 7; i++) {
            const date = new Date(currentDate);
            date.setDate(currentDate.getDate() + i);

            const dayDiv = document.createElement('div');
            dayDiv.className = 'agenda-day';

            if (date.toDateString() === today.toDateString()) {
                dayDiv.classList.add('today');
            }

            const dayName = dayNames[date.getDay()];
            const dayNum = date.getDate();
            const monthName = monthNames[date.getMonth()];

            const dayEvents = getEventsForDate(date);
            let eventsHtml;

            if (dayEvents.length === 0) {
                eventsHtml = '<div class="agenda-empty">No hi ha esdeveniments</div>';
            } else {
                eventsHtml = dayEvents.map(event => `
                    <div class="agenda-event" data-event-id="${event.id}" style="background-color: ${event.color || event.backgroundColor || '#DFA023'};">
                        <span class="agenda-event-time">${event.startTime || 'Tot el dia'}</span>
                        <span class="agenda-event-title">${event.title}</span>
                    </div>
                `).join('');
            }

            dayDiv.innerHTML = `
                <div class="agenda-day-header">
                    ${dayName}, ${dayNum} de ${monthName}
                </div>
                ${eventsHtml}
            `;

            dayDiv.querySelectorAll('.agenda-event').forEach(eventEl => {
                eventEl.addEventListener('click', () => {
                    const eventId = eventEl.dataset.eventId;
                    openEventDetail(eventId);
                });
            });

            agendaList.appendChild(dayDiv);
        }
    }

    // ============================================
    // VIEW MANAGEMENT
    // ============================================
    function switchView(view) {
        currentView = view;

        // Update button states
        viewButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            }
        });

        // Hide all views
        if (monthView) monthView.style.display = 'none';
        if (weekView) weekView.style.display = 'none';
        if (agendaView) agendaView.style.display = 'none';

        // Show selected view and render
        switch (view) {
            case 'month':
                if (monthView) monthView.style.display = 'block';
                renderMonthView();
                break;
            case 'week':
                if (weekView) weekView.style.display = 'block';
                renderWeekView();
                break;
            case 'agenda':
                if (agendaView) agendaView.style.display = 'block';
                renderAgendaView();
                break;
        }

        // Show only the appropriate navigation/changer controls
        if (view === 'week') {
            if (prevMonthBtn) prevMonthBtn.style.display = 'none';
            if (nextMonthBtn) nextMonthBtn.style.display = 'none';
            if (currentMonthEl) currentMonthEl.style.display = 'none';
            if (weekChangerEl) weekChangerEl.style.display = 'flex';
        } else {
            if (prevMonthBtn) prevMonthBtn.style.display = '';
            if (nextMonthBtn) nextMonthBtn.style.display = '';
            if (currentMonthEl) currentMonthEl.style.display = '';
            if (weekChangerEl) weekChangerEl.style.display = 'none';
        }

        updateMonthDisplay();
        updateCalendarInsights();
    }

    function renderCurrentView() {
        switch (currentView) {
            case 'month':
                renderMonthView();
                break;
            case 'week':
                renderWeekView();
                break;
            case 'agenda':
                renderAgendaView();
                break;
        }

        // Ensure correct nav/changer visibility on render
        if (currentView === 'week') {
            if (prevMonthBtn) prevMonthBtn.style.display = 'none';
            if (nextMonthBtn) nextMonthBtn.style.display = 'none';
            if (currentMonthEl) currentMonthEl.style.display = 'none';
            if (weekChangerEl) weekChangerEl.style.display = 'flex';
        } else {
            if (prevMonthBtn) prevMonthBtn.style.display = '';
            if (nextMonthBtn) nextMonthBtn.style.display = '';
            if (currentMonthEl) currentMonthEl.style.display = '';
            if (weekChangerEl) weekChangerEl.style.display = 'none';
        }

        updateCalendarInsights();
    }

    function updateCalendarInsights() {
        const viewLabels = {
            month: 'Mensual',
            week: 'Setmanal',
            agenda: 'Agenda'
        };

        if (activeViewLabel) {
            activeViewLabel.textContent = viewLabels[currentView] || 'Setmanal';
        }

        if (visibleEventsCount) {
            visibleEventsCount.textContent = String(getVisibleEventsCount());
        }

        if (nextEventLabel) {
            nextEventLabel.textContent = getNextEventDescription();
        }
    }

    function getVisibleEventsCount() {
        if (!Array.isArray(events) || events.length === 0) return 0;

        if (currentView === 'month') {
            const targetYear = currentDate.getFullYear();
            const targetMonth = currentDate.getMonth();
            return events.filter(eventItem => {
                const date = parseCalendarDateValue(eventItem.date);
                return date &&
                    date.getFullYear() === targetYear &&
                    date.getMonth() === targetMonth;
            }).length;
        }

        if (currentView === 'week') {
            const startOfWeek = new Date(currentDate);
            const dayOfWeek = startOfWeek.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startOfWeek.setDate(startOfWeek.getDate() + diff);
            startOfWeek.setHours(0, 0, 0, 0);

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            return events.filter(eventItem => {
                const date = parseCalendarDateValue(eventItem.date);
                return date && date >= startOfWeek && date <= endOfWeek;
            }).length;
        }

        const agendaStart = new Date(currentDate);
        agendaStart.setHours(0, 0, 0, 0);
        const agendaEnd = new Date(agendaStart);
        agendaEnd.setDate(agendaEnd.getDate() + 6);
        agendaEnd.setHours(23, 59, 59, 999);

        return events.filter(eventItem => {
            const date = parseCalendarDateValue(eventItem.date);
            return date && date >= agendaStart && date <= agendaEnd;
        }).length;
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;

        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            borderRadius: '12px',
            background: type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6',
            color: 'white',
            fontFamily: "'Open Serif Book', serif",
            fontSize: '0.95rem',
            fontWeight: '500',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            zIndex: '9999',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            animation: 'slideIn 0.3s ease'
        });

        document.body.appendChild(notification);

        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        setTimeout(() => notification.remove(), 3000);
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    // Navigation buttons
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => navigateMonth(1));
    }

    if (prevWeekBtn) {
        prevWeekBtn.addEventListener('click', () => {
            const next = new Date(currentDate);
            next.setDate(next.getDate() - 7);
            currentDate = next;
            updateMonthDisplay();
            renderCurrentView();
        });
    }

    if (nextWeekBtn) {
        nextWeekBtn.addEventListener('click', () => {
            const next = new Date(currentDate);
            next.setDate(next.getDate() + 7);
            currentDate = next;
            updateMonthDisplay();
            renderCurrentView();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', goToToday);
    }

    // View buttons
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });


    // Saved Schedules buttons
    if (savedSchedulesSelect) {
        savedSchedulesSelect.addEventListener('change', () => {
            const hasValue = Boolean(savedSchedulesSelect.value);
            if (loadSavedScheduleBtn) loadSavedScheduleBtn.disabled = !hasValue;
            if (renameSavedScheduleBtn) renameSavedScheduleBtn.disabled = !hasValue;
            if (removeSavedScheduleBtn) removeSavedScheduleBtn.disabled = !hasValue;
        });
    }

    if (loadSavedScheduleBtn) {
        loadSavedScheduleBtn.addEventListener('click', async () => {
            if (!savedSchedulesSelect || !savedSchedulesSelect.value) {
                showNotification('Selecciona un horari guardat.', 'info');
                return;
            }
            await loadSavedCalendarToEvents(savedSchedulesSelect.value);
        });
    }

    if (removeSavedScheduleBtn) {
        removeSavedScheduleBtn.addEventListener('click', () => {
            if (!savedSchedulesSelect || !savedSchedulesSelect.value) {
                showNotification('Selecciona un horari guardat.', 'info');
                return;
            }

            removeSavedCalendar(savedSchedulesSelect.value);
        });
    }

    if (renameSavedScheduleBtn) {
        renameSavedScheduleBtn.addEventListener('click', () => {
            if (!savedSchedulesSelect || !savedSchedulesSelect.value) {
                showNotification('Selecciona un horari guardat.', 'info');
                return;
            }

            openRenameScheduleModal(savedSchedulesSelect.value);
        });
    }

    if (cancelRenameScheduleBtn) {
        cancelRenameScheduleBtn.addEventListener('click', () => {
            closeRenameScheduleModal();
        });
    }

    if (renameScheduleModalOverlay) {
        renameScheduleModalOverlay.addEventListener('click', (event) => {
            if (event.target === renameScheduleModalOverlay) {
                closeRenameScheduleModal();
            }
        });
    }

    if (renameScheduleForm) {
        renameScheduleForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const calendarId = renameScheduleForm.dataset.calendarId;
            if (!calendarId) {
                closeRenameScheduleModal();
                return;
            }

            const proposedName = renameScheduleInput ? renameScheduleInput.value : '';
            const renamed = renameSavedCalendar(calendarId, proposedName);
            if (renamed) {
                closeRenameScheduleModal();
            }
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEventModal();
            closeEventDetail();
            closeImportModal();
            closeRenameScheduleModal();
        }
    });

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
        populateSavedCalendarsSelect();

        await loadSavedScheduleEvents();

        if (window.AcademicCalendar && typeof window.AcademicCalendar.buildPeriodEvents === 'function') {
            try {
                const periodEvents = window.AcademicCalendar.buildPeriodEvents('ALL') || [];
                if (periodEvents.length > 0) {
                    const currentEvents = normalizeCalendarEvents(events);
                    const withoutPeriods = currentEvents.filter(e => e.source !== 'academic-calendar');
                    setEventsAndFocusDate([...withoutPeriods, ...periodEvents]);
                    saveEvents();
                }
            } catch (err) {
                console.error('Error loading academic period events on init', err);
            }
        }

        updateClock();
        setInterval(updateClock, 1000);

        updateMonthDisplay();
        switchView('week');

        // Add notification animation style
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    init();
});
