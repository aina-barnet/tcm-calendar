(function () {
    const ACADEMIC_CALENDAR = {
        T1: {
            classes: { start: '2025-09-25', end: '2025-11-28' },
            examens: { start: '2025-12-09', end: '2025-12-19' },
            vacances: { start: '2025-12-20', end: '2026-01-06' },
            recuperacions: { start: '2026-01-29', end: '2026-01-30' }
        },
        T2: {
            classes: { start: '2026-01-07', end: '2026-03-13' },
            examens: { start: '2026-03-16', end: '2026-03-27' },
            recuperacions: { start: '2026-04-29', end: '2026-04-30' }
        },
        T3: {
            classes: { start: '2026-04-07', end: '2026-06-12' },
            examens: { start: '2026-06-15', end: '2026-06-26' },
            recuperacions: { start: '2026-07-13', end: '2026-07-14' }
        },
        noLectiu: [
            '2025-09-11', '2025-10-12', '2025-11-01',
            '2025-12-06', '2025-12-08',
            '2026-04-23', '2026-05-01', '2026-05-25',
            '2026-06-29', '2026-06-30',
            { start: '2026-07-01', end: '2026-07-31' }
        ]
    };

    const CALENDAR_ENDPOINT = 'http://localhost:8080/api/timetables/academic-calendar';
    const STORAGE_KEY = 'tcm_academic_calendar_raw';

    const cache = {
        raw: null,
        parsed: null,
        loading: null
    };

    function parseDateParts(value) {
        const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return null;

        const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatIsoDate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function parseIsoDate(value) {
        const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;

        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function addDays(date, days) {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        next.setHours(0, 0, 0, 0);
        return next;
    }

    function expandDateRange(startDate, endDate) {
        const dates = [];
        if (!(startDate instanceof Date) || !(endDate instanceof Date)) return dates;

        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);

        while (current.getTime() <= end.getTime()) {
            dates.push(formatIsoDate(current));
            current.setDate(current.getDate() + 1);
        }

        return dates;
    }

    function buildStaticNoLectiuDates() {
        const dates = new Set();

        (ACADEMIC_CALENDAR.noLectiu || []).forEach(entry => {
            if (typeof entry === 'string') {
                dates.add(entry);
                return;
            }

            const startDate = parseIsoDate(entry?.start);
            const endDate = parseIsoDate(entry?.end);
            if (!startDate || !endDate) return;

            expandDateRange(startDate, endDate).forEach(dateStr => dates.add(dateStr));
        });

        return dates;
    }

    function getTrimesterLabel(trimester) {
        if (trimester === 1 || trimester === '1') return 'T1';
        if (trimester === 2 || trimester === '2') return 'T2';
        if (trimester === 3 || trimester === '3') return 'T3';

        const normalized = String(trimester || '').trim().toUpperCase();
        if (['T1', 'T2', 'T3'].includes(normalized)) return normalized;

        return 'T1';
    }

    function getActiveTrimestre() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const trimester of ['T1', 'T2', 'T3']) {
            const trimesterData = ACADEMIC_CALENDAR[trimester];
            const startDate = parseIsoDate(trimesterData?.classes?.start);
            const endDate = parseIsoDate(trimesterData?.recuperacions?.end || trimesterData?.examens?.end || trimesterData?.classes?.end);

            if (!startDate || !endDate) continue;
            if (today.getTime() >= startDate.getTime() && today.getTime() <= endDate.getTime()) {
                return trimester;
            }
        }

        return 'T1';
    }

    function isNoLectiu(dateStr) {
        return buildStaticNoLectiuDates().has(String(dateStr || '').trim());
    }

    function buildPeriodEvents(trimestre) {
        const normalizedTrimester = String(trimestre || '').trim().toUpperCase();
        const generateAll = !trimestre || normalizedTrimester === 'ALL';
        const activeTrimester = generateAll ? null : getTrimesterLabel(trimestre || getActiveTrimestre());
        const periodByDate = new Map();
        const noLectiuDates = buildStaticNoLectiuDates();

        const priority = {
            examens: 4,
            recuperacions: 3,
            vacances: 2,
            no_lectiu: 1
        };

        const addEvent = (kind, dateStr, title) => {
            if (!dateStr) return;

            const date = parseIsoDate(dateStr);
            const dayOfWeek = date ? date.getDay() : -1;
            if (dayOfWeek === 0 || dayOfWeek === 6) return;

            const existing = periodByDate.get(dateStr);
            const nextRank = priority[kind] || 0;
            const existingRank = existing ? (priority[existing.indicatorType] || 0) : 0;
            if (existing && existingRank >= nextRank) return;

            const colors = {
                examens: '#c91616',
                vacances: '#0F766E',
                recuperacions: '#7C3AED',
                no_lectiu: '#F0C60D'
            };

            periodByDate.set(dateStr, {
                id: `academic-${kind}-${dateStr}`,
                title,
                date: dateStr,
                allDay: true,
                indicatorType: kind,
                category: kind,
                backgroundColor: colors[kind] || '#6B7280',
                source: 'academic-calendar',
                readOnly: true
            });
        };

        const addRange = (kind, range, title) => {
            const startDate = parseIsoDate(range?.start);
            const endDate = parseIsoDate(range?.end);
            if (!startDate || !endDate) return;

            expandDateRange(startDate, endDate).forEach(dateStr => addEvent(kind, dateStr, title));
        };

        if (generateAll || activeTrimester === 'T1') {
            addRange('examens', ACADEMIC_CALENDAR.T1.examens, 'Exàmens T1');
            addRange('vacances', ACADEMIC_CALENDAR.T1.vacances, 'Vacances de Nadal');
            addRange('recuperacions', ACADEMIC_CALENDAR.T1.recuperacions, 'Recuperacions T1');
        }

        if (generateAll || activeTrimester === 'T2') {
            addRange('examens', ACADEMIC_CALENDAR.T2.examens, 'Exàmens T2');
            addRange('recuperacions', ACADEMIC_CALENDAR.T2.recuperacions, 'Recuperacions T2');
            if (!generateAll) addRange('recuperacions', ACADEMIC_CALENDAR.T1.recuperacions, 'Recuperacions T1');
        }

        if (generateAll || activeTrimester === 'T3') {
            addRange('examens', ACADEMIC_CALENDAR.T3.examens, 'Exàmens T3');
            addRange('recuperacions', ACADEMIC_CALENDAR.T3.recuperacions, 'Recuperacions T3');
            if (!generateAll) addRange('recuperacions', ACADEMIC_CALENDAR.T2.recuperacions, 'Recuperacions T2');
        }

        noLectiuDates.forEach(dateStr => {
            if (dateStr >= '2025-09-01' && dateStr <= '2026-07-31') {
                addEvent('no_lectiu', dateStr, 'Dia no lectiu');
            }
        });

        return Array.from(periodByDate.values()).sort((left, right) => {
            if (left.date !== right.date) return left.date.localeCompare(right.date);
            return left.title.localeCompare(right.title);
        });
    }

    function parseCalendarText(rawText) {
        const parsed = { trimesters: {}, noLectiuDates: [] };
        const lines = String(rawText || '').split(/\r?\n/);
        let activeTrimester = null;
        let inNoLectiuBlock = false;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('//')) continue;

            if (/^NO_LECTIU\s*\{$/i.test(line)) {
                activeTrimester = null;
                inNoLectiuBlock = true;
                continue;
            }

            const trimesterMatch = line.match(/^([1-3])_TRIMESTRE\s*\{$/i);
            if (trimesterMatch) {
                activeTrimester = trimesterMatch[1];
                inNoLectiuBlock = false;
                parsed.trimesters[activeTrimester] = parsed.trimesters[activeTrimester] || {};
                continue;
            }

            if (line === '}') {
                activeTrimester = null;
                inNoLectiuBlock = false;
                continue;
            }

            const periodMatch = line.match(/^([a-z_]+)\s*=\s*(\d{2}\/\d{2}\/\d{4})\s*[–-]\s*(\d{2}\/\d{2}\/\d{4})$/i);
            if (activeTrimester && periodMatch) {
                const periodName = periodMatch[1].toLowerCase();
                const startDate = parseDateParts(periodMatch[2]);
                const endDate = parseDateParts(periodMatch[3]);

                parsed.trimesters[activeTrimester][periodName] = {
                    startDate: startDate ? formatIsoDate(startDate) : null,
                    endDate: endDate ? formatIsoDate(endDate) : null
                };
                continue;
            }

            if (inNoLectiuBlock) {
                const dateRangeMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s*[–-]\s*(\d{2}\/\d{2}\/\d{4})$/);
                if (dateRangeMatch) {
                    const startDate = parseDateParts(dateRangeMatch[1]);
                    const endDate = parseDateParts(dateRangeMatch[2]);
                    parsed.noLectiuDates.push(...expandDateRange(startDate, endDate));
                    continue;
                }

                const singleDate = parseDateParts(line);
                if (singleDate) {
                    parsed.noLectiuDates.push(formatIsoDate(singleDate));
                }
            }
        }

        parsed.noLectiuDates = Array.from(new Set(parsed.noLectiuDates)).sort();
        return parsed;
    }

    async function loadRawCalendarText() {
        if (cache.raw) return cache.raw;

        const stored = localStorage.getItem(STORAGE_KEY);

        try {
            const response = await fetch(CALENDAR_ENDPOINT, {
                cache: 'no-store',
                headers: window.AuthState && typeof window.AuthState.getAuthHeaders === 'function'
                    ? window.AuthState.getAuthHeaders()
                    : {}
            });

            if (response.ok) {
                const text = await response.text();
                if (text && /[1-3]_TRIMESTRE/i.test(text)) {
                    cache.raw = text;
                    localStorage.setItem(STORAGE_KEY, text);
                    return text;
                }
            }
        } catch (error) {
            console.warn('No s\'ha pogut carregar el calendari acadèmic remot, s\'usa un fallback local.', error);
        }

        if (stored && /[1-3]_TRIMESTRE/i.test(stored)) {
            cache.raw = stored;
            return stored;
        }
    }

    async function ensureParsedCalendar() {
        if (cache.parsed) return cache.parsed;

        if (!cache.loading) {
            cache.loading = loadRawCalendarText().then(rawText => {
                cache.parsed = parseCalendarText(rawText);
                return cache.parsed;
            });
        }

        return cache.loading;
    }

    function parseTimeToMinutes(value) {
        if (typeof value !== 'string') return null;
        const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        return hours * 60 + minutes;
    }

    function formatMinutes(totalMinutes) {
        const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const minutes = String(totalMinutes % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function getTrimesterWindowFromParsed(parsed, trimester) {
        if (!parsed || !trimester) return null;

        const trimesterData = parsed.trimesters[String(trimester)];
        if (!trimesterData || !trimesterData.classes || !trimesterData.classes.startDate || !trimesterData.classes.endDate) {
            return null;
        }

        return {
            trimester: Number(trimester),
            classes: trimesterData.classes,
            examens: trimesterData.examens || null,
            vacances: trimesterData.vacances || null,
            recuperacions: trimesterData.recuperacions || null,
            noLectiuDates: parsed.noLectiuDates || []
        };
    }

    function resolveCurrentAcademicTrimester(parsed) {
        if (!parsed || !parsed.trimesters) return null;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        for (const trimesterCandidate of [1, 2, 3]) {
            const data = parsed.trimesters[String(trimesterCandidate)];
            const startDate = parseIsoDate(data?.classes?.startDate);
            const endDate = parseIsoDate(data?.classes?.endDate);
            if (!startDate || !endDate) continue;

            if (now.getTime() >= startDate.getTime() && now.getTime() <= endDate.getTime()) {
                return trimesterCandidate;
            }
        }

        return null;
    }

    function extractTrimesterFromTerm(termValue) {
        if (termValue === null || termValue === undefined) return null;

        const normalized = String(termValue)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return null;
        if (normalized === '1') return 1;
        if (normalized === '2') return 2;
        if (normalized === '3') return 3;

        const compact = normalized.replace(/\s+/g, '');
        if (/(^|\b)1\s*(r|er)?\s*trim/.test(normalized) || /(^|\b)1\s*_?trimestre/.test(normalized) || /\btrim(est(re)?)?\s*1\b/.test(normalized) || /^t\s*1\b/.test(normalized) || compact === 't1') return 1;
        if (/(^|\b)2\s*(n|on)?\s*trim/.test(normalized) || /(^|\b)2\s*_?trimestre/.test(normalized) || /\btrim(est(re)?)?\s*2\b/.test(normalized) || /^t\s*2\b/.test(normalized) || compact === 't2') return 2;
        if (/(^|\b)3\s*(r|er)?\s*trim/.test(normalized) || /(^|\b)3\s*_?trimestre/.test(normalized) || /\btrim(est(re)?)?\s*3\b/.test(normalized) || /^t\s*3\b/.test(normalized) || compact === 't3') return 3;

        return null;
    }

    function resolveTrimesterFromSchedule(parsed, scheduleData) {
        const explicitTrimester = Number(scheduleData?.selectedTrimester ?? scheduleData?.trimester ?? scheduleData?.trimesterWindow?.trimester ?? null);
        if (Number.isFinite(explicitTrimester) && explicitTrimester >= 1 && explicitTrimester <= 3) {
            return explicitTrimester;
        }

        const classTerms = [];
        const weeks = Array.isArray(scheduleData?.weeks) ? scheduleData.weeks : [];
        weeks.forEach(week => {
            const classes = Array.isArray(week?.classes) ? week.classes : [];
            classes.forEach(classInfo => {
                if (classInfo?.term !== null && classInfo?.term !== undefined) {
                    classTerms.push(classInfo.term);
                }
            });
        });

        if (classTerms.length === 0 && Array.isArray(scheduleData?.classes)) {
            scheduleData.classes.forEach(classInfo => {
                if (classInfo?.term !== null && classInfo?.term !== undefined) {
                    classTerms.push(classInfo.term);
                }
            });
        }

        const inferred = new Set(classTerms.map(extractTrimesterFromTerm).filter(value => value !== null));
        if (inferred.size === 1) {
            return Array.from(inferred)[0];
        }

        const currentTrimester = resolveCurrentAcademicTrimester(parsed);
        if (currentTrimester !== null) return currentTrimester;

        for (const fallbackTrimester of [1, 2, 3]) {
            if (getTrimesterWindowFromParsed(parsed, fallbackTrimester)) {
                return fallbackTrimester;
            }
        }

        return null;
    }

    function getWeekVariants(scheduleData) {
        if (Array.isArray(scheduleData?.weeks) && scheduleData.weeks.length > 0) {
            return scheduleData.weeks;
        }

        if (Array.isArray(scheduleData?.classes)) {
            return [{ parity: 'odd', classes: scheduleData.classes }];
        }

        return [];
    }

    function buildAcademicPeriodEvents(calendarId, trimesterWindow, parsedCalendar, activeTrimester) {
        return buildPeriodEvents(activeTrimester || trimesterWindow?.trimester || getActiveTrimestre());
    }

    function buildAcademicEvents(scheduleData, calendarId, trimesterWindow, parsedCalendar, activeTrimester) {
        const periodEvents = buildAcademicPeriodEvents(calendarId, trimesterWindow, parsedCalendar, activeTrimester);
        const weekVariants = getWeekVariants(scheduleData);
        if (weekVariants.length === 0) return periodEvents;

        const startDate = parseIsoDate(trimesterWindow?.classes?.startDate);
        const endDate = parseIsoDate(trimesterWindow?.classes?.endDate);
        if (!startDate || !endDate) return periodEvents;

        const blockedDates = new Set([...(trimesterWindow?.noLectiuDates || []), ...(parsedCalendar?.noLectiuDates || [])]);
        const selectedTrimesterNumber = Number(activeTrimester || trimesterWindow?.trimester || 1);

        const addBlockedRange = range => {
            const rangeStart = parseIsoDate(range?.startDate);
            const rangeEnd = parseIsoDate(range?.endDate);
            if (!rangeStart || !rangeEnd) return;

            expandDateRange(rangeStart, rangeEnd).forEach(dateStr => blockedDates.add(dateStr));
        };

        addBlockedRange(trimesterWindow?.recuperacions);

        if (selectedTrimesterNumber > 1) {
            const previousTrimester = selectedTrimesterNumber - 1;
            addBlockedRange(parsedCalendar?.trimesters?.[String(previousTrimester)]?.recuperacions || null);
        }

        const oddClasses = weekVariants.find(week => week.parity === 'odd')?.classes || weekVariants[0]?.classes || [];
        const evenClasses = weekVariants.find(week => week.parity === 'even')?.classes || weekVariants[0]?.classes || oddClasses;
        const generated = [];

        for (let current = new Date(startDate); current.getTime() <= endDate.getTime(); current = addDays(current, 1)) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const dateStr = formatIsoDate(current);
            if (blockedDates.has(dateStr)) continue;

            const academicWeekNumber = Math.floor((current.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            const isOddAcademicWeek = academicWeekNumber % 2 === 0;
            const targetClasses = isOddAcademicWeek ? oddClasses : evenClasses;

            targetClasses.forEach((classInfo, classIndex) => {
                if (!Number.isFinite(classInfo?.day) || classInfo.day !== dayOfWeek) return;

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

                generated.push({
                    id: `generated-${calendarId}-${dateStr}-${classIndex}`,
                    title: classInfo.name || classInfo.subjectCode || 'Classe',
                    date: dateStr,
                    startTime: formatMinutes(startMinutes),
                    endTime: formatMinutes(endMinutes),
                    location: classInfo.room || null,
                    category: 'class',
                    description: `Classe importada des d'un horari guardat (${isOddAcademicWeek ? 'setmana imparella' : 'setmana parella'})`,
                    color: classInfo.type === 'lab' ? '#3B82F6' : classInfo.type === 'seminar' ? '#8B5CF6' : '#DFA023',
                    source: 'saved-schedule',
                    scheduleId: calendarId,
                    readOnly: true,
                    trimester: trimesterWindow.trimester
                });
            });
        }

        const allEvents = [...generated, ...periodEvents];
        allEvents.sort((a, b) => {
            const aDateTime = `${a.date || ''}T${a.startTime || '00:00'}`;
            const bDateTime = `${b.date || ''}T${b.startTime || '00:00'}`;
            return aDateTime.localeCompare(bDateTime);
        });

        return allEvents;
    }

    function buildLegacyEvents(scheduleData, calendarId) {
        const now = new Date();
        const semesterStart = new Date(now);
        const day = semesterStart.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        semesterStart.setDate(semesterStart.getDate() + diffToMonday);
        semesterStart.setHours(0, 0, 0, 0);

        const weekVariants = getWeekVariants(scheduleData);
        const generated = [];

        for (let week = 0; week < 16; week++) {
            const parity = week % 2 === 0 ? 'odd' : 'even';
            const variant = weekVariants.find(w => w?.parity === parity) || weekVariants[0];
            const classes = Array.isArray(variant?.classes) ? variant.classes : [];

            classes.forEach((classInfo, classIndex) => {
                if (!classInfo || !Number.isFinite(classInfo.day)) return;

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

                generated.push({
                    id: `generated-${calendarId}-${week}-${classIndex}`,
                    title: classInfo.name || classInfo.subjectCode || 'Classe',
                    date: formatIsoDate(classDate),
                    startTime: formatMinutes(startMinutes),
                    endTime: formatMinutes(endMinutes),
                    location: classInfo.room || null,
                    category: 'class',
                    color: classInfo.type === 'lab' ? '#3B82F6' : classInfo.type === 'seminar' ? '#8B5CF6' : '#DFA023',
                    source: 'saved-schedule',
                    scheduleId: calendarId,
                    readOnly: true
                });
            });
        }

        return generated;
    }

    async function buildScheduleEvents(scheduleData, calendarId) {
        const parsed = await ensureParsedCalendar();
        const storedTrimesterWindow = scheduleData?.trimesterWindow ? {
            trimester: Number(scheduleData.trimesterWindow.trimester) || null,
            classes: scheduleData.trimesterWindow.classes,
            examens: scheduleData.trimesterWindow.examens || null,
            vacances: scheduleData.trimesterWindow.vacances || null,
            recuperacions: scheduleData.trimesterWindow.recuperacions || null,
            noLectiuDates: Array.isArray(scheduleData.trimesterWindow.noLectiuDates) && scheduleData.trimesterWindow.noLectiuDates.length > 0
                ? Array.from(new Set(scheduleData.trimesterWindow.noLectiuDates)).sort()
                : (parsed?.noLectiuDates || [])
        } : null;

        const trimester = resolveTrimesterFromSchedule(parsed, scheduleData)
            || storedTrimesterWindow?.trimester
            || resolveCurrentAcademicTrimester(parsed)
            || null;

        const trimesterWindow = getTrimesterWindowFromParsed(parsed, trimester) || storedTrimesterWindow;

        if (trimesterWindow) {
            return buildAcademicEvents(scheduleData, calendarId, trimesterWindow, parsed, trimester);
        }

        return buildLegacyEvents(scheduleData, calendarId);
    }

    async function getTrimesterWindow(trimester) {
        const parsed = await ensureParsedCalendar();
        return getTrimesterWindowFromParsed(parsed, Number(trimester));
    }

    window.AcademicCalendar = {
        ensureLoaded: ensureParsedCalendar,
        buildScheduleEvents,
        buildPeriodEvents,
        buildAcademicPeriodEvents,
        getActiveTrimestre,
        isNoLectiu,
        CALENDAR: ACADEMIC_CALENDAR,
        getTrimesterWindow,
        parseCalendarText
    };
})();