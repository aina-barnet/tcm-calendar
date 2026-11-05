document.addEventListener('DOMContentLoaded', () => {
    const profileForm = document.getElementById('profile-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const summaryFullName = document.getElementById('summaryFullName');
    const summaryAcademic = document.getElementById('summaryAcademic');
    const summaryPreferences = document.getElementById('summaryPreferences');
    const summarySubjects = document.getElementById('summarySubjects');
    const manageSubjectsLink = document.getElementById('manage-subjects-link');

    // Cached commonly used inputs to reduce repeated DOM queries
    const inputFirstName = document.getElementById('firstName');
    const inputLastNames = document.getElementById('lastNames');
    const inputDegree = document.getElementById('degree');
    const inputAcademicYear = document.getElementById('academicYear');

    // Subject catalog cache keyed by degree code. Each entry is a map: { subjectCode: subjectName }
    const subjectCatalogsCache = {};

    // Load subject catalog for a specific degree from backend API
    async function loadSubjectCatalogForDegree(degree) {
        if (!degree) return {};
        if (subjectCatalogsCache[degree]) return subjectCatalogsCache[degree];

        try {
            const result = await APIHelper.get(`http://localhost:8080/api/subjects/degree/${encodeURIComponent(degree)}`);
            if (!result.ok) {
                console.warn('Could not load subject catalog for degree', degree, result.status);
                subjectCatalogsCache[degree] = {};
                return subjectCatalogsCache[degree];
            }

            const payload = result.data;
            let map = {};

            if (Array.isArray(payload)) {
                // Expecting array of subjects: [{ code: 'GEI-101', name: '...' }, ...]
                payload.forEach(item => {
                    if (!item) return;
                    const code = item.code || item.subjectCode || item.id || item.key;
                    const name = item.name || item.title || item.label || item.subjectName || item.displayName || item;
                    if (code) map[code] = name;
                });
            } else if (payload && typeof payload === 'object') {
                // If API returns a map, use it directly
                map = payload;
            }

            subjectCatalogsCache[degree] = map;
            return map;
        } catch (err) {
            console.error('Failed to fetch subject catalog for degree', degree, err);
            subjectCatalogsCache[degree] = {};
            return subjectCatalogsCache[degree];
        }
    }

    let persistedProfile = null;
    let isHydratingProfile = false;
    let profileAutosaveTimer = null;
    let profileSaveQueue = Promise.resolve();

    const PROFILE_AUTOSAVE_DELAY_MS = 500;

    // Official degree codes -> Catalan full names
    const degreeNames = {
        'GEEIA': 'Grau en Enginyeria Electrònica Industrial i Automàtica',
        'GEIGSI': 'Grau en Enginyeria Informàtica de Gestió i Sistemes d\'Informació',
        'GEM': 'Grau en Enginyeria Mecànica',
        'GEIGDP': 'Doble grau en Informàtica de Gestió i Sistemes d\'Informació i Disseny i Producció de Videojocs',
        'GEEIA+GEM': 'Graus simultanis d\'Enginyeria Electrònica Industrial i Automàtica i Enginyeria Mecànica',
        'GEOI': 'Grau en Enginyeria d\'Organització Industrial',
        'GEEIA+GEIGSI': 'Graus simultanis d\'Enginyeria Electrònica Industrial i Automàtica i Enginyeria Informàtica de Gestió i Sistemes d\'Informació'
    };

    // Funció per obtenir el nom complet d'un grau a partir del codi
    function getDegreeName(degreeCode) {
        return degreeNames[degreeCode] || degreeCode;
    }

    function safeJsonParse(raw, defaultValue) {
        try {
            return JSON.parse(raw);
        } catch (err) {
            console.error('Failed to parse JSON:', err, raw);
            return defaultValue;
        }
    }

    function getEmptySelectionData() {
        return {
            selectedSubjects: [],
            totalEcts: 0,
            selectedTrimester: null,
            selectedCourse: null,
            selectedSubjectDetails: []
        };
    }

    function getDefaultPreferencesData() {
        return {
            optimization: 'minimize-gaps',
            freeDayPreference: null,
            preferredTime: null,
            isEmployed: null,
            transportMode: null,
            noMornings: false,
            noEvenings: false,
            noNoon: false
        };
    }

    function getUserDegreeKey(username, degree) {
        if (!username || !degree) {
            return '';
        }

        return `${username}::${degree}`;
    }

    function buildProfilePayload() {
        const academicYearValue = inputAcademicYear?.value || '';
        const currentProfile = persistedProfile || {};

        return {
            firstName: inputFirstName?.value.trim() || '',
            lastNames: inputLastNames?.value.trim() || '',
            dateOfBirth: currentProfile.dateOfBirth || null,
            phoneNumber: currentProfile.phoneNumber || null,
            degree: inputDegree?.value || null,
            academicYear: academicYearValue ? parseInt(academicYearValue, 10) : null,
            isEmployed: currentProfile.isEmployed ?? null,
            transportMode: currentProfile.transportMode || null,
            preferredTime: currentProfile.preferredTime || null,
            freeDayPreference: currentProfile.freeDayPreference || null,
            avatar: AuthState.getAvatar() || null,
            optimization: currentProfile.optimization || null,
            noMornings: currentProfile.noMornings ?? null,
            noEvenings: currentProfile.noEvenings ?? null,
            noNoon: currentProfile.noNoon ?? null,
            selectedSubjects: currentProfile.selectedSubjects || null
        };
    }

    function syncProfileAfterSave(savedProfile) {
        persistedProfile = savedProfile;

        if (!savedProfile) {
            return;
        }

        const savedDegree = savedProfile.degree || inputDegree?.value || '';
        if (savedDegree) {
            inputDegree.dataset.previousDegree = savedDegree;
            savePreferencesStorage(getUserDegreeKey(username, savedDegree), savedProfile || getDefaultPreferencesData());
        }

        if (savedProfile.avatar) {
            AuthState.setAvatar(savedProfile.avatar);
            if (headerPhoto) headerPhoto.src = savedProfile.avatar;
        }

        updateSelectPlaceholderStyles();
        refreshProfileSummaryFromForm();
    }

    async function executeProfileSave({redirectAfterSave = false, silent = false} = {}) {
        if (isHydratingProfile) {
            return null;
        }

        const formData = buildProfilePayload();

        try {
            const result = await APIHelper.put(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, formData);

            if (result.ok) {
                syncProfileAfterSave(result.data || formData);
                if (redirectAfterSave) {
                    window.location.href = 'tcm-calendar.html';
                }
                return result;
            }

            if (result.status === 401 || result.status === 403) {
                AuthState.handleInvalidSession();
                return result;
            }

            const errorMessage = result.error || 'Error al desar les dades. Si us plau, torna-ho a provar.';
            if (!silent) {
                showPopup(errorMessage, 'error');
            } else {
                console.warn('Profile autosave failed:', errorMessage);
            }
            return result;
        } catch (error) {
            console.error('Profile save failed:', error);
            if (!silent) {
                showPopup('Error de connexió. Si us plau, comprova la teva connexió a internet.', 'error');
            }
            return {
                ok: false,
                status: 0,
                error: error?.message || 'Network error'
            };
        }
    }

    function saveProfileChanges(options = {}) {
        profileSaveQueue = profileSaveQueue
            .then(() => executeProfileSave(options), () => executeProfileSave(options));

        return profileSaveQueue;
    }

    function scheduleProfileAutosave() {
        if (isHydratingProfile) {
            return;
        }

        if (profileAutosaveTimer) {
            clearTimeout(profileAutosaveTimer);
        }

        profileAutosaveTimer = window.setTimeout(() => {
            profileAutosaveTimer = null;
            void saveProfileChanges({silent: true});
        }, PROFILE_AUTOSAVE_DELAY_MS);
    }

    function normalizePreferencesEntry(source = {}, fallback = getDefaultPreferencesData()) {
        const restrictions = source.restrictions || {};

        return {
            optimization: source.optimization != null && source.optimization !== '' ? source.optimization : fallback.optimization,
            freeDayPreference: source.freeDayPreference != null && source.freeDayPreference !== '' ? source.freeDayPreference : fallback.freeDayPreference,
            preferredTime: source.preferredTime != null && source.preferredTime !== '' ? source.preferredTime : fallback.preferredTime,
            isEmployed: source.isEmployed != null ? source.isEmployed : fallback.isEmployed,
            transportMode: source.transportMode != null && source.transportMode !== '' ? source.transportMode : fallback.transportMode,
            noMornings: source.noMornings != null ? Boolean(source.noMornings) : Boolean(restrictions.noMornings ?? fallback.noMornings),
            noEvenings: source.noEvenings != null ? Boolean(source.noEvenings) : Boolean(restrictions.noEvenings ?? fallback.noEvenings),
            noNoon: source.noNoon != null ? Boolean(source.noNoon) : Boolean(restrictions.noNoon ?? fallback.noNoon)
        };
    }

    function readPreferencesStorage(fallbackUserDegreeKey = '') {
        const raw = sessionStorage.getItem('preferences');
        if (!raw) {
            return {
                currentUserDegreeKey: fallbackUserDegreeKey,
                preferencesByKey: {}
            };
        }

        const parsed = safeJsonParse(raw, null);
        if (parsed && typeof parsed === 'object' && parsed.preferencesByKey && typeof parsed.preferencesByKey === 'object') {
            return {
                currentUserDegreeKey: typeof parsed.currentUserDegreeKey === 'string' ? parsed.currentUserDegreeKey : fallbackUserDegreeKey,
                preferencesByKey: parsed.preferencesByKey
            };
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
            const storage = {
                currentUserDegreeKey: fallbackUserDegreeKey,
                preferencesByKey: {}
            };

            if (fallbackUserDegreeKey) {
                storage.preferencesByKey[fallbackUserDegreeKey] = normalizePreferencesEntry(parsed);
            }

            return storage;
        }

        return {
            currentUserDegreeKey: fallbackUserDegreeKey,
            preferencesByKey: {}
        };
    }

    function savePreferencesStorage(userDegreeKey, preferences) {
        if (!userDegreeKey) return;

        const storage = readPreferencesStorage(userDegreeKey);
        storage.currentUserDegreeKey = userDegreeKey;
        storage.preferencesByKey[userDegreeKey] = normalizePreferencesEntry(preferences);
        sessionStorage.setItem('preferences', JSON.stringify(storage));
    }

    function readSelectedSubjectsStorage(fallbackCurrentDegree = '') {
        const raw = sessionStorage.getItem('selectedSubjects');
        if (!raw) {
            return {
                currentDegree: fallbackCurrentDegree,
                selectionsByDegree: {}
            };
        }

        const parsed = safeJsonParse(raw, null);
        if (parsed && typeof parsed === 'object' && parsed.selectionsByDegree && typeof parsed.selectionsByDegree === 'object') {
            return {
                currentDegree: typeof parsed.currentDegree === 'string' ? parsed.currentDegree : fallbackCurrentDegree,
                selectionsByDegree: parsed.selectionsByDegree
            };
        }

        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.selectedSubjects)) {
            const currentDegree = typeof parsed.currentDegree === 'string' ? parsed.currentDegree : '';
            const storage = {
                currentDegree,
                selectionsByDegree: {}
            };

            if (currentDegree) {
                storage.selectionsByDegree[currentDegree] = {
                    selectedSubjects: parsed.selectedSubjects,
                    totalEcts: Number(parsed.totalEcts) || 0,
                    selectedTrimester: Number.isFinite(Number(parsed.selectedTrimester)) ? Number(parsed.selectedTrimester) : null,
                    selectedSubjectDetails: Array.isArray(parsed.selectedSubjectDetails) ? parsed.selectedSubjectDetails : []
                };
            }

            return storage;
        }

        return {
            currentDegree: fallbackCurrentDegree,
            selectionsByDegree: {}
        };
    }

    // Verificar autenticación usando AuthState
    if (!AuthState.isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    const user = AuthState.getUser();

    // Usar username para las llamadas al API (es la clave primaria en el backend)
    function resolveUsername(u) {
        return AuthHelper.resolveUsername(u);
    }

    const username = resolveUsername(user);

    if (!username) {
        window.location.href = 'login.html';
        return;
    }

    // Actualizar foto de perfil en el header usando AuthState
    const headerPhoto = document.getElementById('header-photo');
    if (headerPhoto) headerPhoto.src = AuthState.getAvatar();

    isHydratingProfile = true;
    Promise.resolve(loadUserProfile())
        .finally(() => {
            isHydratingProfile = false;
        });
    refreshProfileSummaryFromForm();

    // Funció per actualitzar l'estil dels selects amb placeholder
    const allSelects = document.querySelectorAll('.form-group select');

    function updateSelectPlaceholderStyles() {
        allSelects.forEach(select => select.classList.toggle('placeholder-selected', select.value === '' || select.value === null));
    }

    // Afegir event listeners a tots els selects per actualitzar estil i desar automàticament
    allSelects.forEach(select => select.addEventListener('change', () => {
        updateSelectPlaceholderStyles();
        refreshProfileSummaryFromForm();
        scheduleProfileAutosave();
    }));

    // When degree changes, fetch the subject catalog for that degree and refresh summary
    if (inputDegree) {
        inputDegree.addEventListener('change', async () => {
            const oldDegree = inputDegree.dataset.previousDegree || persistedProfile?.degree || '';
            const newDegree = inputDegree.value || '';
            const storage = readSelectedSubjectsStorage(oldDegree || newDegree);

            if (oldDegree) {
                storage.currentDegree = oldDegree;
                if (!storage.selectionsByDegree[oldDegree]) {
                    storage.selectionsByDegree[oldDegree] = getEmptySelectionData();
                }
            }

            if (newDegree) {
                if (!storage.selectionsByDegree[newDegree]) {
                    storage.selectionsByDegree[newDegree] = getEmptySelectionData();
                }
                storage.currentDegree = newDegree;
            }

            sessionStorage.setItem('selectedSubjects', JSON.stringify(storage));

            const oldUserDegreeKey = getUserDegreeKey(username, oldDegree);
            const newUserDegreeKey = getUserDegreeKey(username, newDegree);
            const preferencesStorage = readPreferencesStorage(oldUserDegreeKey || newUserDegreeKey);

            if (oldUserDegreeKey) {
                preferencesStorage.currentUserDegreeKey = oldUserDegreeKey;
                preferencesStorage.preferencesByKey[oldUserDegreeKey] = normalizePreferencesEntry(persistedProfile || getDefaultPreferencesData());
            }

            if (newUserDegreeKey) {
                if (!preferencesStorage.preferencesByKey[newUserDegreeKey]) {
                    preferencesStorage.preferencesByKey[newUserDegreeKey] = getDefaultPreferencesData();
                }
                preferencesStorage.currentUserDegreeKey = newUserDegreeKey;
                persistedProfile = {
                    ...(persistedProfile || {}),
                    degree: newDegree,
                    ...normalizePreferencesEntry(preferencesStorage.preferencesByKey[newUserDegreeKey])
                };
            }

            sessionStorage.setItem('preferences', JSON.stringify(preferencesStorage));

            inputDegree.dataset.previousDegree = newDegree;

            // show loading state for subjects
            if (summarySubjects) {
                summarySubjects.innerHTML = '';
                const li = document.createElement('li');
                li.textContent = 'Carregant assignatures...';
                summarySubjects.appendChild(li);
            }
            updateSubjectsAvailability(''); // temporarily disable manage link
            try {
                await loadSubjectCatalogForDegree(inputDegree.value);
            } catch (e) {
                console.error('Error loading subjects on degree change', e);
            }
            updateSelectPlaceholderStyles();
            refreshProfileSummaryFromForm();
            scheduleProfileAutosave();
        });
    }

    // Inputs within the profile form trigger summary refresh
    if (profileForm) {
        profileForm.querySelectorAll('input, select').forEach(field => {
            field.addEventListener('input', () => {
                refreshProfileSummaryFromForm();
                scheduleProfileAutosave();
            });
            field.addEventListener('change', () => {
                updateSelectPlaceholderStyles();
                refreshProfileSummaryFromForm();
                scheduleProfileAutosave();
            });
        });
    }

    // Inicialitzar estils dels selects
    updateSelectPlaceholderStyles();

    function parseSubjectCourse(subjectCode) {
        const normalizedCode = String(subjectCode || '').replace(/(?:__T|_)[1-9]\d*$/, '');
        const match = normalizedCode.match(/-(\d)\d\d$/);
        return match ? parseInt(match[1], 10) : null;
    }

    function formatAcademicYearLabel(yearValue) {
        const year = parseInt(yearValue, 10);
        const labels = {
            1: '1r curs',
            2: '2n curs',
            3: '3r curs',
            4: '4t curs',
            5: '5e curs',
            6: '6e curs'
        };
        return labels[year] || `${year}e curs`;
    }

    function setSummaryList(container, items, emptyMessage) {
        if (!container) return;
        container.innerHTML = '';

        const list = (items && items.length > 0) ? items : [emptyMessage];
        list.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            container.appendChild(li);
        });
    }

    function formatOptimizationLabel(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const labels = {
            'minimize-gaps': 'Minimitzar hores mortes',
            'free-day': 'Deixar un dia lliure',
            'balanced': 'Distribució equilibrada',
            'avoid-early': 'No tenir classe a primera hora',
            'avoid-late': 'No tenir classe a última hora',
            'group-by-type': 'Concentrar per tipus de classe'
        };

        return labels[normalized] || normalized;
    }

    function formatTransportModeLabel(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const labels = {
            car: 'cotxe',
            coche: 'cotxe',
            motorcycle: 'motocicleta',
            moto: 'moto',
            bus: 'autobús',
            train: 'tren',
            tren: 'tren',
            walking: 'a peu',
            walking_mode: 'a peu',
            bike: 'bicicleta',
            bicycle: 'bicicleta',
            public_transport: 'transport públic',
            'public-transport': 'transport públic',
            'transport-public': 'transport públic'
        };

        if (labels[normalized]) {
            return labels[normalized];
        }

        return normalized ? normalized.replace(/[-_]+/g, ' ') : '';
    }

    function formatDayLabel(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const labels = {
            monday: 'dilluns',
            dilluns: 'dilluns',
            tuesday: 'dimarts',
            dimarts: 'dimarts',
            wednesday: 'dimecres',
            dimecres: 'dimecres',
            thursday: 'dijous',
            dijous: 'dijous',
            friday: 'divendres',
            divendres: 'divendres'
        };

        return labels[normalized] || normalized;
    }

    function formatPreferredTimeLabel(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const labels = {
            morning: 'matins',
            afternoon: 'tardes'
        };

        return labels[normalized] || normalized;
    }

    function updateSubjectsAvailability(degree) {
        if (!manageSubjectsLink) return;

        const hasDegree = Boolean(degree && degree.trim());
        manageSubjectsLink.classList.toggle('is-disabled', !hasDegree);
        manageSubjectsLink.setAttribute('aria-disabled', hasDegree ? 'false' : 'true');
        manageSubjectsLink.tabIndex = hasDegree ? 0 : -1;
    }

    function readSelectedSubjects(degree) {
        if (!degree) return [];
        const storage = readSelectedSubjectsStorage(degree);
        const degreeSelection = storage.selectionsByDegree?.[degree];
        if (!degreeSelection || !Array.isArray(degreeSelection.selectedSubjects)) return [];
        return degreeSelection.selectedSubjects;
    }

    function refreshProfileSummaryFromForm() {
        if (!summaryFullName || !summaryAcademic || !summaryPreferences || !summarySubjects) return;

        const firstName = (inputFirstName?.value || '').trim();
        const lastNames = (inputLastNames?.value || '').trim();
        const degree = inputDegree?.value || '';
        const academicYear = inputAcademicYear?.value || '';

        const fullName = `${firstName} ${lastNames}`.trim();
        summaryFullName.textContent = fullName || 'No disponible';

        const degreeDisplayName = degree ? getDegreeName(degree) : '';
        summaryAcademic.textContent = degreeDisplayName
            ? (academicYear ? `${degreeDisplayName} · ${formatAcademicYearLabel(academicYear)}` : degreeDisplayName)
            : 'No disponible';

        updateSubjectsAvailability(degree);

        const prefs = persistedProfile || getDefaultPreferencesData();
        const preferenceItems = [];

        if (prefs.isEmployed === true) {
            preferenceItems.push('Situació laboral: estudio i treballo');
        } else if (prefs.isEmployed === false) {
            preferenceItems.push('Situació laboral: només estudio');
        }

        if (prefs.transportMode) {
            preferenceItems.push(`Transport: ${formatTransportModeLabel(prefs.transportMode)}`);
        }

        if (prefs.optimization) {
            preferenceItems.push(`Preferència d'horari: ${formatOptimizationLabel(prefs.optimization)}`);
        }

        setSummaryList(summaryPreferences, preferenceItems, 'Encara no hi ha preferències guardades.');

        if (!degree) {
            setSummaryList(summarySubjects, [], 'Selecciona primer un grau per veure assignatures.');
            return;
        }

        const selectedSubjectCodes = Array.isArray(persistedProfile?.selectedSubjects)
        && persistedProfile.selectedSubjects.length > 0
        && degree === (persistedProfile?.degree || '')
            ? persistedProfile.selectedSubjects
            : readSelectedSubjects(degree);
        const targetCourse = academicYear ? parseInt(academicYear, 10) : null;
        const subjectsForCourse = targetCourse
            ? selectedSubjectCodes.filter(code => parseSubjectCourse(code) === targetCourse)
            : selectedSubjectCodes;

        const catalog = subjectCatalogsCache[degree] || {};
        // If there are no available subjects for this degree
        const catalogIsEmpty = Object.keys(catalog).length === 0;
        const selectedOrRead = (subjectsForCourse.length > 0 ? subjectsForCourse : selectedSubjectCodes);

        if (catalogIsEmpty && selectedOrRead.length === 0) {
            setSummaryList(summarySubjects, [], 'No hi ha assignatures disponibles per aquest grau.');
            return;
        }

        const subjectItems = selectedOrRead.map(code => catalog[code] ? `${code} · ${catalog[code]}` : code);
        setSummaryList(summarySubjects, subjectItems, 'Encara no hi ha assignatures seleccionades.');
    }

    if (manageSubjectsLink) {
        manageSubjectsLink.addEventListener('click', (event) => {
            const degree = inputDegree?.value;
            if (!degree) {
                event.preventDefault();
                showPopup('Primer has de seleccionar un grau per poder veure i seleccionar assignatures.', 'error');
            }
        });
    }

    if (profileForm) profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (profileAutosaveTimer) {
            clearTimeout(profileAutosaveTimer);
            profileAutosaveTimer = null;
        }

        await saveProfileChanges({redirectAfterSave: true});
    });

    if (cancelBtn) cancelBtn.addEventListener('click', () => window.location.href = 'tcm-calendar.html');

    // Lògica per eliminar compte
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        async function performAccountDeletion() {
            try {
                const result = await APIHelper.delete(`http://localhost:8080/api/authenticate/delete/${encodeURIComponent(username)}`);
                if (result.ok || result.status === 204) {
                    AuthState.logout();
                } else if (result.status === 401 || result.status === 403) {
                    AuthState.handleInvalidSession();
                } else {
                    showPopup(result.error || 'Error al eliminar el compte. Si us plau, torna-ho a provar.', 'error');
                }
            } catch (error) {
                console.error('Account deletion failed:', error);
                showPopup('Error de connexió. Si us plau, comprova la teva connexió a internet.', 'error');
            }
        }

        deleteAccountBtn.addEventListener('click', async () => {
            showPopup('Estàs segur que vols eliminar el teu compte? Aquesta acció és irreversible.', 'error', async () => {
                showPopup('ATENCIÓ: Totes les teves dades seran eliminades permanentment. Vols continuar?', 'error', performAccountDeletion, {confirm: true});
            }, {confirm: true});
        });
    }

    async function loadUserProfile() {
        try {
            const result = await APIHelper.get(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`);

            if (result.status === 404) {
                // Usuari nou - intentar pre-emplenar des de les dades d'autenticació
                if (user) {
                    if (user.name && user.name !== user.username) {
                        const nameParts = user.name.split(' ');
                        inputFirstName.value = nameParts[0] || '';
                        inputLastNames.value = nameParts.slice(1).join(' ') || '';
                        refreshProfileSummaryFromForm();
                    } else if (user.email) {
                        const emailPart = user.email.split('@')[0];
                        const separators = /[.\-_]/;
                        const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
                        if (separators.test(emailPart)) {
                            const parts = emailPart.split(separators);
                            if (parts.length >= 2) {
                                inputFirstName.value = capitalize(parts[0]);
                                inputLastNames.value = parts.slice(1).map(capitalize).join(' ');
                                refreshProfileSummaryFromForm();
                            }
                        } else {
                            inputFirstName.value = capitalize(emailPart);
                            refreshProfileSummaryFromForm();
                        }
                    }
                }
                return;
            }

            if (result.status === 401 || result.status === 403) {
                AuthState.handleInvalidSession();
                return;
            }

            if (!result.ok) {
                console.error('Error carregant el perfil:', result.status);
                return;
            }

            // Cas normal: perfil existent (200 OK)
            const userData = result.data;
            persistedProfile = userData;

            if (userData) {
                inputFirstName.value = userData.firstName || '';
                inputLastNames.value = userData.lastNames || '';
                inputDegree.value = userData.degree || '';
                inputDegree.dataset.previousDegree = userData.degree || '';
                inputAcademicYear.value = userData.academicYear ? String(userData.academicYear) : '';

                const degreeKey = getUserDegreeKey(username, userData.degree || '');
                if (degreeKey) {
                    const preferencesStorage = readPreferencesStorage(degreeKey);
                    preferencesStorage.currentUserDegreeKey = degreeKey;
                    preferencesStorage.preferencesByKey[degreeKey] = normalizePreferencesEntry(userData, getDefaultPreferencesData());
                    sessionStorage.setItem('preferences', JSON.stringify(preferencesStorage));
                }

                if (userData.degree) {
                    const storage = readSelectedSubjectsStorage(userData.degree);
                    storage.currentDegree = userData.degree;
                    const existingSelection = storage.selectionsByDegree[userData.degree] || getEmptySelectionData();
                    const existingSelectedSubjects = Array.isArray(existingSelection.selectedSubjects)
                        ? existingSelection.selectedSubjects
                        : [];
                    const backendSelectedSubjects = Array.isArray(userData.selectedSubjects)
                        ? userData.selectedSubjects
                        : [];
                    storage.selectionsByDegree[userData.degree] = {
                        ...getEmptySelectionData(),
                        ...existingSelection,
                        selectedSubjects: existingSelectedSubjects.length > 0
                            ? existingSelectedSubjects
                            : backendSelectedSubjects
                    };
                    sessionStorage.setItem('selectedSubjects', JSON.stringify(storage));
                }

                // Preload subject catalog for the user's degree so summaries can show names
                if (userData.degree) await loadSubjectCatalogForDegree(userData.degree);

                updateSelectPlaceholderStyles();
                refreshProfileSummaryFromForm();

                if (userData.avatar) {
                    AuthState.setAvatar(userData.avatar);
                    if (headerPhoto) headerPhoto.src = userData.avatar;
                    const avatarOptions = document.querySelectorAll('.avatar-option');
                    avatarOptions.forEach(option => {
                        option.classList.remove('selected');
                        if (option.dataset.avatar === userData.avatar) option.classList.add('selected');
                    });
                }
            }

        } catch (error) {
            console.error('Failed to load user profile:', error);
        }
    }
});