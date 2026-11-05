// Schedule Viewer Script

class ScheduleViewer {
    constructor() {
        this.SAVED_CALENDARS_KEY = 'tcm_saved_calendars';
        this.ACTIVE_SAVED_CALENDAR_KEY = 'tcm_active_saved_calendar';
        this.CALENDAR_EVENTS_KEY = 'tcm_calendar_events';
        this.generationData = null;
        this.scheduleOptions = [];
        this.displayVariants = [];
        this.currentVariantIndex = 0;
        this.gridStartHour = 8;
        this.gridEndHour = 21;
        this.subjectNameByCode = {};
        this.backendNotice = null;
        this.subjectPalette = [
            '#B45309',
            '#0F766E',
            '#7C3AED',
            '#2563EB',
            '#DB2777',
            '#059669',
            '#D97706',
            '#4F46E5'
        ];
        this.subjectColorByCode = {};

        this.init();
    }

    getAuthHeaders() {
        const token = AuthState.getToken && AuthState.getToken();
        const base = { 'Content-Type': 'application/json' };
        if (token) base['Authorization'] = `Bearer ${token}`;
        return base;
    }

    normalizePreferences(source = {}) {
        const freeDayPreference = this.normalizeStringValue(source.freeDayPreference);
        const preferredTime = source.preferredTime === 'morning' || source.preferredTime === 'afternoon'
            ? source.preferredTime
            : null;

        let optimization = this.normalizeOptimizationValue(source.optimization);
        if ((!this.normalizeStringValue(source.optimization) || optimization === 'minimize_gaps') && freeDayPreference) {
            optimization = 'free-day';
        } else if ((!this.normalizeStringValue(source.optimization) || optimization === 'minimize_gaps') && (preferredTime === 'morning' || source.noMornings === true)) {
            optimization = 'avoid-early';
        } else if ((!this.normalizeStringValue(source.optimization) || optimization === 'minimize_gaps') && (preferredTime === 'afternoon' || source.noEvenings === true)) {
            optimization = 'avoid-late';
        }

        return {
            optimization,
            freeDayPreference,
            preferredTime,
            isEmployed: source.isEmployed === true || source.isEmployed === false ? source.isEmployed : null,
            noMornings: Boolean(source.noMornings),
            noEvenings: Boolean(source.noEvenings),
            noNoon: Boolean(source.noNoon)
        };
    }

    normalizePreferenceSummary(source = {}) {
        const scores = source && typeof source.scores === 'object' && !Array.isArray(source.scores)
            ? Object.fromEntries(
                Object.entries(source.scores).map(([key, value]) => [key, Number(value) || 0])
            )
            : {};

        if (scores.compact_days == null && scores.balanced != null) {
            scores.compact_days = scores.balanced;
        }

        if (scores.balanced == null && scores.compact_days != null) {
            scores.balanced = scores.compact_days;
        }

        return {
            scores,
            recommendedFor: Array.isArray(source.recommendedFor)
                ? source.recommendedFor.map(item => String(item).trim()).filter(Boolean)
                : [],
            explanation: typeof source.explanation === 'string' ? source.explanation.trim() : ''
        };
    }

    buildPreferenceSummaryForOption(classesByWeek = []) {
        const allClasses = classesByWeek.flatMap(week => Array.isArray(week?.classes) ? week.classes : []);
        if (!Array.isArray(allClasses) || allClasses.length === 0) {
            return this.normalizePreferenceSummary({
                scores: {},
                recommendedFor: [],
                explanation: ''
            });
        }

        const byDay = new Map();
        allClasses.forEach((classInfo) => {
            const day = Number(classInfo?.day);
            if (!Number.isFinite(day) || day < 1 || day > 5) {
                return;
            }

            const entries = byDay.get(day) || [];
            entries.push(classInfo);
            byDay.set(day, entries);
        });

        const dailyMinutes = [];
        const dayTypes = [];
        let gapMinutes = 0;
        let earlyStarts = 0;
        let lateEnds = 0;
        let totalMinutes = 0;

        for (let day = 1; day <= 5; day++) {
            const classes = (byDay.get(day) || []).slice().sort((left, right) => left.startMinute - right.startMinute);
            if (classes.length === 0) {
                continue;
            }

            const types = new Set();
            let dailyTotal = 0;

            classes.forEach((classInfo, index) => {
                const startMinute = Number(classInfo.startMinute) || 0;
                const endMinute = Number(classInfo.endMinute) || 0;
                const duration = Math.max(0, endMinute - startMinute);
                dailyTotal += duration;
                totalMinutes += duration;
                types.add(classInfo.type || 'theory');

                if (index === 0 && (startMinute === 8 * 60 + 15 || startMinute === 15 * 60)) {
                    earlyStarts += 1;
                }

                if (endMinute === 14 * 60 || endMinute === 20 * 60 + 45) {
                    lateEnds += 1;
                }

                if (index > 0) {
                    gapMinutes += this.calculateDeadMinutesBetween(classes[index - 1].endMinute, startMinute);
                }
            });

            dailyMinutes.push(dailyTotal);
            dayTypes.push(types);
        }

        const activeDays = dailyMinutes.length;
        const freeDays = Math.max(0, 5 - activeDays);
        const averageMinutes = activeDays > 0 ? dailyMinutes.reduce((sum, value) => sum + value, 0) / activeDays : 0;
        const meanDeviation = activeDays > 0
            ? dailyMinutes.reduce((sum, value) => sum + Math.abs(value - averageMinutes), 0) / activeDays
            : 0;

        const pureDays = dayTypes.filter((types) => types.size === 1).length;
        const mixedDays = dayTypes.filter((types) => types.size > 1).length;
        const theoryDays = dayTypes.filter((types) => types.size === 1 && types.has('theory')).length;
        const practiceDays = dayTypes.filter((types) => types.size === 1 && types.has('lab')).length;

        const clampScore = (value) => Math.max(0, Math.min(1, value));
        const inverseScore = (penalty) => 1 / (1 + Math.max(0, penalty));

        const scores = {
            'minimize-gaps': inverseScore(gapMinutes / 60),
            minimize_weekly_hours: inverseScore(totalMinutes / 60),
            'free-day': clampScore(freeDays / 5),
            'compact_days': inverseScore(meanDeviation / 60),
            'balanced': inverseScore(meanDeviation / 60),
            'avoid-early': inverseScore(earlyStarts),
            'avoid-late': inverseScore(lateEnds),
            'group-by-type': clampScore((pureDays + Math.min(theoryDays, practiceDays) * 0.5 - mixedDays * 0.25) / Math.max(1, activeDays))
        };

        scores.minimize_gaps = scores['minimize-gaps'];
        scores.free_day = scores['free-day'];
        scores.balanced_days = scores.compact_days;
        scores.avoid_early = scores['avoid-early'];
        scores.avoid_late = scores['avoid-late'];
        scores.group_by_type = scores['group-by-type'];

        for (let day = 1; day <= 5; day++) {
            scores[`free_day_${day}`] = byDay.has(day) ? 0 : 1;
        }

        const ranked = Object.entries(scores)
            .filter(([key, value]) => !key.startsWith('free_day_') && Number.isFinite(value) && value > 0)
            .sort((left, right) => {
                const leftIsGap = left[0] === 'minimize-gaps' || left[0] === 'minimize_gaps';
                const rightIsGap = right[0] === 'minimize-gaps' || right[0] === 'minimize_gaps';

                if (leftIsGap !== rightIsGap) {
                    return leftIsGap ? 1 : -1;
                }

                return Number(right[1]) - Number(left[1]);
            });

        const recommendedFor = ranked.slice(0, 3).map(([key]) => this.getOptimizationLabel(key));
        const primaryRecommendation = ranked.find(([key]) => key !== 'minimize-gaps' && key !== 'minimize_gaps') || ranked[0];

        const explanation = primaryRecommendation
            ? `Aquest horari destaca per ${this.getOptimizationLabel(primaryRecommendation[0]).toLowerCase()}.`
            : '';

        return this.normalizePreferenceSummary({
            scores,
            recommendedFor,
            explanation
        });
    }

    getDefaultSelectionData() {
        return {
            selectedSubjects: [],
            totalEcts: 0,
            selectedTrimester: null,
            selectedSubjectDetails: []
        };
    }

    getUsername() {
        const user = AuthState.getUser();
        return AuthHelper.resolveUsername(user);
    }

    getSelectedSubjectsStorage() {
        const raw = sessionStorage.getItem('selectedSubjects');
        if (!raw) {
            return {
                currentDegree: '',
                selectionsByDegree: {},
                legacySelection: null
            };
        }

        try {
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object' && parsed.selectionsByDegree && typeof parsed.selectionsByDegree === 'object') {
                return {
                    currentDegree: typeof parsed.currentDegree === 'string' ? parsed.currentDegree : '',
                    selectionsByDegree: parsed.selectionsByDegree,
                    legacySelection: null
                };
            }

            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.selectedSubjects)) {
                const currentDegree = typeof parsed.currentDegree === 'string' ? parsed.currentDegree : '';
                const legacySelection = {
                    selectedSubjects: parsed.selectedSubjects,
                    totalEcts: Number(parsed.totalEcts) || 0,
                    selectedTrimester: parsed.selectedTrimester ?? null,
                    selectedSubjectDetails: Array.isArray(parsed.selectedSubjectDetails) ? parsed.selectedSubjectDetails : []
                };

                return {
                    currentDegree,
                    selectionsByDegree: currentDegree ? {
                        [currentDegree]: legacySelection
                    } : {},
                    legacySelection
                };
            }
        } catch (error) {
            console.error('Error carregant les assignatures seleccionades:', error);
        }

        return {
            currentDegree: '',
            selectionsByDegree: {},
            legacySelection: null
        };
    }

    getCurrentUserDegreeKey() {
        const username = this.getUsername();
        const selectionStorage = this.getSelectedSubjectsStorage();
        const degree = selectionStorage.currentDegree || '';

        if (username && degree) {
            return `${username}::${degree}`;
        }

        const rawPreferences = sessionStorage.getItem('preferences');
        if (rawPreferences) {
            try {
                const parsedPreferences = JSON.parse(rawPreferences);
                if (parsedPreferences && typeof parsedPreferences.currentUserDegreeKey === 'string') {
                    return parsedPreferences.currentUserDegreeKey;
                }
            } catch (error) {
                console.error('Error carregant preferències des de sessionStorage:', error);
            }
        }

        return '';
    }

    getPreferencesFromSessionStorage() {
        const raw = sessionStorage.getItem('preferences');
        if (!raw) {
            return this.normalizePreferences();
        }

        try {
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object' && parsed.preferencesByKey && typeof parsed.preferencesByKey === 'object') {
                const key = this.getCurrentUserDegreeKey();
                if (key && parsed.preferencesByKey[key]) {
                    return this.normalizePreferences(parsed.preferencesByKey[key]);
                }

                const preferenceEntries = Object.values(parsed.preferencesByKey);
                if (preferenceEntries.length > 0) {
                    return this.normalizePreferences(preferenceEntries[0]);
                }
            }

            if (parsed && typeof parsed === 'object' && (
                parsed.optimization != null ||
                parsed.freeDayPreference != null ||
                parsed.preferredTime != null ||
                parsed.isEmployed != null ||
                parsed.noMornings != null ||
                parsed.noEvenings != null ||
                parsed.noNoon != null
            )) {
                return this.normalizePreferences(parsed);
            }
        } catch (error) {
            console.error('Error carregant preferències des de sessionStorage:', error);
        }

        return this.normalizePreferences();
    }

    getSelectedSubjectsFromSessionStorage() {
        const storage = this.getSelectedSubjectsStorage();
        const degree = storage.currentDegree;

        if (storage.legacySelection) {
            return storage.legacySelection;
        }

        if (!degree) {
            return this.getDefaultSelectionData();
        }

        return storage.selectionsByDegree?.[degree] || this.getDefaultSelectionData();
    }

    normalizeSubjectCode(subjectCode) {
        return String(subjectCode || '').trim().replace(/(?:__T|_)[1-9]\d*$/, '');
    }

    normalizeSubjectText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    isThesisSubject(subject) {
        const type = this.normalizeSubjectText(subject?.type);
        const name = this.normalizeSubjectText(subject?.name);
        const code = this.normalizeSubjectText(subject?.code);

        return type === 'tfg'
            || type.includes('treballfidagrau')
            || type.includes('treballfinaldegrau')
            || name.includes('treballfidagrau')
            || name.includes('treballfinaldegrau')
            || code.includes('tfg');
    }

    filterSubjectsForTimetableGeneration(selectedSubjectsState) {
        const selectedCodes = this.normalizeSelectedSubjectCodes(selectedSubjectsState?.selectedSubjects || []);
        const details = Array.isArray(selectedSubjectsState?.selectedSubjectDetails)
            ? selectedSubjectsState.selectedSubjectDetails
            : [];

        if (selectedCodes.length === 0) {
            return [];
        }

        const thesisCodes = new Set();
        details.forEach((subject) => {
            if (this.isThesisSubject(subject)) {
                thesisCodes.add(this.normalizeSubjectCode(subject?.selectionKey || subject?.code));
            }
        });

        return selectedCodes.filter((subjectCode) => !thesisCodes.has(subjectCode));
    }

    normalizeSelectedSubjectCodes(selectedSubjectCodes = []) {
        const uniqueCodes = [];
        const seen = new Set();

        (Array.isArray(selectedSubjectCodes) ? selectedSubjectCodes : []).forEach((subjectCode) => {
            const normalized = this.normalizeSubjectCode(subjectCode);
            if (!normalized || seen.has(normalized)) {
                return;
            }

            seen.add(normalized);
            uniqueCodes.push(normalized);
        });

        return uniqueCodes;
    }

    resolveSelectedTrimesterForGeneration(selectedSubjectCodes = [], storedTrimester = null) {
        const numericStored = Number(storedTrimester);
        if (Number.isFinite(numericStored) && numericStored > 0) {
            return numericStored;
        }

        const tokenTrimesterSet = new Set();
        (Array.isArray(selectedSubjectCodes) ? selectedSubjectCodes : []).forEach((subjectCode) => {
            const raw = String(subjectCode || '').trim();
            const match = raw.match(/(?:__T|_)([1-9]\d*)$/);
            if (match) {
                tokenTrimesterSet.add(Number(match[1]));
            }
        });

        if (tokenTrimesterSet.size === 1) {
            return Array.from(tokenTrimesterSet)[0];
        }

        return null;
    }

    resolveGenerationContext() {
        const selectedSubjects = this.generationData?.subjects || this.getSelectedSubjectsFromSessionStorage();
        const preferences = this.generationData?.preferences || this.getPreferencesFromSessionStorage();

        return {
            selectedSubjects,
            preferences
        };
    }

    init() {
        this.loadGenerationData();
        this.attachEventListeners();
        this.setupCreateMenu();
        this.attachSelectionWatcher();

        if (window.location.hash === '#autoGenerate') {
            setTimeout(() => {
                this.startGenerationFlow();
            }, 120);
            return;
        }

        const hasSchedules = this.loadSchedulesFromGenerationData();
        if (hasSchedules) {
            this.revealGeneratedResults(window.location.hash === '#resultats');
            this.renderCurrentSchedule();
            this.ensureSubjectNamesLoaded();
            return;
        }

        // If redirected from preferences with the intention to open the summary, do it here
        if (window.location.hash === '#openSummary') {
            // Slight delay to allow DOM and event hooks to settle
            setTimeout(() => {
                this.openGenerationSummaryModal();
            }, 120);
            return;
        }

        if (window.location.hash === '#resultats') {
            this.revealGeneratedResults(true);
            this.showEmptyState('No hi ha cap horari generat. Torna a preferències i genera\'n un.');
        }
    }

    attachSelectionWatcher() {
        const checkAndRestore = () => {
            try {
                const createMenu = document.querySelector('.create-menu-section');
                if (!createMenu) return;

                const currentSelected = this.getSelectedSubjectsFromSessionStorage()?.selectedSubjects || [];
                const generatedSelected = (this.generationData && this.generationData.subjects && this.generationData.subjects.selectedSubjects) || [];

                const a = Array.isArray(currentSelected) ? currentSelected : [];
                const b = Array.isArray(generatedSelected) ? generatedSelected : [];

                const same = JSON.stringify(a) === JSON.stringify(b);

                // If the create menu is hidden but the current selection differs from the generated one,
                // restore the create menu so the user can generate again.
                if (createMenu.classList.contains('is-hidden') && !same) {
                    createMenu.classList.remove('is-hidden');
                }
            } catch (e) {
                // silent
            }
        };

        window.addEventListener('storage', checkAndRestore);
        window.addEventListener('focus', checkAndRestore);

        // small interval fallback in case selection changes happen without focus/storage events
        this._selectionWatcherInterval = setInterval(checkAndRestore, 1500);
    }

    loadGenerationData() {
        const saved = sessionStorage.getItem('generationData');
        if (!saved) {
            return false;
        }

        try {
            this.generationData = JSON.parse(saved);
            this.subjectNameByCode = this.buildSubjectNameMap();
            return true;
        } catch (e) {
            console.error('Error carregant dades de generacio:', e);
            return false;
        }
    }

    setupCreateMenu() {
        const generateBtn = document.getElementById('generateScheduleBtn');
        const summaryModal = document.getElementById('generationSummaryModal');
        const summaryBackdrop = document.getElementById('generationSummaryBackdrop');
        const closeSummaryBtn = document.getElementById('closeGenerationSummary');
        const cancelGenerateBtn = document.getElementById('cancelGenerateBtn');
        const confirmGenerateBtn = document.getElementById('confirmGenerateBtn');

        if (!generateBtn) return;

        generateBtn.addEventListener('click', async () => {
            const context = this.resolveGenerationContext();
            const selected = context.selectedSubjects?.selectedSubjects || [];
            if (!Array.isArray(selected) || selected.length === 0) {
                // Inform the user they must select subjects before generating
                this.showNotification('Has de seleccionar almenys una assignatura abans de generar.', 'warning');
                return;
            }

            await this.startGenerationFlow();
        });

        if (summaryBackdrop) {
            summaryBackdrop.addEventListener('click', () => this.closeGenerationSummaryModal());
        }

        if (closeSummaryBtn) {
            closeSummaryBtn.addEventListener('click', () => this.closeGenerationSummaryModal());
        }

        if (cancelGenerateBtn) {
            cancelGenerateBtn.addEventListener('click', () => this.closeGenerationSummaryModal());
        }

        if (confirmGenerateBtn) {
            confirmGenerateBtn.addEventListener('click', async () => {
                this.closeGenerationSummaryModal();
                await this.startGenerationFlow();
            });
        }

        if (summaryModal) {
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && summaryModal.getAttribute('aria-hidden') === 'false') {
                    this.closeGenerationSummaryModal();
                }
            });
        }
    }

    async startGenerationFlow() {
        this.revealGeneratedResults(true);

        const context = this.resolveGenerationContext();
        if (!context.selectedSubjects?.selectedSubjects?.length) {
            this.showEmptyState('No hi ha assignatures seleccionades.');
            return;
        }

        await this.generateFromBackend();
    }

    openGenerationSummaryModal() {
        const context = this.resolveGenerationContext();
        if (!context.selectedSubjects?.selectedSubjects?.length) {
            this.showNotification('No hi ha assignatures seleccionades.', 'warning');
            return;
        }

        this.renderGenerationSummary(context);

        const summaryModal = document.getElementById('generationSummaryModal');
        if (!summaryModal) {
            this.startGenerationFlow();
            return;
        }

        summaryModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    closeGenerationSummaryModal() {
        const summaryModal = document.getElementById('generationSummaryModal');
        if (!summaryModal) {
            return;
        }

        // Remove confirmation mode if present and restore original summary header and lists
        if (summaryModal.classList.contains('confirm-mode')) {
            summaryModal.classList.remove('confirm-mode');
            const headerTitle = summaryModal.querySelector('.card-header h2');
            if (headerTitle) headerTitle.textContent = 'Resum previa abans de generar:';

            const details = summaryModal.querySelectorAll('#summarySubjectsList, #summaryPreferenceList, #summarySubjectCount');
            details.forEach(el => {
                if (el) el.style.display = '';
            });
        }

        summaryModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    renderGenerationSummary(context) {
        const subjectsInfo = context?.selectedSubjects || this.getDefaultSelectionData();
        const preferences = context?.preferences || this.normalizePreferences();
        const selectedCodes = Array.isArray(subjectsInfo.selectedSubjects) ? subjectsInfo.selectedSubjects : [];
        const subjectDetails = Array.isArray(subjectsInfo.selectedSubjectDetails) ? subjectsInfo.selectedSubjectDetails : [];
        const detailsByCode = new Map(subjectDetails.flatMap(subject => {
            const keys = [];
            if (subject?.code) {
                keys.push([subject.code, subject]);
            }
            if (subject?.selectionKey) {
                keys.push([subject.selectionKey, subject]);
            }
            return keys;
        }));

        const summaryText = document.getElementById('generationSummaryText');
        const subjectCount = document.getElementById('summarySubjectCount');
        const subjectsList = document.getElementById('summarySubjectsList');
        const preferenceList = document.getElementById('summaryPreferenceList');

        const trimesterLabel = this.getTrimesterLabel(subjectsInfo.selectedTrimester);
        const ectsLabel = Number(subjectsInfo.totalEcts) || 0;

        if (summaryText) {
            summaryText.textContent = `La seva selecció per la generació d'horaris és de ${selectedCodes.length} assignatures amb un total de ${ectsLabel} ECTS pel ${trimesterLabel}.`;
        }

        if (subjectCount) {
            subjectCount.textContent = String(selectedCodes.length);
        }

        if (subjectsList) {
            subjectsList.innerHTML = '';
            selectedCodes.forEach(code => {
                const normalizedCode = this.normalizeSubjectCode(code);
                const detail = detailsByCode.get(code) || detailsByCode.get(normalizedCode);
                const label = detail?.name ? `${normalizedCode} - ${detail.name}` : normalizedCode;
                const li = document.createElement('li');
                li.textContent = label;
                subjectsList.appendChild(li);
            });

            if (selectedCodes.length === 0) {
                const li = document.createElement('li');
                li.textContent = 'No hi ha assignatures seleccionades.';
                subjectsList.appendChild(li);
            }
        }

        const preferenceEntries = [
            `Optimització: ${this.getOptimizationLabel(preferences.optimization)}`,
            `Dia lliure preferit: ${this.getFreeDayLabel(preferences.freeDayPreference)}`,
            `Franja horària: ${this.getPreferredTimeLabel(preferences.preferredTime)}`,
            `Situació laboral: ${this.getEmploymentLabel(preferences.isEmployed)}`,
            `Restriccions: ${this.getRestrictionsLabel(preferences)}`
        ];

        if (preferenceList) {
            preferenceList.innerHTML = '';
            preferenceEntries.forEach(entry => {
                const li = document.createElement('li');
                li.textContent = entry;
                preferenceList.appendChild(li);
            });
        }
    }

    getTrimesterLabel(trimester) {
        const labels = {
            1: '1r trimestre',
            2: '2n trimestre',
            3: '3r trimestre'
        };

        return labels[Number(trimester)] || 'sense trimestre definit';
    }

    getOptimizationLabel(value) {
        const labels = {
            'minimize-gaps': 'Minimitzar hores mortes',
            compact: 'Concentrar per tipus de classe',
            'group-by-type': 'Concentrar per tipus de classe',
            'free-day': 'Deixar un dia lliure',
            'compact_days': 'Distribució equilibrada',
            balanced: 'Distribució equilibrada',
            'avoid-early': 'No tenir classe a primera hora',
            'avoid-late': 'No tenir classe a última hora',
            morning: 'Prioritzar horari de matí',
            afternoon: 'Prioritzar horari de tarda'
        };

        return labels[value] || 'Sense preferència';
    }

    getFreeDayLabel(value) {
        const labels = {
            monday: 'Dilluns',
            tuesday: 'Dimarts',
            wednesday: 'Dimecres',
            thursday: 'Dijous',
            friday: 'Divendres'
        };

        return labels[value] || 'Sense preferència';
    }

    getPreferredTimeLabel(value) {
        if (value === 'morning') return 'Matí';
        if (value === 'afternoon') return 'Tarda';
        return 'Sense preferència';
    }

    getEmploymentLabel(value) {
        if (value === true) return 'Estudio i treballo o faig pràctiques';
        if (value === false) return 'Només estudio';
        return 'Sense especificar';
    }

    getRestrictionsLabel(preferences = {}) {
        const restrictions = [];
        if (preferences.noMornings) restrictions.push('Sense matins');
        if (preferences.noEvenings) restrictions.push('Sense vespres');
        if (preferences.noNoon) restrictions.push('Evitar migdia');

        return restrictions.length ? restrictions.join(', ') : 'Cap';
    }

    async generateFromBackend() {
        // Clear previous state to ensure fresh generation
        this.displayVariants = [];
        this.scheduleOptions = [];
        this.currentVariantIndex = 0;
        this.generationData = null;
        window._lastGenerationData = null;

        const generateBtn = document.getElementById('generateScheduleBtn');
        const originalGenerateLabel = generateBtn ? generateBtn.textContent : '';

        // Clear UI to show loading state
        const generatedResults = document.getElementById('generatedResults');
        if (generatedResults) {
            generatedResults.innerHTML = '<p style="padding: 20px; text-align: center;">Generant noves combinacions...</p>';
        }

        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = 'GENERANT...';
        }

        // Read fresh data from sessionStorage
        const selectedSubjectsState = this.getSelectedSubjectsFromSessionStorage() || this.getDefaultSelectionData();
        const rawSelectedSubjectCodes = selectedSubjectsState.selectedSubjects || [];
        const selectedSubjectCodes = this.normalizeSelectedSubjectCodes(rawSelectedSubjectCodes);
        const scheduleSubjectCodes = this.filterSubjectsForTimetableGeneration(selectedSubjectsState);

        if (selectedSubjectCodes.length === 0) {
            this.showNotification('No hi ha assignatures seleccionades', 'error');
            return;
        }

        if (scheduleSubjectCodes.length === 0) {
            this.showNotification('El Treball Fi de Grau no genera horari. Selecciona alguna assignatura amb classes per continuar.', 'warning');
            return;
        }

        this.showNotification('Generant horaris...', 'info');

        // Read fresh preferences from sessionStorage
        const preferencesFromStorage = this.getPreferencesFromSessionStorage();
        const selectedSubjectsStorage = this.getSelectedSubjectsStorage();
        const currentDegree = selectedSubjectsStorage?.currentDegree || '';

        if (!currentDegree) {
            this.showNotification('No hi ha cap grau seleccionat', 'error');
            return;
        }

        console.debug('Cache invalidation: Clearing previous state');
        const selectedSubjectsForDegree = selectedSubjectsStorage?.selectionsByDegree?.[currentDegree] || {};
        const resolvedTrimester = this.resolveSelectedTrimesterForGeneration(
            scheduleSubjectCodes,
            selectedSubjectsForDegree?.selectedTrimester ?? null
        );
        const requestedMaxResults = this.calculateRequestedMaxResults(scheduleSubjectCodes.length);
        console.debug('Sending payload:', {
            degreeKey: currentDegree,
            subjectCodes: scheduleSubjectCodes,
            trimester: resolvedTrimester,
            maxResults: requestedMaxResults,
            preferences: preferencesFromStorage
        });

        try {
            const apiResult = await APIHelper.fetch('http://localhost:8080/api/timetables/generate', {
                method: 'POST',
                timeoutMs: 60000,
                body: JSON.stringify({
                    degreeKey: currentDegree,
                    subjectCodes: scheduleSubjectCodes,
                    trimester: resolvedTrimester,
                    maxResults: requestedMaxResults,
                    preferences: {
                        optimization: preferencesFromStorage.optimization,
                        noMornings: preferencesFromStorage.noMornings,
                        noEvenings: preferencesFromStorage.noEvenings,
                        noNoon: preferencesFromStorage.noNoon,
                        freeDayPreference: preferencesFromStorage.freeDayPreference,
                        preferredTime: preferencesFromStorage.preferredTime,
                        isEmployed: preferencesFromStorage.isEmployed
                    }
                })
            });

            if (!apiResult.ok) {
                throw new Error(apiResult.error || 'No s\'han pogut generar horaris');
            }

            const payload = apiResult.data || {};

            const backendError = typeof payload?.error === 'string' ? payload.error.trim() : '';
            this.backendNotice = backendError || null;

            this.generationData = {
                subjects: selectedSubjectsForDegree,
                preferences: preferencesFromStorage,
                timestamp: new Date().toISOString(),
                timetableResponse: payload
            };
            this.subjectNameByCode = this.buildSubjectNameMap();
            window._lastGenerationData = this.generationData;
            sessionStorage.setItem('generationData', JSON.stringify(this.generationData));

            const hasSchedules = this.loadSchedulesFromGenerationData(payload);
            if (!hasSchedules) {
                const emptyMessage = backendError
                    ? `No s'han trobat combinacions compatibles. ${backendError}`
                    : 'No s\'han trobat combinacions d\'horari compatibles amb les teves preferències.';
                this.showNotification(emptyMessage, 'warning');
                setTimeout(() => {
                    window.location.href = 'calendar-viewer.html#resultats';
                }, 250);
                return;
            }

            this.revealGeneratedResults(true);
            this.renderCurrentSchedule();
            this.ensureSubjectNamesLoaded();

            if (backendError) {
                this.renderBackendNotice(backendError);
            }

            this.showNotification('Horaris generats correctament', 'success');
            // Navigate to the dedicated view page so user can inspect generated results
            try {
                setTimeout(() => {
                    window.location.href = 'calendar-viewer.html#resultats';
                }, 400);
            } catch (e) {
                console.warn('Navigation to view page after generation failed:', e);
            }
        } catch (error) {
            console.error('Error generant horaris:', error);
            this.backendNotice = null;
            this.showEmptyState('Error generant els horaris. Torna-ho a provar des de les preferències o les assignatures seleccionades.');
            this.showNotification(error.message || 'Error generant els horaris', 'error');
        } finally {
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = originalGenerateLabel || 'GENERAR';
            }
        }
    }

    calculateRequestedMaxResults(subjectCount) {
        const safeSubjectCount = Math.max(0, Number(subjectCount) || 0);
        const estimatedCombinations = Math.pow(2, safeSubjectCount);

        return Math.max(6, Math.min(100, estimatedCombinations));
    }

    loadSchedulesFromGenerationData(data = null) {
        const responseData = data || this.generationData?.timetableResponse || {};
        const options = responseData?.options;
        if (!Array.isArray(options) || options.length === 0) {
            this.scheduleOptions = [];
            this.displayVariants = [];
            this.currentVariantIndex = 0;
            return false;
        }

        this.scheduleOptions = this.mapBackendOptionsToSchedules(options);
        this.rebuildDisplayVariants();

        this.currentVariantIndex = 0;
        return this.displayVariants.length > 0;
    }

    mapBackendOptionsToSchedules(options) {
        const defaultTrimester = Number(this.generationData?.subjects?.selectedTrimester ?? null);
        return options.map((option, optionIndex) => {
            const hasSplitWeekSlots = Array.isArray(option?.firstWeekSlots) || Array.isArray(option?.secondWeekSlots);
            const subjectCodes = Array.isArray(option?.selections)
                ? option.selections.map(selection => selection?.subjectCode).filter(Boolean)
                : [];
            const subjectColorByCode = this.buildSubjectColorMap(subjectCodes);

            let oddSlots = [];
            let evenSlots = [];

            if (hasSplitWeekSlots) {
                oddSlots = Array.isArray(option?.firstWeekSlots) ? option.firstWeekSlots : [];
                evenSlots = Array.isArray(option?.secondWeekSlots) ? option.secondWeekSlots : [];
            } else {
                const slots = Array.isArray(option?.slots) ? option.slots : [];
                oddSlots = slots.filter(slot => slot.weekType === null || slot.weekType === 1);
                evenSlots = slots.filter(slot => slot.weekType === null || slot.weekType === 2);
            }

            const termCandidates = [...oddSlots, ...evenSlots]
                .map(slot => slot?.term)
                .filter(term => term !== null && term !== undefined)
                .map(term => String(term).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());

            let inferredTrimester = null;
            if (termCandidates.some(term => /(^|\b)1\s*(r|er)?\s*trim|\btrim(est(re)?)?\s*1\b|^t\s*1\b/.test(term))) {
                inferredTrimester = 1;
            } else if (termCandidates.some(term => /(^|\b)2\s*(n|on)?\s*trim|\btrim(est(re)?)?\s*2\b|^t\s*2\b/.test(term))) {
                inferredTrimester = 2;
            } else if (termCandidates.some(term => /(^|\b)3\s*(r|er)?\s*trim|\btrim(est(re)?)?\s*3\b|^t\s*3\b/.test(term))) {
                inferredTrimester = 3;
            }

            const oddClasses = oddSlots.map(slot => this.slotToClass(this.normalizeBackendSlot(slot), subjectColorByCode));
            const evenClasses = evenSlots.map(slot => this.slotToClass(this.normalizeBackendSlot(slot), subjectColorByCode));
            const oddOverlaps = this.normalizeOverlaps(option?.overlaps, 1);
            const evenOverlaps = this.normalizeOverlaps(option?.overlaps, 2);

            this.markCollidingClasses(oddClasses, oddOverlaps);
            this.markCollidingClasses(evenClasses, evenOverlaps);

            return {
                id: optionIndex + 1,
                selectedTrimester: inferredTrimester ?? (Number.isFinite(defaultTrimester) ? defaultTrimester : null),
                selections: option?.selections || [],
                subjects: Array.isArray(option?.subjects) ? option.subjects : [],
                explanation: typeof option?.explanation === 'string' ? option.explanation : '',
                weeks: [
                    {
                        parity: 'odd',
                        label: 'Setmana 1',
                        metrics: this.calculateMetrics(oddClasses, option?.weeks?.length || 1),
                        classes: oddClasses,
                        overlaps: oddOverlaps,
                        subjectColorByCode
                    },
                    {
                        parity: 'even',
                        label: 'Setmana 2',
                        metrics: this.calculateMetrics(evenClasses, option?.weeks?.length || 1),
                        classes: evenClasses,
                        overlaps: evenOverlaps,
                        subjectColorByCode
                    }
                ],
                preferenceSummary: this.normalizePreferenceSummary(option?.preferenceSummary?.scores
                    ? option.preferenceSummary
                    : this.buildPreferenceSummaryForOption([
                        {
                            classes: oddClasses
                        },
                        {
                            classes: evenClasses
                        }
                    ]))
            };
        });
    }

    buildSubjectColorMap(subjectCodes = []) {
        const colorMap = {};

        subjectCodes.forEach((subjectCode, index) => {
            if (!subjectCode || colorMap[subjectCode]) {
                return;
            }

            colorMap[subjectCode] = this.subjectPalette[index % this.subjectPalette.length];
        });

        return colorMap;
    }

    normalizeBackendSlot(slot) {
        if (!slot || typeof slot !== 'object') {
            return {
                term: null,
                dayOfWeek: 1,
                timeRange: '08:00-09:00',
                weekType: null,
                subjectCode: '',
                groupCode: '',
                type: ''
            };
        }

        return {
            term: slot.term ?? null,
            dayOfWeek: Number(slot.dayOfWeek) || 1,
            timeRange: slot.timeRange || '08:00-09:00',
            weekType: slot.weekType ?? null,
            subjectCode: slot.subjectCode || slot.subject || '',
            groupCode: slot.groupCode || slot.group || '',
            type: slot.type || slot.sessionType || slot.typeName || ''
        };
    }

    normalizeOverlaps(overlaps, targetWeekType) {
        if (!Array.isArray(overlaps)) {
            return [];
        }

        const seen = new Set();
        const normalized = [];

        overlaps.forEach(overlap => {
            if (!overlap || typeof overlap !== 'object') {
                return;
            }

            const weekType = overlap.weekType ?? null;
            if (weekType !== null && weekType !== targetWeekType) {
                return;
            }

            const firstSlot = overlap.firstSlot || null;
            const secondSlot = overlap.secondSlot || null;
            const day = Number(overlap.dayOfWeek || firstSlot?.dayOfWeek || secondSlot?.dayOfWeek);

            if (!Number.isFinite(day) || day < 1 || day > 5) {
                return;
            }

            const pairCodes = [firstSlot?.subjectCode || '-', secondSlot?.subjectCode || '-'].sort().join('|');
            const overlapTimeRange = overlap.overlapTimeRange || this.deriveOverlapTimeRange(firstSlot, secondSlot);
            const dedupeKey = `${targetWeekType}-${day}-${overlapTimeRange || '-'}-${pairCodes}-${overlap.term || '-'}`;

            if (seen.has(dedupeKey)) {
                return;
            }
            seen.add(dedupeKey);

            normalized.push({
                weekType,
                day,
                overlapTimeRange,
                overlapMinutes: Number(overlap.overlapMinutes || 0),
                firstSlot,
                secondSlot,
                text: this.buildOverlapMessage(overlap, day, overlapTimeRange, firstSlot, secondSlot)
            });
        });

        return normalized;
    }

    deriveOverlapTimeRange(firstSlot, secondSlot) {
        if (!firstSlot || !secondSlot) {
            return '';
        }

        const first = this.parseTimeRange(firstSlot.timeRange);
        const second = this.parseTimeRange(secondSlot.timeRange);
        const start = Math.max(first.startMinute, second.startMinute);
        const end = Math.min(first.endMinute, second.endMinute);

        if (end <= start) {
            return '';
        }

        return `${this.formatMinutes(start)}-${this.formatMinutes(end)}`;
    }

    buildOverlapMessage(overlap, day, overlapTimeRange, firstSlot, secondSlot) {
        const dayNames = {
            1: 'dilluns',
            2: 'dimarts',
            3: 'dimecres',
            4: 'dijous',
            5: 'divendres'
        };

        const firstCode = firstSlot?.subjectCode || '-';
        const secondCode = secondSlot?.subjectCode || '-';
        const firstLabel = `${firstCode} ${this.subjectNameByCode[firstCode] || ''}`.trim();
        const secondLabel = `${secondCode} ${this.subjectNameByCode[secondCode] || ''}`.trim();
        const range = overlapTimeRange || overlap?.overlapTimeRange || 'franja no disponible';

        return `Col·lisió el ${dayNames[day] || 'dia desconegut'} de ${range}: ${firstLabel} i ${secondLabel}`;
    }

    markCollidingClasses(classes, overlaps) {
        if (!Array.isArray(classes) || classes.length === 0 || !Array.isArray(overlaps) || overlaps.length === 0) {
            return;
        }

        const collisionSignatures = new Set();

        overlaps.forEach(overlap => {
            [overlap.firstSlot, overlap.secondSlot].forEach(slot => {
                if (slot) {
                    collisionSignatures.add(this.buildSlotSignature(slot));
                }
            });
        });

        classes.forEach(classInfo => {
            classInfo.hasCollision = collisionSignatures.has(classInfo.slotSignature);
        });
    }

    buildSlotSignature(slot) {
        if (!slot) {
            return '';
        }

        return [
            String(slot.dayOfWeek || ''),
            String(slot.timeRange || ''),
            String(slot.subjectCode || ''),
            String(slot.groupCode || ''),
            String(slot.type || '')
        ].join('|');
    }

    slotToClass(slot, subjectColorByCode = null) {
        const timeInfo = this.parseTimeRange(slot.timeRange);
        const normalizedType = this.normalizeClassType(slot.type, slot.groupCode);
        const subjectCode = slot.subjectCode;
        const subjectName = this.subjectNameByCode[subjectCode] || subjectCode;
        const subjectColor = subjectColorByCode?.[subjectCode] || this.subjectColorByCode[subjectCode] || this.getSubjectColor(subjectCode);

        if (subjectCode && subjectColor) {
            this.subjectColorByCode[subjectCode] = subjectColor;
        }

        return {
            term: slot.term ?? null,
            day: slot.dayOfWeek,
            start: Math.floor(timeInfo.startMinute / 60),
            startMinute: timeInfo.startMinute,
            endMinute: timeInfo.endMinute,
            duration: Math.max(1, Math.ceil((timeInfo.endMinute - timeInfo.startMinute) / 60)),
            durationMinutes: Math.max(30, timeInfo.endMinute - timeInfo.startMinute),
            name: subjectName,
            code: subjectCode,
            groupCode: slot.groupCode || '-',
            type: normalizedType,
            room: slot.groupCode || '-',
            timeRange: `${this.formatMinutes(timeInfo.startMinute)} - ${this.formatMinutes(timeInfo.endMinute)}`,
            slotSignature: this.buildSlotSignature(slot),
            color: subjectColor,
            hasCollision: false
        };
    }

    getSubjectColor(subjectCode) {
        if (!subjectCode) {
            return this.subjectPalette[0];
        }

        if (!this.subjectColorByCode[subjectCode]) {
            const subjectCodes = Object.keys(this.subjectColorByCode);
            const nextIndex = subjectCodes.length % this.subjectPalette.length;
            this.subjectColorByCode[subjectCode] = this.subjectPalette[nextIndex];
        }

        return this.subjectColorByCode[subjectCode];
    }

    buildSubjectNameMap() {
        const details = this.generationData?.subjects?.selectedSubjectDetails;
        if (!Array.isArray(details)) {
            return {};
        }

        return details.reduce((acc, subject) => {
            if (!subject?.code || !subject?.name) {
                return acc;
            }

            acc[subject.code] = subject.name;
            return acc;
        }, {});
    }

    async ensureSubjectNamesLoaded() {
        const selectedCodes = Array.isArray(this.generationData?.subjects?.selectedSubjects)
            ? this.generationData.subjects.selectedSubjects
            : [];

        if (selectedCodes.length === 0) {
            return;
        }

        const hasAllNames = selectedCodes.every(code => Boolean(this.subjectNameByCode[code]));
        if (hasAllNames) {
            return;
        }

        const selectedRaw = sessionStorage.getItem('selectedSubjects');
        if (selectedRaw) {
            try {
                const selectedData = JSON.parse(selectedRaw);
                const details = Array.isArray(selectedData?.selectedSubjectDetails)
                    ? selectedData.selectedSubjectDetails
                    : [];

                details.forEach(subject => {
                    if (subject?.code && subject?.name && selectedCodes.includes(subject.code)) {
                        this.subjectNameByCode[subject.code] = subject.name;
                    }
                });
            } catch (error) {
                console.warn('No s\'han pogut recuperar noms d\'assignatura des de selectedSubjects:', error);
            }
        }

        const stillMissingCodes = selectedCodes.filter(code => !this.subjectNameByCode[code]);
        if (stillMissingCodes.length === 0) {
            this.refreshGenerationDataSubjectDetails(selectedCodes);
            this.refreshCurrentScheduleLabels();
            return;
        }

        try {
            await Promise.all(stillMissingCodes.map(async code => {
                const response = await fetch(`http://localhost:8080/api/subjects/${encodeURIComponent(code)}`, {
                    method: 'GET',
                    headers: this.getAuthHeaders()
                });

                if (!response.ok) return;

                const rawName = (await response.text()).trim();
                if (rawName) {
                    this.subjectNameByCode[code] = rawName.replace(/^"|"$/g, '');
                }
            }));
        } catch (error) {
            console.warn('No s\'han pogut carregar noms d\'assignatura des del backend:', error);
        }

        this.refreshGenerationDataSubjectDetails(selectedCodes);
        this.refreshCurrentScheduleLabels();
    }

    refreshGenerationDataSubjectDetails(selectedCodes) {
        if (!this.generationData?.subjects || !Array.isArray(selectedCodes)) {
            return;
        }

        this.generationData.subjects.selectedSubjectDetails = selectedCodes.map(code => ({
            code,
            name: this.subjectNameByCode[code] || code
        }));
        sessionStorage.setItem('generationData', JSON.stringify(this.generationData));
    }

    refreshCurrentScheduleLabels() {
        if (this.displayVariants.length === 0) {
            return;
        }

        const variant = this.getCurrentVariant();
        if (!variant) {
            return;
        }

        const option = this.scheduleOptions[variant.optionIndex];
        if (!option?.weeks?.[variant.weekIndex]?.classes) {
            return;
        }

        option.weeks[variant.weekIndex].classes = option.weeks[variant.weekIndex].classes.map(classInfo => ({
            ...classInfo,
            name: this.subjectNameByCode[classInfo.code] || classInfo.code
        }));

        this.renderCurrentSchedule();
    }

    normalizeClassType(type, groupCode) {
        // Primary: groupCode pattern is reliable even when type field has encoding issues.
        // Theory groups: G1, G2, G3 (1–2 digits after G)
        // Practice groups: G101, G102, G201 (3+ digits after G)
        if (groupCode && /^G\d{3,}$/i.test(String(groupCode).trim())) {
            return 'lab';
        }

        // Fallback: use type field stripping diacritics
        if (type) {
            const normalized = String(type)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
            if (normalized.includes('practic')) return 'lab';
            if (normalized.includes('semin')) return 'seminar';
        }

        return 'theory';
    }

    parseTimeRange(timeRange) {
        const fallback = { startMinute: 8 * 60, endMinute: 9 * 60 };
        if (!timeRange || typeof timeRange !== 'string') {
            return fallback;
        }

        const parts = timeRange.split('-').map(part => part.trim());
        if (parts.length !== 2) {
            return fallback;
        }

        const startMinute = this.parseTimeToMinutes(parts[0]);
        const endMinute = this.parseTimeToMinutes(parts[1]);

        if (startMinute === null || endMinute === null || endMinute <= startMinute) {
            return fallback;
        }

        return { startMinute, endMinute };
    }

    parseTimeToMinutes(value) {
        const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        return hours * 60 + minutes;
    }

    calculateMetrics(classes, numWeeks) {
        if (!Array.isArray(classes) || classes.length === 0) {
            return {
                hoursPerWeek: '0h',
                daysPerWeek: 0,
                firstClass: '--:--'
            };
        }

        const weeks = (numWeeks && numWeeks > 0) ? numWeeks : 1;

        // Union of intervals per day to avoid double-counting overlapping classes.
        let totalMinutes = 0;
        for (let day = 1; day <= 5; day++) {
            const dayClasses = classes
                .filter(c => c.day === day)
                .sort((a, b) => a.startMinute - b.startMinute);

            const merged = [];
            for (const c of dayClasses) {
                const start = c.startMinute;
                const end = c.endMinute;
                if (merged.length === 0 || start >= merged[merged.length - 1][1]) {
                    merged.push([start, end]);
                } else {
                    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
                }
            }
            totalMinutes += merged.reduce((sum, [s, e]) => sum + (e - s), 0);
        }

        const distinctDays = new Set(classes.map(classInfo => classInfo.day)).size;
        let firstClassMinute = null;
        for (let day = 1; day <= 5 && firstClassMinute == null; day++) {
            const dayClasses = classes
                .filter(classInfo => classInfo.day === day)
                .sort((left, right) => left.startMinute - right.startMinute);
            if (dayClasses.length > 0) {
                firstClassMinute = dayClasses[0].startMinute;
            }
        }

        const weeklyMinutes = Math.round(totalMinutes / weeks);
        const weeklyDays = Math.round(distinctDays / weeks);

        return {
            hoursPerWeek: this.formatDuration(weeklyMinutes),
            daysPerWeek: Math.max(1, weeklyDays),
            firstClass: firstClassMinute != null ? this.formatMinutes(firstClassMinute) : '--:--'
        };
    }

    calculateDeadMinutesBetween(previousEndMinute, currentStartMinute) {
        const rawGap = Math.max(0, currentStartMinute - previousEndMinute);

        // Campus timetable pattern: classes are 1h45 with a 15-min transition.
        // Example: 08:15-10:00 and 12:15-14:00 => raw gap 135, dead time 105 (1:45).
        if (rawGap <= 15) {
            return 0;
        }

        const normalizedGap = rawGap - 15;
        if (normalizedGap % 120 === 0) {
            return (normalizedGap / 120) * 105;
        }

        // Fallback for non-standard ranges: only discount one transition break.
        return Math.max(0, rawGap - 15);
    }

    formatDuration(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}min`;
    }

    formatGapDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) {
            return `${hours}h`;
        }

        return `${hours}:${String(remainingMinutes).padStart(2, '0')}h`;
    }

    formatMinutes(totalMinutes) {
        const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const minutes = String(totalMinutes % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    attachEventListeners() {
        const prevBtn = document.getElementById('prevSchedule');
        const nextBtn = document.getElementById('nextSchedule');
        const modifySubjectsBtn = document.getElementById('modifySubjectsBtn');
        const modifyBtn = document.getElementById('modifyBtn');
        const exportBtn = document.getElementById('exportBtn');
        const exportMenu = document.getElementById('exportMenu');
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        const exportIcsBtn = document.getElementById('exportIcsBtn');
        const saveBtn = document.getElementById('saveScheduleBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.navigateSchedule(-1));
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.navigateSchedule(1));
        }

        if (modifySubjectsBtn) {
            modifySubjectsBtn.addEventListener('click', () => {
                window.location.href = 'subjects-selector.html';
            });
        }

        if (modifyBtn) {
            modifyBtn.addEventListener('click', () => {
                window.location.href = 'preferences-selector.html';
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleExportMenu();
            });
        }

        // Pin navigation arrows and center label between them.
        const pinNav = () => {
            if (document.body.classList.contains('view-generated-page')) {
                return;
            }

            const nav = document.querySelector('.schedule-navigation');
            const label = document.getElementById('weekVariantLabel');
            if (!nav) return;

            const rect = nav.getBoundingClientRect();
            const gap = 12; // space between arrows and label
            const btnWidth = 140;
            const mobileBtnWidth = 100;
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            const usedBtnWidth = isMobile ? mobileBtnWidth : btnWidth;

            if (prevBtn) {
                prevBtn.style.position = 'fixed';
                prevBtn.style.left = '18px';
                const top = Math.round(rect.top + rect.height / 2 - (usedBtnWidth / 2));
                prevBtn.style.top = `${top}px`;
                prevBtn.style.width = `${usedBtnWidth}px`;
                prevBtn.style.height = `${usedBtnWidth}px`;
            }

            if (nextBtn) {
                nextBtn.style.position = 'fixed';
                nextBtn.style.right = '18px';
                const top = Math.round(rect.top + rect.height / 2 - (usedBtnWidth / 2));
                nextBtn.style.top = `${top}px`;
                nextBtn.style.width = `${usedBtnWidth}px`;
                nextBtn.style.height = `${usedBtnWidth}px`;
            }

            if (label) {
                // Compute available area between the two buttons
                const leftEdge = (prevBtn ? prevBtn.getBoundingClientRect().right : 18) + gap;
                const rightEdge = (nextBtn ? nextBtn.getBoundingClientRect().left : window.innerWidth - 18) - gap;
                const avail = Math.max(80, rightEdge - leftEdge);
                label.style.position = 'fixed';
                label.style.left = `${leftEdge}px`;
                label.style.top = `${Math.round(rect.top + rect.height / 2 - 12)}px`;
                label.style.width = `${avail}px`;
                label.style.whiteSpace = 'nowrap';
                label.style.overflow = 'hidden';
                label.style.textOverflow = 'ellipsis';
                label.style.textAlign = 'center';
            }
        };

        // Initial pin and on resize/scroll
        window.addEventListener('resize', pinNav);
        window.addEventListener('scroll', pinNav);
        // call once to set positions
        setTimeout(pinNav, 50);

        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => this.exportCurrentScheduleAsPdf());
        }

        if (exportIcsBtn) {
            exportIcsBtn.addEventListener('click', () => this.exportCurrentScheduleAsIcs());
        }

        document.addEventListener('click', (event) => {
            if (!exportMenu || !exportBtn) {
                return;
            }

            if (!exportMenu.contains(event.target) && event.target !== exportBtn) {
                this.closeExportMenu();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeExportMenu();
            }
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSchedule());
        }

        // Modal close handlers
        const closeBtn = document.getElementById('closeDetail');
        const modal = document.getElementById('optionDetailModal');
        const backdrop = document.getElementById('detailBackdrop');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) modal.setAttribute('aria-hidden', 'true');
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', () => {
                if (modal) modal.setAttribute('aria-hidden', 'true');
            });
        }

        if (modal) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
                    modal.setAttribute('aria-hidden', 'true');
                }
            });
        }
    }

    revealGeneratedResults(scrollIntoView = false) {
        const generatedResults = document.getElementById('generatedResults');
        if (!generatedResults) return;

        // Reveal results container (single-column layout)
        generatedResults.classList.remove('is-hidden');

        // Ensure any two-column classes are cleared
        generatedResults.classList.remove('generation-two-columns');

        // Restore explanation panel to modal behavior if present
        const explanation = document.getElementById('explanationColumn');
        if (explanation) {
            explanation.classList.remove('explanation-panel-inline');
            explanation.setAttribute('aria-hidden', 'true');
            const backdrop = explanation.querySelector('.explanation-panel-backdrop');
            if (backdrop) backdrop.style.display = '';
        }

        // Hide the initial "Com crear el teu horari?" create menu once results are visible
        const createMenu = document.querySelector('.create-menu-section');
        if (createMenu) createMenu.classList.add('is-hidden');

        if (scrollIntoView) {
            generatedResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    navigateSchedule(direction) {
        const totalVariants = this.displayVariants.length;
        if (totalVariants === 0) return;

        const newIndex = this.currentVariantIndex + direction;
        if (newIndex >= 0 && newIndex < totalVariants) {
            this.currentVariantIndex = newIndex;
            this.renderCurrentSchedule();
        }
    }

    getCurrentVariant() {
        return this.displayVariants[this.currentVariantIndex] || null;
    }

    getCurrentWeek() {
        const variant = this.getCurrentVariant();
        if (!variant) return null;

        const option = this.scheduleOptions[variant.optionIndex];
        return option?.weeks?.[variant.weekIndex] || null;
    }

    getCurrentOption() {
        const variant = this.getCurrentVariant();
        if (!variant) return null;

        return this.scheduleOptions[variant.optionIndex] || null;
    }

    renderCurrentSchedule() {
        const currentWeek = this.getCurrentWeek();

        if (!currentWeek) {
            this.showEmptyState('No hi ha horaris generats per mostrar.');
            return;
        }

        this.updateScheduleIndicator();
        this.renderBackendNotice(this.backendNotice);
        this.renderOverlapAlerts(currentWeek.overlaps || []);
        this.updateMetrics(currentWeek.metrics);
        this.renderScheduleGrid(currentWeek.classes);
        this.renderOptionExplanation();
        this.updateNavigationButtons();
    }

    renderOptionExplanation() {
        // Fallback method - not used in new layout but kept for compatibility
        this.renderOptionsPanel();
    }

    renderOptionsPanel() {
        const summaryEl = document.getElementById('summaryMessage');
        const optionsListEl = document.getElementById('optionsList');

        if (!summaryEl || !optionsListEl) return;

        const responseTotal = Number(this.generationData?.timetableResponse?.totalOptions);
        const totalValidOptions = Number.isFinite(responseTotal) && responseTotal > 0
            ? responseTotal
            : this.scheduleOptions.length;

        // Update summary message
        summaryEl.textContent = `S'han trobat ${totalValidOptions} combinació${totalValidOptions !== 1 ? 's' : ''} vàlida${totalValidOptions !== 1 ? 's' : ''}.`;

        this.renderPreferenceSortToolbar(totalValidOptions);

        const sortTarget = this.getPrimarySortTarget();

        // Render options cards
        optionsListEl.innerHTML = '';
        const currentVariant = this.getCurrentVariant();
        const currentOptionIndex = currentVariant?.optionIndex ?? 0;
        const optionLabels = this.buildOptionLabelsByPriority(sortTarget?.key);

        this.scheduleOptions.forEach((option, index) => {
            const isActive = index === currentOptionIndex;
            const optionCard = this.createOptionCard(option, index, isActive, optionLabels.get(index));
            optionsListEl.appendChild(optionCard);
        });

        // Setup event listeners for toggle buttons
        this.setupOptionCardListeners();
    }

    createOptionCard(option, optionIndex, isActive, assignedLabel = '') {
        const card = document.createElement('div');
        card.className = `option-card${isActive ? ' active' : ''}`;
        card.dataset.optionIndex = optionIndex;

        const optionLabel = this.getOptionCardLabel(option, optionIndex, assignedLabel);

        // Build option title: show numbered proposal as title and preference label as description
        const proposalTitle = `Proposta ${optionIndex + 1}`;
        const titleDiv = document.createElement('div');
        titleDiv.className = 'option-title';
        titleDiv.innerHTML = `
            <h3>${this.escapeHtml(proposalTitle)}</h3>
            <p class="option-description">${this.escapeHtml(optionLabel)}</p>
        `;
        card.appendChild(titleDiv);

        // Build buttons container
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'option-buttons';

        // Button: "Obrir horari"
        const openBtn = document.createElement('button');
        openBtn.className = 'option-btn option-btn-primary';
        openBtn.textContent = 'Obrir horari';
        openBtn.setAttribute('aria-label', `Obrir horari de l'opció ${optionIndex + 1}`);
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showOption(optionIndex);
        });
        buttonsDiv.appendChild(openBtn);

        // Button: "Veure detall"
        const detailBtn = document.createElement('button');
        detailBtn.className = 'option-btn option-btn-secondary';
        detailBtn.textContent = 'Veure detall';
        detailBtn.setAttribute('aria-label', `Mostrar detalls de l'opció ${optionIndex + 1}`);
        detailBtn.setAttribute('aria-expanded', 'false');
        detailBtn.dataset.detailBtn = optionIndex;
        detailBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showOptionDetail(optionIndex);
        });
        buttonsDiv.appendChild(detailBtn);

        card.appendChild(buttonsDiv);

        // Note: detailed view now opens in a compact modal (no inline expanded technical warnings)

        return card;
    }

    showOptionDetail(optionIndex) {
        const option = this.scheduleOptions[optionIndex];
        if (!option) return;

        // Prefer current week metrics if available
        const metrics = (Array.isArray(option.weeks) && option.weeks[0] && option.weeks[0].metrics) ? option.weeks[0].metrics : (option.weeks?.[0]?.metrics || {
            hoursPerWeek: '0h',
            daysPerWeek: 0,
            firstClass: '--:--'
        });

        const kpiContainer = document.getElementById('detailKPIs');
        const groupsContainer = document.getElementById('detailGroups');
        const modal = document.getElementById('optionDetailModal');
        const titleEl = document.getElementById('optionDetailTitle');
        if (!kpiContainer || !groupsContainer || !modal) return;

        if (titleEl) {
            titleEl.textContent = `Detall de la Proposta ${optionIndex + 1}`;
        }

        kpiContainer.innerHTML = this.buildKpiHtml(metrics);
        groupsContainer.innerHTML = this.buildGroupsTable(option);

        modal.setAttribute('aria-hidden', 'false');
        // focus for accessibility
        const closeBtn = document.getElementById('closeDetail');
        if (closeBtn) closeBtn.focus();
    }

    buildKpiHtml(metrics) {
        const m = metrics || {};
        const hoursPerWeek = m.horesPerSetmana ?? m.hoursPerWeek ?? '0h';
        const daysPerWeek = m.diesPerSetmana ?? m.daysPerWeek ?? 0;
        const firstClass = m.primeraClasse ?? m.firstClass ?? '--:--';
        return `
            <div class="kpi-card">
                <span class="kpi-label">Hores/setmana</span>
                <span class="kpi-value">${this.escapeHtml(hoursPerWeek)}</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Dies/setmana</span>
                <span class="kpi-value">${this.escapeHtml(String(daysPerWeek))}</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Primera classe</span>
                <span class="kpi-value">${this.escapeHtml(firstClass)}</span>
            </div>
        `;
    }

    buildGroupsTable(option) {
        const subjects = Array.isArray(option?.subjects) ? option.subjects : [];
        if (subjects.length === 0) {
            return '<p class="muted">Sense informació de grups assignats.</p>';
        }

        let html = '<table class="groups-table"><thead><tr><th>Assignatura</th><th>Tipus</th><th>Grup assignat</th></tr></thead><tbody>';

        subjects.forEach(subject => {
            const subjectCode = subject?.subjectCode || '-';
            const subjectName = this.subjectNameByCode[subjectCode] || subjectCode;
            const groups = Array.isArray(subject?.groups) ? subject.groups : [];
            const subjectColor = this.getSubjectColor(subjectCode);
            // Convert hex to rgba for better browser compatibility
            const r = parseInt(subjectColor.slice(1, 3), 16);
            const g = parseInt(subjectColor.slice(3, 5), 16);
            const b = parseInt(subjectColor.slice(5, 7), 16);
            const bgColor = `rgba(${r}, ${g}, ${b}, 0.125)`;
            const borderColor = subjectColor;

            if (groups.length === 0) {
                html += `<tr style="background-color: ${bgColor}; border-left: 4px solid ${borderColor};"><td>${this.escapeHtml(subjectCode)} ${this.escapeHtml(subjectName)}</td><td>-</td><td>-</td></tr>`;
            } else {
                groups.forEach(gr => {
                    const type = (gr?.typeName || gr?.type || '').toLowerCase().includes('practic') || String(gr?.groupCode || '').match(/^G\d{3,}$/i)
                        ? 'Pràctiques' : 'Teoria';
                    const groupCode = gr?.groupCode || (gr?.group || '-');
                    html += `<tr style="background-color: ${bgColor}; border-left: 4px solid ${borderColor};"><td>${this.escapeHtml(subjectCode)} ${this.escapeHtml(subjectName)}</td><td>${this.escapeHtml(type)}</td><td>${this.escapeHtml(groupCode)}</td></tr>`;
                });
            }
        });

        html += '</tbody></table>';
        return html;
    }

    createDetailTable(option) {
        const subjects = Array.isArray(option?.subjects) ? option.subjects : [];
        if (subjects.length === 0) {
            return '<p class="muted">Sense informació de detall disponible.</p>';
        }

        let tableHtml = '<table class="detail-table"><thead><tr>';
        tableHtml += '<th>Assignatura</th>';
        tableHtml += '<th>Crèdits</th>';
        tableHtml += '<th>Requerit</th>';
        tableHtml += '<th>Programat</th>';
        tableHtml += '<th>Estat</th>';
        tableHtml += '</tr></thead><tbody>';

        subjects.forEach(subject => {
            const groups = Array.isArray(subject?.groups) ? subject.groups : [];
            const subjectCode = subject?.subjectCode || '-';
            const subjectName = this.subjectNameByCode[subjectCode] || subjectCode;

            groups.forEach(group => {
                const typeName = group?.typeName || 'General';
                const credits = group?.credits || '-';
                const requiredHours = group?.requiredHours || '-';
                const scheduledHours = group?.scheduledHours || '-';
                const status = group?.status || 'unknown';
                const statusBadge = status === 'complete' ? '<span class="badge success">Complet</span>' :
                    status === 'incomplete' ? '<span class="badge warn">Incomplet</span>' :
                        '<span class="badge info">Pending</span>';

                tableHtml += `<tr>`;
                tableHtml += `<td>${subjectCode} (${typeName})</td>`;
                tableHtml += `<td>${credits}</td>`;
                tableHtml += `<td>${requiredHours}</td>`;
                tableHtml += `<td>${scheduledHours}</td>`;
                tableHtml += `<td>${statusBadge}</td>`;
                tableHtml += `</tr>`;
            });
        });

        tableHtml += '</tbody></table>';
        return tableHtml;
    }

    showOption(optionIndex) {
        if (optionIndex < 0 || optionIndex >= this.scheduleOptions.length) {
            return;
        }

        // Find the corresponding variant for this option (first week of the option)
        const variantIndex = this.displayVariants.findIndex(v => v.optionIndex === optionIndex && v.weekIndex === 0);
        if (variantIndex >= 0) {
            this.currentVariantIndex = variantIndex;
            this.renderCurrentSchedule();
            this.updateActiveOptionCard(optionIndex);
        }
    }

    toggleOptionDetail(optionIndex, buttonEl) {
        // Legacy API kept for compatibility: forward to modal-based detail
        this.showOptionDetail(optionIndex);
        if (buttonEl && typeof buttonEl.setAttribute === 'function') {
            buttonEl.setAttribute('aria-expanded', 'true');
        }
    }

    updateActiveOptionCard(optionIndex) {
        // Update active state on all cards
        document.querySelectorAll('.option-card').forEach((card, idx) => {
            if (idx === optionIndex) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
                // Hide detail when not active
                const detailContainer = card.querySelector('.detail-container');
                if (detailContainer) {
                    detailContainer.style.display = 'none';
                    const detailBtn = card.querySelector('[aria-expanded]');
                    if (detailBtn) {
                        detailBtn.setAttribute('aria-expanded', 'false');
                    }
                }
            }
        });
    }

    setupOptionCardListeners() {
        // Setup open/close modal handlers for options panel
        const openBtn = document.getElementById('openOptionsPanel');
        const closeBtn = document.getElementById('closeOptionsPanel');
        const backdrop = document.getElementById('explanationBackdrop');
        const modal = document.getElementById('explanationColumn');

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                if (modal) modal.setAttribute('aria-hidden', 'false');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) modal.setAttribute('aria-hidden', 'true');
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', () => {
                if (modal) modal.setAttribute('aria-hidden', 'true');
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') {
                modal.setAttribute('aria-hidden', 'true');
            }
        });

    }


    renderPreferenceSortToolbar(totalValidOptions) {
        const summaryEl = document.getElementById('summaryMessage');
        const optionsListEl = document.getElementById('optionsList');
        if (!summaryEl || !optionsListEl) return;

        const existingToolbar = document.getElementById('optionsSortToolbar');
        if (existingToolbar) {
            existingToolbar.remove();
        }

        if (totalValidOptions < 4) {
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.id = 'optionsSortToolbar';
        toolbar.className = 'options-panel-toolbar';

        const sortTarget = this.getPrimarySortTarget();
        const hint = document.createElement('span');
        hint.className = 'options-panel-hint';
        hint.textContent = sortTarget?.label
            ? `Ordre suggerit: ${sortTarget.label}`
            : 'Ordena segons la preferència principal desada';

        const sortButton = document.createElement('button');
        sortButton.type = 'button';
        sortButton.className = 'options-sort-btn';
        sortButton.textContent = 'Ordenar per la meva preferència';
        sortButton.title = sortTarget?.label
            ? `Ordena les alternatives segons ${sortTarget.label}`
            : 'Ordena les alternatives segons la preferència configurada';
        sortButton.addEventListener('click', () => {
            this.sortOptionsByPreference();
        });

        toolbar.appendChild(hint);
        toolbar.appendChild(sortButton);
        summaryEl.insertAdjacentElement('afterend', toolbar);
    }

    rebuildDisplayVariants() {
        this.displayVariants = this.scheduleOptions.flatMap((option, optionIndex) => {
            return option.weeks.map((week, weekIndex) => ({
                optionIndex,
                weekIndex,
                label: `${week.label}`
            }));
        });
    }

    sortOptionsByPreference() {
        if (!Array.isArray(this.scheduleOptions) || this.scheduleOptions.length < 2) {
            return;
        }

        const sortTarget = this.getPrimarySortTarget();
        const sortKey = sortTarget?.key || 'minimize_gaps';
        const currentOption = this.getCurrentOption();
        const decorated = this.scheduleOptions.map((option, index) => ({
            option,
            index,
            metrics: this.getOptionOrderingMetrics(option, sortKey)
        }));

        decorated.sort((left, right) => {
            if (right.metrics.preferenceScore !== left.metrics.preferenceScore) {
                return right.metrics.preferenceScore - left.metrics.preferenceScore;
            }

            if (left.metrics.conflictCount !== right.metrics.conflictCount) {
                return left.metrics.conflictCount - right.metrics.conflictCount;
            }

            if (left.metrics.overlapMinutes !== right.metrics.overlapMinutes) {
                return left.metrics.overlapMinutes - right.metrics.overlapMinutes;
            }

            if (left.metrics.tieKey !== right.metrics.tieKey) {
                return left.metrics.tieKey.localeCompare(right.metrics.tieKey, 'ca');
            }

            return left.index - right.index;
        });

        this.scheduleOptions = decorated.map(entry => entry.option);
        this.rebuildDisplayVariants();

        const newIndex = currentOption ? this.scheduleOptions.indexOf(currentOption) : 0;
        const targetIndex = newIndex >= 0 ? newIndex : 0;
        const firstVariantIndex = this.displayVariants.findIndex(variant => variant.optionIndex === targetIndex && variant.weekIndex === 0);
        this.currentVariantIndex = firstVariantIndex >= 0 ? firstVariantIndex : 0;
        this.renderCurrentSchedule();
    }

    getOptionOrderingMetrics(option, sortKey) {
        const overlaps = Array.isArray(option?.overlaps) ? option.overlaps : [];
        const conflictCount = overlaps.length;
        const overlapMinutes = overlaps.reduce((total, overlap) => total + (Number(overlap?.overlapMinutes) || 0), 0);
        const preferenceScore = this.getPreferenceScore(option?.preferenceSummary, sortKey);
        const tieKey = Array.isArray(option?.selections)
            ? option.selections.map(selection => {
                const subjectCode = String(selection?.subjectCode || '').trim();
                const groups = Array.isArray(selection?.groups)
                    ? selection.groups.map(group => String(group?.groupCode || '').trim()).filter(Boolean).join('|')
                    : '';

                return `${subjectCode}:${groups}`;
            }).join('||')
            : '';

        return {
            conflictCount,
            overlapMinutes,
            preferenceScore,
            tieKey
        };
    }

    getPrimarySortTarget() {
        const preferences = this.getPreferencesFromSessionStorage();
        const freeDayKey = this.resolveFreeDayScoreKey(preferences.freeDayPreference);

        if (preferences.optimization === 'free-day' && freeDayKey) {
            return {
                key: freeDayKey,
                label: this.getFreeDayLabel(preferences.freeDayPreference) || this.formatScoreLabel(freeDayKey, preferences.freeDayPreference)
            };
        }

        if (preferences.optimization === 'avoid-early') {
            return { key: 'avoid-early', label: this.getOptimizationLabel('avoid-early') };
        }

        if (preferences.optimization === 'avoid-late') {
            return { key: 'avoid-late', label: this.getOptimizationLabel('avoid-late') };
        }

        if (preferences.optimization === 'group-by-type') {
            return { key: 'group-by-type', label: this.getOptimizationLabel('group-by-type') };
        }

        if (preferences.optimization === 'balanced') {
            return { key: 'compact_days', label: this.getOptimizationLabel('balanced') };
        }

        if (preferences.optimization === 'minimize_weekly_hours') {
            return { key: 'minimize_weekly_hours', label: this.getOptimizationLabel('minimize_weekly_hours') };
        }

        return { key: 'minimize_gaps', label: this.getOptimizationLabel('minimize-gaps') };
    }

    getOptionCardLabel(option, optionIndex, assignedLabel = '') {
        if (assignedLabel) {
            return assignedLabel;
        }

        const summary = this.normalizePreferenceSummary(option?.preferenceSummary);
        const ranked = Object.entries(summary.scores || {})
            .filter(([, value]) => Number(value) > 0)
            .sort((left, right) => {
                const leftIsGap = left[0] === 'minimize-gaps' || left[0] === 'minimize_gaps';
                const rightIsGap = right[0] === 'minimize-gaps' || right[0] === 'minimize_gaps';

                if (leftIsGap !== rightIsGap) {
                    return leftIsGap ? 1 : -1;
                }

                return Number(right[1]) - Number(left[1]);
            });

        const topKey = ranked[0]?.[0] || '';
        if (typeof topKey === 'string' && topKey.startsWith('free_day_')) {
            const dayIndex = Number(topKey.split('_').pop());
            const dayNames = {
                1: 'Dilluns',
                2: 'Dimarts',
                3: 'Dimecres',
                4: 'Dijous',
                5: 'Divendres'
            };

            return `${dayNames[dayIndex] || 'Dia'} lliure`;
        }

        const labels = {
            'minimize-gaps': 'Minimitzar hores mortes',
            minimize_weekly_hours: 'Minimitzar hores mortes',
            'free-day': 'Deixar un dia lliure',
            'compact_days': 'Distribució equilibrada',
            balanced: 'Distribució equilibrada',
            'avoid-early': 'No tenir classe a primera hora',
            'avoid-late': 'No tenir classe a última hora',
            'group-by-type': 'Concentrar per tipus de classe'
        };

        return labels[topKey] || `Proposta ${optionIndex + 1}`;
    }

    buildOptionLabelsByPriority(selectedSortKey = null) {
        const priorities = [
            { label: 'Concentrar per tipus de classe', keys: ['group-by-type', 'group_by_type'] },
            { label: 'No tenir classe a primera hora', keys: ['avoid-early', 'avoid_early'] },
            { label: 'No tenir classe a última hora', keys: ['avoid-late', 'avoid_late'] },
            {
                label: 'Deixar un dia lliure',
                keys: ['free-day', 'free_day', 'free_day_1', 'free_day_2', 'free_day_3', 'free_day_4', 'free_day_5']
            },
            { label: 'Distribució equilibrada', keys: ['compact_days', 'balanced', 'balanced_days'] },
            { label: 'Minimitzar hores mortes', keys: ['minimize-gaps', 'minimize_gaps', 'minimize_weekly_hours'] }
        ];

        const selectedPriorityIndex = selectedSortKey
            ? priorities.findIndex(priority => priority.keys.includes(selectedSortKey) || (selectedSortKey.startsWith('free_day_') && priority.keys.some(key => key.startsWith('free_day_'))))
            : -1;

        if (selectedPriorityIndex > 0) {
            const [selectedPriority] = priorities.splice(selectedPriorityIndex, 1);
            priorities.unshift(selectedPriority);
        }

        const summaries = this.scheduleOptions.map(option => this.normalizePreferenceSummary(option?.preferenceSummary));
        const labelsByIndex = new Map();
        const remaining = new Set(summaries.map((_, index) => index));

        priorities.forEach((priority) => {
            if (remaining.size === 0) return;

            let bestIndex = -1;
            let bestScore = 0;

            remaining.forEach((index) => {
                const score = priority.keys.reduce((maxScore, key) => {
                    const value = Number(summaries[index]?.scores?.[key]);
                    return Number.isFinite(value) ? Math.max(maxScore, value) : maxScore;
                }, 0);

                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = index;
                }
            });

            if (bestIndex >= 0 && bestScore > 0) {
                labelsByIndex.set(bestIndex, priority.label);
                remaining.delete(bestIndex);
            }
        });

        remaining.forEach((index) => {
            labelsByIndex.set(index, 'Minimitzar hores mortes');
        });

        // Ensure no two cards render with the exact same visible label.
        const seen = {};
        this.scheduleOptions.forEach((_, index) => {
            const baseLabel = labelsByIndex.get(index) || `Proposta ${index + 1}`;
            seen[baseLabel] = (seen[baseLabel] || 0) + 1;
            const count = seen[baseLabel];
            labelsByIndex.set(index, count > 1 ? `${baseLabel} (${count})` : baseLabel);
        });

        return labelsByIndex;
    }

    getPreferenceScore(preferenceSummary, scoreKey) {
        const summary = this.normalizePreferenceSummary(preferenceSummary);
        const aliases = {
            'avoid-early': ['avoid-early', 'avoid_early'],
            avoid_early: ['avoid_early', 'avoid-early'],
            'avoid-late': ['avoid-late', 'avoid_late'],
            avoid_late: ['avoid_late', 'avoid-late'],
            'group-by-type': ['group-by-type', 'group_by_type'],
            group_by_type: ['group_by_type', 'group-by-type'],
            'free-day': ['free-day', 'free_day'],
            free_day: ['free_day', 'free-day'],
            'minimize-gaps': ['minimize-gaps', 'minimize_gaps'],
            minimize_gaps: ['minimize_gaps', 'minimize-gaps'],
            compact_days: ['compact_days', 'balanced', 'balanced_days'],
            balanced: ['balanced', 'compact_days', 'balanced_days']
        };

        const candidateKeys = Array.isArray(aliases[scoreKey])
            ? aliases[scoreKey]
            : typeof scoreKey === 'string' && /^free_day_\d+$/.test(scoreKey)
                ? [scoreKey, 'free_day']
                : [scoreKey];
        for (const key of candidateKeys) {
            const score = Number(summary.scores?.[key]);
            if (Number.isFinite(score)) {
                return score;
            }
        }

        return 0;
    }

    buildRecommendationBadges(preferenceSummary) {
        const summary = this.normalizePreferenceSummary(preferenceSummary);
        const rankedKeys = Object.entries(summary.scores || {})
            .filter(([, value]) => Number(value) > 0.8)
            .sort((left, right) => Number(right[1]) - Number(left[1]))
            .slice(0, 2)
            .map(([key]) => key);

        const rawLabels = Array.isArray(summary.recommendedFor) ? summary.recommendedFor : [];

        const badges = [];
        for (let i = 0; i < rawLabels.length; i++) {
            const raw = String(rawLabels[i] || '').trim();
            if (!raw) continue;

            // Detect free-day keys embedded in the label
            const freeKey = this.resolveFreeDayScoreKey(raw);
            if (freeKey) {
                const dayIndex = Number(freeKey.split('_').pop());
                // Skip weekend days
                if (dayIndex === 6 || dayIndex === 7) continue;
            }

            const key = rankedKeys[i] || '';

            // Format label: if free-day, show 'Dia lliure: Dilluns', else title case
            let label = raw;
            let labeltxt = raw;
            let labelday = raw;
            if (freeKey) {
                const formatted = this.formatScoreLabel(freeKey, raw).replace(/\s*lliure$/i, '');
                labeltxt = `Dia lliure: `;
                labelday = formatted.toUpperCase();
                label = labeltxt + labelday;
            } else {
                label = raw.replace(/(^|\s)\S/g, s => s.toUpperCase());
            }

            if (!label || String(label).trim() === '') continue;

            badges.push({
                label,
                className: this.getRecommendationBadgeClass(key, raw),
                title: key ? this.formatScoreLabel(key, raw) : raw
            });
        }

        return badges;
    }

    getRecommendationBadgeClass(scoreKey, label) {
        if (typeof scoreKey === 'string' && scoreKey.startsWith('free_day_')) {
            return 'recommendation-badge-free-day';
        }

        const normalizedLabel = this.normalizeText(label);
        if (normalizedLabel.includes('hora morta') || normalizedLabel.includes('gaps')) {
            return 'recommendation-badge-gaps';
        }

        if (normalizedLabel.includes('setmanal') || normalizedLabel.includes('setmana')) {
            return 'recommendation-badge-hours';
        }

        if (normalizedLabel.includes('compact')) {
            return 'recommendation-badge-compact';
        }

        return 'recommendation-badge-generic';
    }

    getPreferenceExplanation(option) {
        const summary = this.normalizePreferenceSummary(option?.preferenceSummary);
        if (summary.explanation) {
            return summary.explanation;
        }

        return '';
    }

    getInformativeRecommendation(option) {
        const summary = this.normalizePreferenceSummary(option?.preferenceSummary);

        // Prefer explicit recommendedFor labels if available
        if (Array.isArray(summary.recommendedFor) && summary.recommendedFor.length > 0) {
            const weekendTokens = ['dissabte', 'diumenge', 'saturday', 'sunday'];
            const labels = summary.recommendedFor
                .filter(lbl => {
                    const l = String(lbl || '').toLowerCase();
                    return !weekendTokens.some(tok => l.includes(tok));
                })
                .slice(0, 2)
                .join(', ');

            if (labels) return `Recomanat si prefereix: ${labels}.`;
        }

        // Fallback: infer from numeric scores
        const scores = summary.scores || {};
        const entries = Object.entries(scores).filter(([, v]) => Number(v) > 0);
        if (entries.length === 0) return '';

        // pick top scoring key
        entries.sort((a, b) => {
            const aIsGap = a[0] === 'minimize-gaps' || a[0] === 'minimize_gaps';
            const bIsGap = b[0] === 'minimize-gaps' || b[0] === 'minimize_gaps';

            if (aIsGap !== bIsGap) {
                return aIsGap ? 1 : -1;
            }

            return Number(b[1]) - Number(a[1]);
        });
        const topKey = entries[0][0];

        if (typeof topKey === 'string' && topKey.startsWith('free_day_')) {
            const dayIndex = Number(topKey.split('_').pop());
            const dayNames = {
                1: 'dilluns', 2: 'dimarts', 3: 'dimecres', 4: 'dijous', 5: 'divendres', 6: 'dissabte', 7: 'diumenge'
            };
            // Do not suggest weekends for an academic schedule
            if (dayIndex === 6 || dayIndex === 7) {
                return '';
            }

            const day = dayNames[dayIndex] || 'aquest dia';
            return `Aquest horari és el millor si prefereixes tenir els ${day} lliures.`;
        }

        const mapping = {
            minimize_weekly_hours: 'tenir menys hores de classe setmanals',
            minimize_gaps: 'tenir menys buits entre classes',
            compact_days: 'concentrar les classes en dies més compactes'
        };

        const phrase = mapping[topKey] || '';
        if (phrase) return `Aquest horari és el millor si vols ${phrase}.`;

        return '';
    }

    normalizeOptimizationValue(value) {
        if (value == null || value === '') {
            return 'minimize_gaps';
        }

        const normalized = this.normalizeText(value).replace(/\s+/g, '-');

        if (normalized === 'group-by-type' || normalized === 'group_by_type' || normalized === 'by-type') {
            return 'group-by-type';
        }

        if (normalized === 'avoid-early' || normalized === 'avoid_early' || normalized === 'morning' || normalized === 'first-hour') {
            return 'avoid-early';
        }

        if (normalized === 'avoid-late' || normalized === 'avoid_late' || normalized === 'afternoon' || normalized === 'last-hour') {
            return 'avoid-late';
        }

        if (normalized === 'free-day' || normalized === 'free_day' || normalized === 'avoid-friday') {
            return 'free-day';
        }

        if (normalized === 'minimize-days' || normalized === 'compact' || normalized === 'compact-days' || normalized === 'balanced') {
            return 'balanced';
        }

        if (normalized === 'minimize-weekly-hours' || normalized === 'minimize-hours') {
            return 'minimize_weekly_hours';
        }

        if (normalized === 'minimize-gaps' || normalized === 'avoid-gaps') {
            return 'minimize_gaps';
        }

        return 'minimize_gaps';
    }

    resolveFreeDayScoreKey(freeDayPreference) {
        if (!freeDayPreference) {
            return null;
        }

        const normalized = this.normalizeText(freeDayPreference);
        const dayMap = {
            monday: 1,
            dilluns: 1,
            tuesday: 2,
            dimarts: 2,
            wednesday: 3,
            dimecres: 3,
            thursday: 4,
            dijous: 4,
            friday: 5,
            divendres: 5,
            saturday: 6,
            dissabte: 6,
            sunday: 7,
            diumenge: 7
        };

        // direct match
        if (dayMap[normalized]) {
            return `free_day_${dayMap[normalized]}`;
        }

        // detect embedded day names inside longer labels (e.g. 'Dissabte lliure')
        for (const [name, num] of Object.entries(dayMap)) {
            if (normalized.includes(name)) {
                return `free_day_${num}`;
            }
        }

        return null;
    }

    formatScoreLabel(scoreKey, fallbackLabel = '') {
        if (typeof scoreKey === 'string' && scoreKey.startsWith('free_day_')) {
            const dayIndex = Number(scoreKey.split('_').pop());
            const dayNames = {
                1: 'Dilluns',
                2: 'Dimarts',
                3: 'Dimecres',
                4: 'Dijous',
                5: 'Divendres',
                6: 'Dissabte',
                7: 'Diumenge'
            };

            // Avoid displaying weekend free-day labels in the academic calendar
            if (dayIndex === 6 || dayIndex === 7) {
                return '';
            }

            return `${dayNames[dayIndex] || 'Dia'} lliure`;
        }

        const labels = {
            minimize_weekly_hours: 'Menys hores setmanals',
            minimize_gaps: 'Menys buits',
            compact_days: 'Dies compactes'
        };

        return labels[scoreKey] || fallbackLabel || scoreKey;
    }

    normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    normalizeStringValue(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    toggleExplanationPanel() {
        const modal = document.getElementById('explanationColumn');
        if (!modal) return;
        const isHidden = modal.getAttribute('aria-hidden') === 'true';
        modal.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
    }

    getOptionExplanation(option) {
        const rawExplanation = String(option?.explanation || '').trim();
        if (rawExplanation) {
            return rawExplanation;
        }

        const subjectGroupings = Array.isArray(option?.subjects) ? option.subjects : [];
        if (subjectGroupings.length === 0) {
            return 'Assignatures:\nNo hi ha informació disponible.';
        }

        const lines = ['Assignatures:'];
        subjectGroupings.forEach(subject => {
            const groups = Array.isArray(subject?.groups) ? subject.groups : [];
            const parts = groups.map(group => `${group?.typeName || 'General'} (${group?.groupCode || '-'})`);
            lines.push(`${subject?.subjectCode || '-'}: ${parts.join(', ')}`);
        });

        return lines.join('\n');
    }

    renderBackendNotice(message) {
        const generatedResults = document.getElementById('generatedResults');
        if (!generatedResults) return;

        let notice = document.getElementById('generationBackendNotice');

        if (!message) {
            if (notice) {
                notice.remove();
            }
            return;
        }

        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'generationBackendNotice';
            notice.style.margin = '0 0 1rem';
            notice.style.padding = '0.9rem 1rem';
            notice.style.borderRadius = '12px';
            notice.style.border = '1px solid rgba(176, 93, 0, 0.28)';
            notice.style.background = 'rgba(255, 244, 230, 0.95)';
            notice.style.color = '#7a3e00';
            notice.style.fontWeight = '600';
            notice.style.lineHeight = '1.35';
            generatedResults.prepend(notice);
        }

        notice.textContent = message;
    }

    renderOverlapAlerts(overlaps) {
        const alertsContainer = document.getElementById('overlapAlerts');
        if (!alertsContainer) return;

        if (!Array.isArray(overlaps) || overlaps.length === 0) {
            alertsContainer.innerHTML = '';
            alertsContainer.classList.add('is-hidden');
            return;
        }

        alertsContainer.classList.remove('is-hidden');
        alertsContainer.innerHTML = overlaps
            .map(overlap => `<div class="overlap-alert"><strong>Atenció:</strong> ${this.escapeHtml(overlap.text)}</div>`)
            .join('');
    }

    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    updateScheduleIndicator() {
        const currentEl = document.getElementById('currentSchedule');
        const totalEl = document.getElementById('totalSchedules');
        const variantLabelEl = document.getElementById('weekVariantLabel');
        const variant = this.getCurrentVariant();

        if (currentEl) {
            currentEl.textContent = this.currentVariantIndex + 1;
        }

        if (totalEl) {
            totalEl.textContent = this.displayVariants.length;
        }

        if (variantLabelEl && variant) {
            variantLabelEl.textContent = variant.label;
        }
    }

    updateMetrics(metrics) {
        const elements = {
            totalHours: document.getElementById('totalHours'),
            classDays: document.getElementById('classDays'),
            gapHours: document.getElementById('gapHours'),
            firstClass: document.getElementById('firstClass')
        };

        Object.keys(elements).forEach(key => {
            if (elements[key]) {
                elements[key].textContent = metrics[key];
            }
        });
    }

    renderScheduleGrid(classes) {
        const scheduleBody = document.getElementById('scheduleBody');
        if (!scheduleBody) return;

        scheduleBody.innerHTML = '';

        const bounds = this.computeGridBounds(classes);
        this.gridStartHour = bounds.startHour;
        this.gridEndHour = bounds.endHour;

        const totalRows = this.gridEndHour - this.gridStartHour + 1;
        const hours = Array.from({ length: totalRows }, (_, i) => this.gridStartHour + i);
        const days = 5;

        scheduleBody.style.gridTemplateRows = `repeat(${totalRows}, 60px)`;

        hours.forEach(hour => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            timeSlot.dataset.hour = hour;
            timeSlot.textContent = `${hour}:00`;
            scheduleBody.appendChild(timeSlot);

            for (let day = 1; day <= days; day++) {
                const cell = document.createElement('div');
                cell.className = 'schedule-cell';
                cell.dataset.day = day;
                cell.dataset.hour = hour;
                scheduleBody.appendChild(cell);
            }
        });

        const positionedClasses = this.computeOverlapColumns(classes);
        positionedClasses.forEach(classInfo => {
            this.addClassBlock(classInfo);
        });
    }

    computeOverlapColumns(classes) {
        if (!Array.isArray(classes) || classes.length === 0) {
            return [];
        }

        const byDay = new Map();
        classes.forEach(classInfo => {
            if (!byDay.has(classInfo.day)) {
                byDay.set(classInfo.day, []);
            }
            byDay.get(classInfo.day).push({ ...classInfo });
        });

        const result = [];

        byDay.forEach(dayClasses => {
            dayClasses.sort((a, b) => {
                if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
                return a.endMinute - b.endMinute;
            });

            const active = [];

            dayClasses.forEach(current => {
                for (let i = active.length - 1; i >= 0; i--) {
                    if (active[i].endMinute <= current.startMinute) {
                        active.splice(i, 1);
                    }
                }

                const usedColumns = new Set(active.map(item => item.overlapColumn));
                let overlapColumn = 0;
                while (usedColumns.has(overlapColumn)) {
                    overlapColumn++;
                }

                current.overlapColumn = overlapColumn;
                active.push(current);
            });

            dayClasses.forEach(current => {
                let overlapColumns = 1;
                dayClasses.forEach(other => {
                    if (this.intervalsOverlap(current, other)) {
                        overlapColumns = Math.max(overlapColumns, (other.overlapColumn || 0) + 1);
                    }
                });

                current.overlapColumns = overlapColumns;
                result.push(current);
            });
        });

        return result;
    }

    intervalsOverlap(a, b) {
        return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
    }

    addClassBlock(classInfo) {
        const { day, startMinute, endMinute, name, code, groupCode, type, room, timeRange } = classInfo;
        const startHour = Math.floor(startMinute / 60);
        const blockColor = classInfo.color || this.getSubjectColor(code);

        const startCell = document.querySelector(
            `.schedule-cell[data-day="${day}"][data-hour="${startHour}"]`
        );

        if (!startCell) return;

        const classBlock = document.createElement('div');
        classBlock.className = `class-block class-${type}`;
        if (classInfo.hasCollision) {
            classBlock.classList.add('class-overlap');
        }
        classBlock.title = `${name} (${code || '-'}) · ${timeRange} · ${room || '-'}`;
        classBlock.style.background = `linear-gradient(135deg, ${blockColor} 0%, ${this.adjustColor(blockColor, -12)} 100%)`;
        classBlock.style.borderColor = this.adjustColor(blockColor, 28);

        const classCode = document.createElement('div');
        classCode.className = 'class-code';
        classCode.textContent = `${code || '-'} · ${groupCode || '-'}`;

        classBlock.appendChild(classCode);

        const className = document.createElement('div');
        className.className = 'class-name';
        className.textContent = name;

        if (name && name !== code) {
            classBlock.appendChild(className);
        }

        const blockDuration = Math.max(30, endMinute - startMinute);
        if (blockDuration >= 45) {
            const classTime = document.createElement('div');
            classTime.className = 'class-time';
            classTime.textContent = timeRange || `${this.formatMinutes(startMinute)} - ${this.formatMinutes(endMinute)}`;
            classBlock.appendChild(classTime);
        }

        if (blockDuration >= 60) {
            const classMeta = document.createElement('div');
            classMeta.className = 'class-meta';

            const classRoom = document.createElement('span');
            classRoom.className = 'class-room';
            classRoom.textContent = room || '-';

            classMeta.appendChild(classRoom);

            if (classInfo.hasCollision) {
                const overlapChip = document.createElement('span');
                overlapChip.className = 'class-overlap-chip';
                overlapChip.textContent = 'Solap.';
                classMeta.appendChild(overlapChip);
            }

            classBlock.appendChild(classMeta);
        }

        const minuteOffset = startMinute % 60;
        const durationMinutes = blockDuration;

        // Compensate 1px grid separators crossed while the block spans multiple hour rows.
        const crossedHourSeparators = Math.floor((minuteOffset + durationMinutes - 1) / 60);
        const separatorCompensationPx = crossedHourSeparators;

        classBlock.style.top = `${minuteOffset}px`;
        classBlock.style.height = `${Math.max(22, durationMinutes + separatorCompensationPx)}px`;

        const overlapColumns = Number.isFinite(classInfo.overlapColumns) ? classInfo.overlapColumns : 1;
        const overlapColumn = Number.isFinite(classInfo.overlapColumn) ? classInfo.overlapColumn : 0;

        if (overlapColumns > 1) {
            const horizontalPaddingPct = 4;
            const usablePct = 100 - (horizontalPaddingPct * 2);
            const columnWidthPct = usablePct / overlapColumns;
            const leftPct = horizontalPaddingPct + (columnWidthPct * overlapColumn);

            classBlock.style.left = `${leftPct}%`;
            classBlock.style.right = 'auto';
            classBlock.style.width = `${Math.max(15, columnWidthPct - 1)}%`;
            classBlock.style.zIndex = String(20 + overlapColumn);
        } else {
            classBlock.style.left = '4px';
            classBlock.style.right = '4px';
            classBlock.style.width = 'auto';
            classBlock.style.zIndex = '12';
        }

        startCell.appendChild(classBlock);
    }

    adjustColor(hexColor, amount) {
        const normalized = String(hexColor || '').trim();
        const match = normalized.match(/^#?([a-f0-9]{6})$/i);

        if (!match) {
            return normalized || '#B45309';
        }

        const value = match[1];
        const r = Math.max(0, Math.min(255, parseInt(value.slice(0, 2), 16) + amount));
        const g = Math.max(0, Math.min(255, parseInt(value.slice(2, 4), 16) + amount));
        const b = Math.max(0, Math.min(255, parseInt(value.slice(4, 6), 16) + amount));

        return `rgb(${r}, ${g}, ${b})`;
    }

    computeGridBounds(classes) {
        if (!Array.isArray(classes) || classes.length === 0) {
            return { startHour: 8, endHour: 21 };
        }

        const earliestStart = Math.min(...classes.map(classInfo => Math.floor(classInfo.startMinute / 60)));
        const latestEnd = Math.max(...classes.map(classInfo => Math.ceil(classInfo.endMinute / 60)));

        let startHour = Math.max(8, earliestStart - 1);
        let endHour = Math.min(21, latestEnd + 1);

        if (endHour - startHour < 7) {
            endHour = Math.min(21, startHour + 7);
        }

        if (endHour - startHour < 7) {
            startHour = Math.max(8, endHour - 7);
        }

        return { startHour, endHour };
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevSchedule');
        const nextBtn = document.getElementById('nextSchedule');
        const totalVariants = this.displayVariants.length;

        if (prevBtn) {
            prevBtn.disabled = this.currentVariantIndex === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentVariantIndex >= totalVariants - 1;
        }
    }

    showEmptyState(message = 'Encara no has generat cap horari') {
        const generatedResults = document.getElementById('generatedResults');
        if (!generatedResults) return;

        this.backendNotice = null;

        generatedResults.innerHTML = `
            <div class="empty-schedule">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <h3>${message}</h3>
                <p>Selecciona les teves assignatures i preferències per començar.</p>
                <a href="subjects-selector.html" class="btn-primary">
                    <span>Començar</span>
                </a>
            </div>
        `;
    }

    async exportSchedule() {
        this.toggleExportMenu();
    }

    toggleExportMenu(forceState = null) {
        const exportMenu = document.getElementById('exportMenu');
        const exportBtn = document.getElementById('exportBtn');

        if (!exportMenu || !exportBtn) {
            return false;
        }

        const shouldOpen = forceState === null
            ? !exportMenu.classList.contains('is-open')
            : Boolean(forceState);

        exportMenu.classList.toggle('is-open', shouldOpen);
        exportBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        return shouldOpen;
    }

    closeExportMenu() {
        this.toggleExportMenu(false);
    }

    sanitizeFileName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-{2,}/g, '-')
            .toLowerCase();
    }

    buildExportBaseName(currentOption = null) {
        const variant = this.getCurrentVariant();
        const optionIndex = variant?.optionIndex;
        const optionLabel = Number.isInteger(optionIndex) ? `opcio-${optionIndex + 1}` : 'horari';
        const variantLabel = this.sanitizeFileName(variant?.label || currentOption?.weeks?.[variant?.weekIndex]?.label || '');

        return `tcm-calendar-${optionLabel}${variantLabel ? `-${variantLabel}` : ''}`;
    }

    buildSemesterStartDate() {
        const semesterStart = new Date();
        const day = semesterStart.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;

        semesterStart.setDate(semesterStart.getDate() + diffToMonday);
        semesterStart.setHours(0, 0, 0, 0);
        return semesterStart;
    }

    formatIcsDateTime(date) {
        const year = String(date.getFullYear()).padStart(4, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    formatIcsUtcTimestamp(date) {
        const year = String(date.getUTCFullYear()).padStart(4, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    }

    escapeIcsText(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '')
            .replace(/,/g, '\\,')
            .replace(/;/g, '\\;');
    }

    downloadTextFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async buildIcsContent(currentOption) {
        const variant = this.getCurrentVariant();
        const now = new Date();
        const optionLabel = variant?.label || `Proposta ${Number(variant?.optionIndex ?? 0) + 1}`;
        const calendarName = this.escapeIcsText(`TCM Calendar - ${optionLabel}`);
        const selectedTrimester = Number(currentOption?.selectedTrimester ?? this.generationData?.subjects?.selectedTrimester ?? null);
        const trimesterWindow = Number.isFinite(selectedTrimester) && window.AcademicCalendar && typeof window.AcademicCalendar.getTrimesterWindow === 'function'
            ? await window.AcademicCalendar.getTrimesterWindow(selectedTrimester)
            : null;
        const scheduleForExport = {
            ...currentOption,
            selectedTrimester: Number.isFinite(selectedTrimester) ? selectedTrimester : null,
            trimesterWindow
        };
        // Prefer using an active saved calendar id when available so exports match the saved calendar
        const activeSavedId = StorageHelper.getItem(this.ACTIVE_SAVED_CALENDAR_KEY, null);
        const exportCalendarId = activeSavedId || currentOption?.id || `ics-${Date.now()}`;

        let generatedEvents = await this.buildEventsFromSchedule(scheduleForExport, exportCalendarId);

        // If there are persisted events for this calendar (saved previously), prefer them for export.
        try {
            const stored = StorageHelper.getItem(this.CALENDAR_EVENTS_KEY, []);
            if (Array.isArray(stored) && stored.length > 0) {
                const persistedForCalendar = stored.filter(e => e && (e.scheduleId === exportCalendarId || e.scheduleId === currentOption?.id));
                if (persistedForCalendar.length > 0) {
                    generatedEvents = persistedForCalendar;
                }
            }
        } catch (e) {
            // fallback to generated events if parsing fails
            console.warn('No s\'ha pogut llegir esdeveniments persistits per l\'export:', e);
        }
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//TCM Calendar//Schedule Viewer//CA',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-TIMEZONE:Europe/Madrid',
            `X-WR-CALNAME:${calendarName}`,
            'X-WR-CALDESC:Horari exportat des de TCM Calendar'
        ];

        generatedEvents.forEach((event, index) => {
            if (!event?.date || !event?.startTime || !event?.endTime) {
                return;
            }

            const eventDate = new Date(`${event.date}T00:00:00`);
            const startParts = String(event.startTime).split(':').map(Number);
            const endParts = String(event.endTime).split(':').map(Number);

            if (startParts.length !== 2 || endParts.length !== 2 || startParts.some(Number.isNaN) || endParts.some(Number.isNaN)) {
                return;
            }

            const startDateTime = new Date(eventDate);
            startDateTime.setHours(startParts[0], startParts[1], 0, 0);

            const endDateTime = new Date(eventDate);
            endDateTime.setHours(endParts[0], endParts[1], 0, 0);

            const title = this.escapeIcsText(event.title || 'Horari');
            const description = this.escapeIcsText(event.description || `Setmana acadèmica ${optionLabel}`);
            const location = this.escapeIcsText(event.location || '-');

            lines.push(
                'BEGIN:VEVENT',
                `UID:${this.buildExportBaseName(currentOption)}-${index}@tcm-calendar`,
                `DTSTAMP:${this.formatIcsUtcTimestamp(now)}`,
                `SUMMARY:${title}`,
                `DESCRIPTION:${description}`,
                `LOCATION:${location}`,
                `DTSTART:${this.formatIcsDateTime(startDateTime)}`,
                `DTEND:${this.formatIcsDateTime(endDateTime)}`,
                'END:VEVENT'
            );
        });

        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    async exportCurrentScheduleAsPdf() {
        // New simplified export flow: build a clean export sheet and generate PDF via html2pdf
        const currentOption = this.getCurrentOption();
        if (!currentOption) {
            this.showNotification('No hi ha cap horari actiu per exportar.', 'warning');
            return;
        }

        this.closeExportMenu();

        // remove any previous export sheet
        const existing = document.getElementById('pdfExportSheet');
        if (existing) existing.remove();

        // Build sheet with explicit app title + logo and only week 1 + week 2
        const exportSheet = this.buildPdfExportSheet(currentOption);
        document.body.appendChild(exportSheet);

        // Ensure html2pdf is available (bundle includes jspdf + html2canvas)
        if (typeof window.html2pdf === 'undefined') {
            try {
                await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.3/html2pdf.bundle.min.js');
            } catch (err) {
                console.warn('Could not load html2pdf library, falling back to print()', err);
                setTimeout(() => window.print(), 120);
                return;
            }
        }

        // Make the sheet visible (stylesheet defaults hide .pdf-export-sheet)
        exportSheet.style.display = 'block';
        // Add print-exporting to apply print CSS rules
        document.body.classList.add('print-exporting');

        // Wait for images inside sheet (logo) to load to avoid blank captures
        const imgs = Array.from(exportSheet.querySelectorAll('img'));
        try {
            await Promise.all(imgs.map(img => new Promise((resolve) => {
                if (img.complete) return resolve();
                img.addEventListener('load', () => resolve());
                img.addEventListener('error', () => resolve());
            })));
        } catch (e) {
            // ignore
        }

        try {
            const opt = {
                margin: [8, 8, 8, 8], // mm
                filename: `${this.buildExportBaseName(this.getCurrentOption())}.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            await window.html2pdf().set(opt).from(exportSheet).save();
            this.showNotification('PDF exportat correctament', 'success');
        } catch (err) {
            console.error('Error generant PDF amb html2pdf:', err);
            this.showNotification('No s\'ha pogut generar el PDF', 'error');
            // fallback to print dialog
            setTimeout(() => window.print(), 120);
        } finally {
            // cleanup DOM
            document.body.classList.remove('print-exporting');
            const sheet = document.getElementById('pdfExportSheet');
            if (sheet && sheet.remove) sheet.remove();
        }
    }

    // Dynamically load a script and return once loaded
    loadScript(url) {
        return new Promise((resolve, reject) => {
            try {
                const existing = Array.from(document.getElementsByTagName('script')).find(s => s.src && s.src.indexOf(url) !== -1);
                if (existing) {
                    existing.addEventListener('load', () => resolve());
                    if (existing.readyState === 'complete' || existing.readyState === 'loaded') resolve();
                    return;
                }

                const s = document.createElement('script');
                s.src = url;
                s.async = true;
                s.onload = () => resolve();
                s.onerror = (err) => reject(new Error('Failed to load ' + url));
                document.head.appendChild(s);
            } catch (err) {
                reject(err);
            }
        });
    }

    async exportCurrentScheduleAsPdfWithJsPDF(exportSheet, exportTitle) {
        // load libraries if needed
        if (typeof window.html2canvas === 'undefined') {
            await this.loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        }

        if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
            await this.loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
        }

        const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
        if (!jsPDFConstructor) {
            throw new Error('jsPDF not available');
        }

        const weeks = Array.from(exportSheet.querySelectorAll('.pdf-export-week'));
        if (!weeks.length) throw new Error('No weeks to export');

        const pdf = new jsPDFConstructor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidthMm = 297;
        const pageHeightMm = 210;
        const marginMm = 8;
        const contentWidthMm = pageWidthMm - marginMm * 2;
        const contentHeightMm = pageHeightMm - marginMm * 2;

        // Ensure footer exists for print-class styles to apply sizing consistently
        const footer = document.createElement('div');
        footer.className = 'pdf-print-footer';
        document.body.appendChild(footer);

        // First, capture and add the global header (includes legend and metadata) if present
        const headerNode = exportSheet.querySelector('.pdf-export-header');
        if (headerNode) {
            const headerCanvas = await window.html2canvas(headerNode, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            });
            const headerImg = headerCanvas.toDataURL('image/png');
            const imgW = headerCanvas.width;
            const imgH = headerCanvas.height;
            const ratio = Math.min(contentWidthMm / imgW, contentHeightMm / imgH);
            const drawW = imgW * ratio;
            const drawH = imgH * ratio;
            const x = (pageWidthMm - drawW) / 2;
            const y = marginMm + ((contentHeightMm - drawH) / 2);
            pdf.addImage(headerImg, 'PNG', x, y, drawW, drawH);
        }

        for (let i = 0; i < weeks.length; i++) {
            const node = weeks[i];

            // Force visible and ensure computed layout
            node.style.pageBreakInside = 'avoid';

            const canvas = await window.html2canvas(node, {
                scale: 2, // high quality
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');

            // compute image size in mm to fit content area
            const imgW = canvas.width;
            const imgH = canvas.height;
            const ratio = Math.min(contentWidthMm / imgW, contentHeightMm / imgH);
            const drawW = imgW * ratio;
            const drawH = imgH * ratio;
            const x = (pageWidthMm - drawW) / 2;
            const y = marginMm + ((contentHeightMm - drawH) / 2);

            // When a header was added, the weeks should start from page 2
            const pageIndex = (headerNode ? i + 2 : i + 1);
            if (pageIndex > 1) pdf.addPage();
            pdf.setPage(pageIndex);
            pdf.addImage(imgData, 'PNG', x, y, drawW, drawH);
        }

        // Add metadata: title, generatedBy
        pdf.setProperties({ title: exportTitle, subject: 'Horari exportat des de TCM Calendar' });

        // Trigger download
        const filename = `${this.buildExportBaseName(this.getCurrentOption())}.pdf`;
        pdf.save(filename);

        // Cleanup DOM
        document.body.classList.remove('print-exporting');
        document.title = document.title || exportTitle;
        const sheet = document.getElementById('pdfExportSheet');
        if (sheet && sheet.remove) sheet.remove();
        if (footer && footer.remove) footer.remove();

        return true;
    }

    buildPdfExportSheet(currentOption) {
        const sheet = document.createElement('div');
        sheet.id = 'pdfExportSheet';
        sheet.className = 'pdf-export-sheet';

        // Inline minimal styles to ensure typography, cover page and forced page breaks
        const style = document.createElement('style');
        style.textContent = `
            #pdfExportSheet { font-family: Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #111827; }
            .pdf-cover { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; box-sizing:border-box; }
            .pdf-cover .brand-logo { width:84px; height:84px; object-fit:contain; margin-bottom:18px; }
            .pdf-cover h1 { margin:0; font-size:30px; font-weight:800; }
            .pdf-cover p { margin:8px 0 0; color:#475569; font-size:13px; }
            .pdf-cover { page-break-after: always; }
            .pdf-export-week { page-break-after: always; page-break-inside: avoid; padding:12px 8px; }
            .pdf-export-week:last-child { page-break-after: auto; }
            .pdf-export-week-header { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
            .pdf-export-legend { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; font-size:12px; }
            .pdf-legend-item { display:inline-flex; align-items:center; gap:6px; padding:4px 6px; background:rgba(0,0,0,0.02); border-radius:6px; }
        `;

        sheet.appendChild(style);

        // Cover page (page 1) with app title + logo + metadata
        const cover = document.createElement('div');
        cover.className = 'pdf-cover';

        const logo = document.createElement('img');
        logo.className = 'brand-logo';
        logo.src = 'assets/images/logo_app.svg';
        logo.alt = 'TCM Calendar';

        const titleEl = document.createElement('h1');
        titleEl.textContent = 'TCM Calendar';

        const metaEl = document.createElement('p');
        const now = new Date();
        metaEl.textContent = `Exportat: ${now.toLocaleString()} · Usuari: ${this.getUsername() || 'Anònim'}`;

        cover.appendChild(logo);
        cover.appendChild(titleEl);
        cover.appendChild(metaEl);
        sheet.appendChild(cover);

        // Legend: subject colors (small strip below cover)
        const legend = document.createElement('div');
        legend.className = 'pdf-export-legend';
        const colorMap = this.buildLegendColorMap(currentOption);
        const keys = Object.keys(colorMap).slice(0, 40);
        keys.forEach(code => {
            const item = document.createElement('span');
            item.className = 'pdf-legend-item';
            const swatch = document.createElement('span');
            swatch.style.display = 'inline-block';
            swatch.style.width = '12px';
            swatch.style.height = '12px';
            swatch.style.background = colorMap[code] || this.getSubjectColor(code);
            swatch.style.border = '1px solid rgba(0, 0, 0, 0.12)';
            swatch.style.borderRadius = '2px';
            const label = document.createElement('span');
            const fullName = (this.subjectNameByCode && this.subjectNameByCode[code]) ? this.subjectNameByCode[code] : '';
            label.textContent = fullName ? `${code} - ${fullName}` : `${code}`;
            item.appendChild(swatch);
            item.appendChild(label);
            legend.appendChild(item);
        });

        // Place legend inside the cover so it appears on the first page with the title/logo
        if (keys.length) {
            const legendWrap = document.createElement('div');
            legendWrap.style.padding = '8px';
            legendWrap.appendChild(legend);
            cover.appendChild(legendWrap);
        }

        // Only include the first two weeks (Setmana 1 i Setmana 2)
        const weeks = Array.isArray(currentOption?.weeks) ? currentOption.weeks.slice(0, 2) : [];
        weeks.forEach((week, index) => {
            sheet.appendChild(this.buildPdfExportWeekSection(week, index));
        });

        return sheet;
    }

    buildLegendColorMap(currentOption) {
        const colorMap = {
            ...(this.subjectColorByCode || {}),
            ...(currentOption?.subjectColorByCode || {})
        };

        const addSubjectColor = (subjectCode, color) => {
            if (!subjectCode || colorMap[subjectCode]) {
                return;
            }

            colorMap[subjectCode] = color || this.getSubjectColor(subjectCode);
        };

        const subjects = Array.isArray(currentOption?.subjects) ? currentOption.subjects : [];
        subjects.forEach(subject => {
            const subjectCode = subject?.subjectCode || subject?.code || subject?.subjectId || null;
            addSubjectColor(subjectCode, subject?.color);
        });

        const weeks = Array.isArray(currentOption?.weeks) ? currentOption.weeks : [];
        weeks.forEach(week => {
            const classes = Array.isArray(week?.classes) ? week.classes : [];
            classes.forEach(classInfo => {
                const subjectCode = classInfo?.code || classInfo?.subjectCode || classInfo?.subject || null;
                addSubjectColor(subjectCode, classInfo?.color);
            });
        });

        return colorMap;
    }

    applyPdfPageBreaks(sheet) {
        if (!sheet || !sheet.querySelectorAll) return;

        // Determine printable page height in pixels using mm unit conversion (A4 landscape height minus margins)
        const contentHeightMm = 210 - (6 * 2); // 210mm page height minus 6mm top/bottom margins
        const ruler = document.createElement('div');
        ruler.style.position = 'absolute';
        ruler.style.visibility = 'hidden';
        ruler.style.height = `${contentHeightMm}mm`;
        ruler.style.width = '1px';
        document.body.appendChild(ruler);
        const pageHeightPx = Math.round(ruler.getBoundingClientRect().height || ruler.offsetHeight);
        document.body.removeChild(ruler);

        // Walk through week sections and insert breaks when they would overflow the page
        const sections = Array.from(sheet.querySelectorAll('.pdf-export-week'));
        let used = 0;
        sections.forEach((sec, idx) => {
            const rect = sec.getBoundingClientRect();
            // If element has no layout yet, use offsetHeight
            const h = Math.max(1, Math.round(rect.height || sec.offsetHeight || 0));

            // If this is the first section, start the page with it
            if (idx === 0) {
                used = h;
                return;
            }

            // If a single section is taller than a page, place it on its own page
            if (h >= pageHeightPx) {
                sec.classList.add('pdf-page-break');
                used = h;
                return;
            }

            if (used + h > pageHeightPx) {
                // Force this section to start on a new page
                sec.classList.add('pdf-page-break');
                used = h;
            } else {
                used += h;
            }
        });
    }

    buildPdfExportWeekSection(week, index) {
        const fragment = document.createDocumentFragment();
        const ranges = [
            { startHour: 8, endHour: 14, subtitle: 'MATÍ (fins les 14h)' },
            { startHour: 15, endHour: 21, subtitle: 'TARDA (des de les 15h)' }
        ];

        ranges.forEach((range, rangeIndex) => {
            if (!this.hasPdfClassesInRange(week, range)) {
                return;
            }

            fragment.appendChild(this.buildPdfExportWeekSectionBlock(week, index, range, index === 0 && rangeIndex === 0));
        });

        return fragment;
    }

    hasPdfClassesInRange(week, range) {
        const classes = Array.isArray(week?.classes) ? week.classes : [];
        const startLimit = Number.isFinite(range?.startHour) ? range.startHour * 60 : null;
        const endLimit = Number.isFinite(range?.endHour) ? range.endHour * 60 : null;

        return classes.some(classInfo => {
            const startMinute = Number(classInfo?.startMinute);
            if (!Number.isFinite(startMinute)) {
                return false;
            }

            if (startLimit != null && startMinute < startLimit) {
                return false;
            }

            if (endLimit != null && startMinute >= endLimit) {
                return false;
            }

            return true;
        });
    }

    buildPdfExportWeekSectionBlock(week, index, range, isFirstExportPage) {
        const section = document.createElement('section');
        section.className = 'pdf-export-week';
        if (isFirstExportPage) {
            section.classList.add('pdf-export-week-first');
        }

        const weekHeader = document.createElement('div');
        weekHeader.className = 'pdf-export-week-header';
        const weekBrand = document.createElement('div');
        weekBrand.className = 'pdf-export-week-brand';

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'pdf-export-week-title';

        const weekTitle = document.createElement('h2');
        weekTitle.textContent = week?.label || `Setmana ${index + 1}`;

        const weekSubtitle = document.createElement('p');
        weekSubtitle.className = 'pdf-export-subtitle';
        weekSubtitle.textContent = range?.subtitle || '';

        const weekMetrics = document.createElement('p');
        const metrics = this.calculatePdfBlockMetrics(Array.isArray(week?.classes) ? week.classes : [], range);
        weekMetrics.textContent = `Hores/setmana: ${metrics.hoursPerWeek} · Dies/setmana: ${metrics.daysPerWeek} · Primera classe: ${metrics.firstClass}`;

        titleWrapper.appendChild(weekTitle);
        titleWrapper.appendChild(weekSubtitle);
        titleWrapper.appendChild(weekMetrics);
        weekBrand.appendChild(titleWrapper);

        weekHeader.appendChild(weekBrand);
        section.appendChild(weekHeader);

        const scheduleGrid = document.createElement('div');
        scheduleGrid.className = 'schedule-grid pdf-schedule-grid';

        const scheduleHeader = document.createElement('div');
        scheduleHeader.className = 'schedule-header';
        scheduleHeader.innerHTML = `
            <div class="time-column-header"></div>
            <div class="day-header">Dilluns</div>
            <div class="day-header">Dimarts</div>
            <div class="day-header">Dimecres</div>
            <div class="day-header">Dijous</div>
            <div class="day-header">Divendres</div>
        `;

        const scheduleBody = document.createElement('div');
        scheduleBody.className = 'schedule-body';

        scheduleGrid.appendChild(scheduleHeader);
        scheduleGrid.appendChild(scheduleBody);
        section.appendChild(scheduleGrid);

        this.renderScheduleGridInto(scheduleBody, Array.isArray(week?.classes) ? week.classes : [], {
            startHour: range?.startHour,
            endHour: range?.endHour,
            clipToRange: true
        });

        return section;
    }

    calculatePdfBlockMetrics(classes, range) {
        const allClasses = Array.isArray(classes) ? classes : [];
        const startLimit = Number.isFinite(range?.startHour) ? range.startHour * 60 : null;
        const endLimit = Number.isFinite(range?.endHour) ? range.endHour * 60 : null;

        const visibleClasses = allClasses.filter(classInfo => {
            const startMinute = Number(classInfo?.startMinute);
            if (!Number.isFinite(startMinute)) {
                return false;
            }

            if (startLimit != null && startMinute < startLimit) {
                return false;
            }

            if (endLimit != null && startMinute >= endLimit) {
                return false;
            }

            return true;
        });

        if (visibleClasses.length === 0) {
            return {
                hoursPerWeek: '0h',
                daysPerWeek: 0,
                firstClass: '--:--'
            };
        }

        let totalMinutes = 0;
        for (let day = 1; day <= 5; day++) {
            const dayClasses = visibleClasses
                .filter(classInfo => classInfo.day === day)
                .sort((left, right) => left.startMinute - right.startMinute);

            const merged = [];
            for (const classInfo of dayClasses) {
                const start = classInfo.startMinute;
                const end = classInfo.endMinute;
                if (merged.length === 0 || start >= merged[merged.length - 1][1]) {
                    merged.push([start, end]);
                } else {
                    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
                }
            }

            totalMinutes += merged.reduce((sum, [start, end]) => sum + (end - start), 0);
        }

        const distinctDays = new Set(visibleClasses.map(classInfo => classInfo.day)).size;
        let firstClassMinute = null;
        for (let day = 1; day <= 5 && firstClassMinute == null; day++) {
            const dayClasses = visibleClasses
                .filter(classInfo => classInfo.day === day)
                .sort((left, right) => left.startMinute - right.startMinute);
            if (dayClasses.length > 0) {
                firstClassMinute = dayClasses[0].startMinute;
            }
        }

        return {
            hoursPerWeek: this.formatDuration(totalMinutes),
            daysPerWeek: distinctDays,
            firstClass: firstClassMinute != null ? this.formatMinutes(firstClassMinute) : '--:--'
        };
    }

    renderScheduleGridInto(scheduleBody, classes, gridOptions = {}) {
        if (!scheduleBody) return;

        scheduleBody.innerHTML = '';

        const hasCustomBounds = Number.isFinite(gridOptions.startHour) && Number.isFinite(gridOptions.endHour);
        const bounds = hasCustomBounds
            ? { startHour: gridOptions.startHour, endHour: gridOptions.endHour }
            : this.computeGridBounds(classes);
        const startHour = bounds.startHour;
        const endHour = bounds.endHour;
        const totalRows = endHour - startHour + 1;
        const hours = Array.from({ length: totalRows }, (_, i) => startHour + i);
        const days = 5;

        // Use a reduced row height when rendering into the PDF export sheet
        const isExport = !!(scheduleBody.closest && scheduleBody.closest('.pdf-export-sheet'));
        const rowHeight = isExport ? 42 : 60;
        scheduleBody.style.gridTemplateRows = `repeat(${totalRows}, ${rowHeight}px)`;

        hours.forEach(hour => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            timeSlot.dataset.hour = hour;
            timeSlot.textContent = `${hour}:00`;
            scheduleBody.appendChild(timeSlot);

            for (let day = 1; day <= days; day++) {
                const cell = document.createElement('div');
                cell.className = 'schedule-cell';
                cell.dataset.day = day;
                cell.dataset.hour = hour;
                scheduleBody.appendChild(cell);
            }
        });

        // If exporting, make scheduleBody a positioning context and record row metrics
        if (isExport) {
            scheduleBody.style.position = 'relative';
        }
        const firstTimeSlot = scheduleBody.querySelector('.time-slot');
        const computedRowHeight = firstTimeSlot ? Math.round(firstTimeSlot.getBoundingClientRect().height) : rowHeight;
        scheduleBody.dataset.rowHeight = String(computedRowHeight);
        scheduleBody.dataset.startHour = String(startHour);

        const positionedClasses = this.computeOverlapColumns(classes);
        positionedClasses.forEach(classInfo => {
            this.addClassBlockToBody(scheduleBody, classInfo, {
                startMinute: hasCustomBounds ? startHour * 60 : null,
                endMinute: hasCustomBounds ? (endHour + 1) * 60 : null,
                clipToRange: !!gridOptions.clipToRange
            });
        });
    }

    addClassBlockToBody(scheduleBody, classInfo, gridOptions = {}) {
        const { day, startMinute, endMinute, name, code, groupCode, type, room, timeRange } = classInfo;
        const rangeStartMinute = Number.isFinite(gridOptions.startMinute) ? gridOptions.startMinute : null;
        const rangeEndMinute = Number.isFinite(gridOptions.endMinute) ? gridOptions.endMinute : null;
        const visibleStartMinute = rangeStartMinute !== null ? Math.max(startMinute, rangeStartMinute) : startMinute;
        const visibleEndMinute = rangeEndMinute !== null ? Math.min(endMinute, rangeEndMinute) : endMinute;

        if (visibleEndMinute <= visibleStartMinute) {
            return;
        }

        const startHour = Math.floor(visibleStartMinute / 60);
        const blockColor = classInfo.color || this.getSubjectColor(code);

        const startCell = scheduleBody.querySelector(
            `.schedule-cell[data-day="${day}"][data-hour="${startHour}"]`
        );

        if (!startCell) return;

        const classBlock = document.createElement('div');
        classBlock.className = `class-block class-${type}`;
        if (classInfo.hasCollision) {
            classBlock.classList.add('class-overlap');
        }
        classBlock.title = `${name} (${code || '-'}) · ${timeRange} · ${room || '-'}`;
        classBlock.style.background = `linear-gradient(135deg, ${blockColor} 0%, ${this.adjustColor(blockColor, -12)} 100%)`;
        classBlock.style.borderColor = this.adjustColor(blockColor, 28);

        const classCode = document.createElement('div');
        classCode.className = 'class-code';
        classCode.textContent = `${code || '-'} · ${groupCode || '-'}`;
        classBlock.appendChild(classCode);

        const className = document.createElement('div');
        className.className = 'class-name';
        className.textContent = name;

        if (name && name !== code) {
            classBlock.appendChild(className);
        }

        const blockDuration = Math.max(gridOptions.clipToRange ? 1 : 30, visibleEndMinute - visibleStartMinute);
        if (blockDuration >= 45) {
            const classTime = document.createElement('div');
            classTime.className = 'class-time';
            classTime.textContent = (visibleStartMinute !== startMinute || visibleEndMinute !== endMinute)
                ? `${this.formatMinutes(visibleStartMinute)} - ${this.formatMinutes(visibleEndMinute)}`
                : (timeRange || `${this.formatMinutes(startMinute)} - ${this.formatMinutes(endMinute)}`);
            classBlock.appendChild(classTime);
        }

        if (blockDuration >= 60) {
            const classMeta = document.createElement('div');
            classMeta.className = 'class-meta';

            const classRoom = document.createElement('span');
            classRoom.className = 'class-room';
            classRoom.textContent = room || '-';

            classMeta.appendChild(classRoom);

            if (classInfo.hasCollision) {
                const overlapChip = document.createElement('span');
                overlapChip.className = 'class-overlap-chip';
                overlapChip.textContent = 'Solap.';
                classMeta.appendChild(overlapChip);
            }

            classBlock.appendChild(classMeta);
        }

        // Map minutes -> px using the actual rendered row height when exporting
        const isExport = !!(scheduleBody.closest && scheduleBody.closest('.pdf-export-sheet'));
        let minuteScale = 1;
        let topPx = 0;
        let heightPx = 0;

        const overlapColumns = Number.isFinite(classInfo.overlapColumns) ? classInfo.overlapColumns : 1;
        const overlapColumn = Number.isFinite(classInfo.overlapColumn) ? classInfo.overlapColumn : 0;

        if (isExport) {
            const rowHeightPx = Number(scheduleBody.dataset.rowHeight) || 42;
            const startHourBound = Number(scheduleBody.dataset.startHour) || startHour;
            const gridGapPx = (() => {
                const computedStyle = window.getComputedStyle(scheduleBody);
                const gapValue = computedStyle.rowGap || computedStyle.gap || '0px';
                const parsedGap = Number.parseFloat(gapValue);
                return Number.isFinite(parsedGap) ? parsedGap : 0;
            })();
            minuteScale = rowHeightPx / 60;

            const minuteOffsetLocal = visibleStartMinute % 60;
            const durationMinutesLocal = blockDuration;

            const fullHourSlots = Math.max(0, Math.floor(visibleStartMinute / 60) - startHourBound);
            topPx = Math.round((fullHourSlots * (rowHeightPx + gridGapPx)) + (minuteOffsetLocal * minuteScale));

            const crossedHourSeparators = Math.floor((minuteOffsetLocal + durationMinutesLocal - 1) / 60);
            heightPx = Math.max(16, Math.round((durationMinutesLocal * minuteScale) + (crossedHourSeparators * gridGapPx)));

            // compute left/width relative to scheduleBody using cell geometry
            const scheduleRect = scheduleBody.getBoundingClientRect();
            const cellRect = startCell.getBoundingClientRect();

            if (overlapColumns > 1) {
                const horizontalPaddingPx = 4;
                const usablePx = Math.max(20, cellRect.width - (horizontalPaddingPx * 2));
                const columnWidthPx = usablePx / overlapColumns;
                const leftPx = Math.round(cellRect.left - scheduleRect.left + horizontalPaddingPx + (columnWidthPx * overlapColumn));
                const widthPx = Math.max(15, Math.round(columnWidthPx - 2));

                classBlock.style.left = `${leftPx}px`;
                classBlock.style.width = `${widthPx}px`;
                classBlock.style.right = 'auto';
                classBlock.style.zIndex = String(20 + overlapColumn);
            } else {
                const leftPx = Math.round(cellRect.left - scheduleRect.left + 4);
                const widthPx = Math.max(20, Math.round(cellRect.width - 8));

                classBlock.style.left = `${leftPx}px`;
                classBlock.style.width = `${widthPx}px`;
                classBlock.style.right = 'auto';
                classBlock.style.zIndex = '12';
            }

            classBlock.style.position = 'absolute';
            scheduleBody.appendChild(classBlock);
        } else {
            // non-export: keep legacy per-cell positioning behaviour
            minuteScale = 1; // px per minute when in interactive view
            const minuteOffsetLocal = startMinute % 60;
            const durationMinutesLocal = blockDuration;
            topPx = Math.round(minuteOffsetLocal * minuteScale);
            heightPx = Math.max(16, Math.round(durationMinutesLocal * minuteScale));

            if (overlapColumns > 1) {
                const horizontalPaddingPct = 4;
                const usablePct = 100 - (horizontalPaddingPct * 2);
                const columnWidthPct = usablePct / overlapColumns;
                const leftPct = horizontalPaddingPct + (columnWidthPct * overlapColumn);

                classBlock.style.left = `${leftPct}%`;
                classBlock.style.right = 'auto';
                classBlock.style.width = `${Math.max(15, columnWidthPct - 1)}%`;
                classBlock.style.zIndex = String(20 + overlapColumn);
            } else {
                classBlock.style.left = '4px';
                classBlock.style.right = '4px';
                classBlock.style.width = 'auto';
                classBlock.style.zIndex = '12';
            }

            startCell.appendChild(classBlock);
        }

        classBlock.style.top = `${topPx}px`;
        classBlock.style.height = `${heightPx}px`;
    }

    async exportCurrentScheduleAsIcs() {
        const currentOption = this.getCurrentOption();
        if (!currentOption) {
            this.showNotification('No hi ha cap horari actiu per exportar.', 'warning');
            return;
        }

        try {
            const icsContent = await this.buildIcsContent(currentOption);
            const filename = `${this.buildExportBaseName(currentOption)}.ics`;

            this.downloadTextFile(icsContent, filename, 'text/calendar;charset=utf-8');
            this.closeExportMenu();
            this.showNotification('Horari exportat correctament en format ICS', 'success');
        } catch (error) {
            console.error('Error exportant ICS:', error);
            this.showNotification('No s\'ha pogut exportar el fitxer ICS', 'error');
        }
    }

    async exportScheduleLegacy() {
        const currentOption = this.getCurrentOption();
        if (!currentOption) return;

        this.showNotification('Exportant horari...', 'info');

        setTimeout(() => {
            this.showNotification('Horari exportat correctament', 'success');
        }, 1000);
    }

    async saveSchedule() {
        const currentOption = this.getCurrentOption();
        if (!currentOption) return;

        try {
            const savedCalendars = StorageHelper.getItem(this.SAVED_CALENDARS_KEY, []);
            const calendarId = `saved-${Date.now()}`;
            const currentWeek = this.getCurrentWeek();
            const selectedTrimester = Number(currentOption?.selectedTrimester ?? this.generationData?.subjects?.selectedTrimester ?? null);
            const trimesterWindow = Number.isFinite(selectedTrimester) && window.AcademicCalendar && typeof window.AcademicCalendar.getTrimesterWindow === 'function'
                ? await window.AcademicCalendar.getTrimesterWindow(selectedTrimester)
                : null;
            const savedItem = {
                id: calendarId,
                name: `Horari ${savedCalendars.length + 1}`,
                createdAt: new Date().toISOString(),
                metrics: currentWeek?.metrics || null,
                selections: currentOption.selections || [],
                schedule: {
                    ...currentOption,
                    selectedTrimester: Number.isFinite(selectedTrimester) ? selectedTrimester : null,
                    trimesterWindow
                },
                selectedTrimester: Number.isFinite(selectedTrimester) ? selectedTrimester : null,
                trimesterWindow
            };

            savedCalendars.push(savedItem);
            StorageHelper.setItem(this.SAVED_CALENDARS_KEY, savedCalendars);
            StorageHelper.setItem(this.ACTIVE_SAVED_CALENDAR_KEY, calendarId);

            await this.persistCalendarEventsFromSchedule(savedItem);

            this.showNotification('Horari guardat correctament', 'success');

            setTimeout(() => {
                window.location.href = 'saved-calendars.html';
            }, 1200);
        } catch (error) {
            console.error('Error guardant horari:', error);
            this.showNotification('Error guardant l\'horari', 'error');
        }
    }

    async persistCalendarEventsFromSchedule(savedItem) {
        const existingEvents = StorageHelper.getItem(this.CALENDAR_EVENTS_KEY, []);
        const cleanEvents = (Array.isArray(existingEvents) ? existingEvents : []).filter(e => e.source !== 'saved-schedule');
        const generatedEvents = await this.buildEventsFromSchedule(savedItem.schedule, savedItem.id);
        StorageHelper.setItem(this.CALENDAR_EVENTS_KEY, [...cleanEvents, ...generatedEvents]);
    }

    async buildEventsFromSchedule(scheduleData, calendarId) {
        if (window.AcademicCalendar && typeof window.AcademicCalendar.buildScheduleEvents === 'function') {
            return window.AcademicCalendar.buildScheduleEvents(scheduleData, calendarId);
        }

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

                let startMinute = Number.isFinite(classInfo.startMinute) ? classInfo.startMinute : null;
                let endMinute = Number.isFinite(classInfo.endMinute) ? classInfo.endMinute : null;

                if (startMinute === null || endMinute === null) {
                    const timeRange = typeof classInfo.timeRange === 'string' ? classInfo.timeRange.split('-') : [];
                    if (timeRange.length === 2) {
                        const parsedStart = this.parseTimeToMinutes(timeRange[0]);
                        const parsedEnd = this.parseTimeToMinutes(timeRange[1]);
                        if (parsedStart !== null && parsedEnd !== null && parsedEnd > parsedStart) {
                            startMinute = parsedStart;
                            endMinute = parsedEnd;
                        }
                    }
                }

                if (startMinute === null || endMinute === null) {
                    const fallbackStartHour = Number(classInfo.start || 8);
                    const fallbackDurationMinutes = Number(classInfo.duration || 1) * 60;
                    startMinute = Math.round(fallbackStartHour * 60);
                    endMinute = startMinute + Math.round(fallbackDurationMinutes);
                }

                generatedEvents.push({
                    id: `generated-${calendarId}-${week}-${classIndex}`,
                    title: classInfo.name || classInfo.subjectCode || 'Classe',
                    date: `${classDate.getFullYear()}-${String(classDate.getMonth() + 1).padStart(2, '0')}-${String(classDate.getDate()).padStart(2, '0')}`,
                    startTime: this.formatMinutes(startMinute),
                    endTime: this.formatMinutes(endMinute),
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

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#ecc94b'};
            color: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Inicialitzar quan el DOM estigui carregat
document.addEventListener('DOMContentLoaded', () => {
    // expose instance for external helpers
    window.scheduleViewer = new ScheduleViewer();

    // Provide small global helpers so other pages can trigger the generation flow
    window.triggerGenerationFlow = function () {
        if (window.scheduleViewer && typeof window.scheduleViewer.openGenerationSummaryModal === 'function') {
            window.scheduleViewer.openGenerationSummaryModal();
            return true;
        }
        return false;
    };

    window.startGenerationNow = function () {
        if (window.scheduleViewer && typeof window.scheduleViewer.startGenerationFlow === 'function') {
            window.scheduleViewer.startGenerationFlow();
            return true;
        }
        return false;
    };
});

// Afegir animacions CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

/* Global helper functions for explanation panel and detail (requested snippet adapted) */
function renderExplanationPanel(data) {
    const total = Array.isArray(data?.options) ? data.options.length : 0;
    const summary = document.getElementById('summaryMessage');
    const totalSchedulesEl = document.getElementById('totalSchedules');
    if (summary) summary.textContent = `S'han trobat ${total} combinacions vàlides.`;
    if (totalSchedulesEl) totalSchedulesEl.textContent = String(total);

    // Try to reuse the viewer mapping if available
    if (window.scheduleViewer && typeof window.scheduleViewer.loadSchedulesFromGenerationData === 'function') {
        // set generationData.timetableResponse to the data and reload
        window.scheduleViewer.generationData = window.scheduleViewer.generationData || {};
        window.scheduleViewer.generationData.timetableResponse = data;
        window.scheduleViewer.loadSchedulesFromGenerationData(data);
        window.scheduleViewer.renderOptionsPanel();
        return;
    }

    const list = document.getElementById('optionsList');
    if (!list) return;
    list.innerHTML = '';

    (data.options || []).forEach((opt, idx) => {
        const card = document.createElement('div');
        card.className = 'option-card';
        card.dataset.index = idx;

        const h = document.createElement('div');
        h.className = 'opt-top';
        const title = document.createElement('div');
        title.className = 'opt-title';
        title.textContent = window.scheduleViewer && typeof window.scheduleViewer.getOptionCardLabel === 'function'
            ? window.scheduleViewer.getOptionCardLabel(opt, idx)
            : `Proposta ${idx + 1}`;
        h.appendChild(title);
        card.appendChild(h);

        const controls = document.createElement('div');
        controls.className = 'opt-controls';
        const openBtn = document.createElement('button');
        openBtn.className = 'open-btn';
        openBtn.textContent = 'Obrir horari';
        openBtn.addEventListener('click', () => {
            if (window.scheduleViewer) window.scheduleViewer.showOption(idx);
        });
        controls.appendChild(openBtn);

        const detailBtn = document.createElement('button');
        detailBtn.className = 'detail-btn';
        detailBtn.textContent = 'Veure detall';
        detailBtn.addEventListener('click', () => {
            openOptionDetail(opt);
        });
        controls.appendChild(detailBtn);

        card.appendChild(controls);
        list.appendChild(card);
    });
}

function isOptionConcordant(opt) {
    if (opt.explanationDetails && Array.isArray(opt.explanationDetails.subjects)) {
        return !opt.explanationDetails.subjects.some(s => (s.status || '').toLowerCase().includes('incomplet'));
    }
    return true;
}

function openOptionDetail(option) {
    // Build KPIs and groups from raw option object
    const kpiContainer = document.getElementById('detailKPIs');
    const groupsContainer = document.getElementById('detailGroups');
    if (!kpiContainer || !groupsContainer) return;

    const kpis = buildKPIsForOption(option) || {
        horesPerSetmana: '-',
        diesPerSetmana: '-',
        firstClass: '-'
    };
    kpiContainer.innerHTML = '';
    ['horesPerSetmana', 'diesPerSetmana', 'firstClass'].forEach(key => {
        const div = document.createElement('div');
        div.className = 'kpi-small';
        const label = key === 'horesPerSetmana' ? 'Hores/setmana' : key === 'diesPerSetmana' ? 'Dies/setmana' : 'Primera classe';
        div.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${escapeHtml(kpis[key] ?? '-')}</div>`;
        kpiContainer.appendChild(div);
    });

    groupsContainer.innerHTML = '';
    const subjects = option.explanationDetails && option.explanationDetails.subjects ? option.explanationDetails.subjects : deriveSubjectsFromOption(option);

    const table = document.createElement('table');
    table.className = 'detail-table';
    table.innerHTML = `<thead><tr><th>Assignatura</th><th>Teoria</th><th>Pràctiques</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    subjects.forEach(s => {
        const teoria = (s.groups && (s.groups['Teoria'] || s.groups['THEORY'])) || s.theoryGroup || s.teoria || '-';
        const practiques = (s.groups && (s.groups['Pràctiques'] || s.groups['PRACTICA'])) || s.practicesGroup || s.practica || '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(s.subjectCode || '')}</td><td>${escapeHtml(teoria)}</td><td>${escapeHtml(practiques)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    groupsContainer.appendChild(table);

    const modal = document.getElementById('optionDetailModal');
    if (modal) modal.setAttribute('aria-hidden', 'false');
}

function deriveSubjectsFromOption(option) {
    const map = {};
    const all = [].concat(option.firstWeekSlots || [], option.secondWeekSlots || [], option.slots || []);
    all.forEach(s => {
        const code = s.subjectCode || s.subject || s.codi || '-';
        const type = (s.sessionType || s.session_type || s.type || 'General').toString();
        const group = s.groupCode || s.group || s.grup || '-';
        map[code] = map[code] || { subjectCode: code, groups: {} };
        // classify into theory/practice key
        const key = /practic/i.test(type) || /^G\d{3,}$/i.test(String(group)) ? 'Pràctiques' : 'Teoria';
        map[code].groups[key] = map[code].groups[key] ? `${map[code].groups[key]}, ${group}` : group;
    });
    return Object.values(map).map(v => ({ subjectCode: v.subjectCode, groups: v.groups }));
}

function buildKPIsForOption(option) {
    const all = [].concat(option.firstWeekSlots || [], option.secondWeekSlots || [], option.slots || []);
    if (all.length === 0) return { horesPerSetmana: '0h', diesPerSetmana: 0, primeraClasse: '--:--' };

    const weeks = Array.isArray(option?.weeks) && option.weeks.length > 0
        ? option.weeks.length
        : (Array.isArray(option?.firstWeekSlots) && Array.isArray(option?.secondWeekSlots) ? 2 : 1);

    let totalMin = 0;
    const daysSet = new Set();
    let firstStart = 24 * 60;

    all.forEach(s => {
        const range = s.timeRange || s.timeRangeRaw || s.timeRangeRawString || '';
        const parsed = parseTimeFromRange(range);
        const start = Number(s.startMinute ?? s.start) || parsed.start;
        const end = Number(s.endMinute ?? s.end) || parsed.end;
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            totalMin += (end - start);
            if (s.dayOfWeek) daysSet.add(s.dayOfWeek);
            if (start < firstStart) firstStart = start;
        }
    });

    const dies = Math.max(1, Math.round(daysSet.size / weeks));
    const weeklyMinutes = Math.round(totalMin / weeks);
    const primera = firstStart === 24 * 60 ? '--:--' : formatTimeFromMinutes(firstStart);

    return {
        horesPerSetmana: `${Math.floor(weeklyMinutes / 60)}h${weeklyMinutes % 60 ? ' ' + (weeklyMinutes % 60) + 'min' : ''}`,
        diesPerSetmana: dies,
        primeraClasse: primera
    };
}

function parseTimeFromRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return { start: 0, end: 0 };
    const parts = rangeStr.split('-').map(p => p.trim());
    if (parts.length !== 2) return { start: 0, end: 0 };
    const start = parseTimeToMinutes(parts[0]);
    const end = parseTimeToMinutes(parts[1]);
    return { start: start || 0, end: end || 0 };
}

function parseTimeToMinutes(value) {
    const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return 0;
    const h = Number(match[1]), m = Number(match[2]);
    return h * 60 + m;
}

function calculateGapHours(allSlots) {
    // Simple approximation: sum gaps between sessions per day >15min
    const byDay = {};
    allSlots.forEach(s => {
        const range = s.timeRange || '';
        const p = parseTimeFromRange(range);
        const day = Number(s.dayOfWeek) || 0;
        if (!byDay[day]) byDay[day] = [];
        if (p.start && p.end) byDay[day].push([p.start, p.end]);
    });
    let gapMin = 0;
    Object.values(byDay).forEach(arr => {
        arr.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < arr.length; i++) {
            const prevEnd = arr[i - 1][1];
            const curStart = arr[i][0];
            const rawGap = Math.max(0, curStart - prevEnd);
            if (rawGap > 15) gapMin += (rawGap - 15);
        }
    });
    if (gapMin === 0) return '0h';
    return `${Math.floor(gapMin / 60)}h${gapMin % 60 ? ' ' + (gapMin % 60) + 'min' : ''}`;
}

function formatTimeFromMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '--:--';
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function escapeHtml(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hexToRgba(hex, alpha = 0.125) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
