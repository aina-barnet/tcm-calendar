// Populate review summary and handle Generate action
document.addEventListener('DOMContentLoaded', async () => {
    function loadSelectedSubjectsStorage() {
        const raw = sessionStorage.getItem('selectedSubjects');
        if (!raw) return { currentDegree: '', selectionsByDegree: {} };
        try {
            return JSON.parse(raw);
        } catch (e) {
            return { currentDegree: '', selectionsByDegree: {} };
        }
    }

    function getAuthHeadersSafe() {
        try {
            if (typeof AuthState !== 'undefined' && AuthState.getAuthHeaders) {
                return AuthState.getAuthHeaders();
            }
            if (typeof AuthState !== 'undefined' && AuthState.getToken) {
                const token = AuthState.getToken();
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                return headers;
            }
        } catch (e) {
            // ignore
        }
        return { 'Content-Type': 'application/json' };
    }

    async function fetchSubjectsForDegree(degree) {
        if (!degree) return [];
        try {
            const url = `http://localhost:8080/api/subjects/degree/${encodeURIComponent(degree)}`;
            const result = await APIHelper.get(url);
            if (!result.ok) return [];
            const data = result.data;
            if (!Array.isArray(data)) return [];
            return data;
        } catch (e) {
            console.error('Error fetching subjects for degree:', e);
            return [];
        }
    }

    async function fetchProfile(username) {
        if (!username) return null;
        try {
            const url = `http://localhost:8080/api/profile/${encodeURIComponent(username)}`;
            const result = await APIHelper.get(url);
            if (!result.ok) return null;
            return result.data;
        } catch (e) {
            console.error('Error fetching profile:', e);
            return null;
        }
    }

    function getDegreeLabel(degree) {
        const labels = {
            GEEIA: 'Grau en Enginyeria Electrònica Industrial i Automàtica',
            GEIGSI: 'Grau en Enginyeria Informàtica de Gestió i Sistemes d\'Informació',
            GEM: 'Grau en Enginyeria Mecànica',
            GEIGDP: 'Doble grau en Informàtica de Gestió i Sistemes d\'Informació i Disseny i Producció de Videojocs',
            'GEEIA+GEM': 'Graus simultanis d\'Enginyeria Electrònica Industrial i Automàtica i Enginyeria Mecànica',
            GEOI: 'Grau en Enginyeria d\'Organització Industrial',
            'GEEIA+GEIGSI': 'Graus simultanis d\'Enginyeria Electrònica Industrial i Automàtica i Enginyeria Informàtica de Gestió i Sistemes d\'Informació'
        };

        return labels[degree] || degree || 'Grau no definit';
    }

    function normalizeSubjectText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    function isThesisSubject(subject) {
        const type = normalizeSubjectText(subject?.type);
        const name = normalizeSubjectText(subject?.name);
        const code = normalizeSubjectText(subject?.code);

        return type === 'tfg'
            || type.includes('treballfidagrau')
            || type.includes('treballfinaldegrau')
            || name.includes('treballfidagrau')
            || name.includes('treballfinaldegrau')
            || code.includes('tfg');
    }

    function getSemesterLabel(value) {
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
            return '';
        }

        const map = { 1: '1r trimestre', 2: '2n trimestre', 3: '3r trimestre' };
        return map[Number(value)] || 'Trimestre';
    }

    function getPreferenceLabel(value, type) {
        const maps = {
            optimization: {
                'minimize-gaps': 'Minimitzar hores mortes',
                'free-day': 'Deixar un dia lliure',
                'balanced': 'Distribució equilibrada',
                'avoid-early': 'No tenir classe a primera hora',
                'avoid-late': 'No tenir classe a última hora',
                'group-by-type': 'Concentrar per tipus de classe'
            }
        };

        if (value == null || value === '') {
            return 'Sense preferència';
        }

        const key = String(value);
        return maps[type]?.[key] || key;
    }

    function renderSubjectCard(subject) {
        const item = document.createElement('article');
        item.className = 'review-subject-card';

        const code = subject?.code || '---';
        const name = subject?.name || subject?.title || 'Assignatura';
        const ects = subject?.ects ?? 0;
        const semester = getSemesterLabel(subject?.semester);
        const type = subject?.type || 'Tipus no definit';
        const semesterMarkup = semester ? `<span>${semester}</span>` : '';

        item.innerHTML = `
            <div class="review-subject-top">
                <span class="review-code-chip">${code}</span>
                <span class="review-ects-chip">${ects} ECTS</span>
            </div>
            <h3>${name}</h3>
            <div class="review-subject-meta">
                ${semesterMarkup}
                <span>${type}</span>
            </div>
        `;

        return item;
    }

    const storage = loadSelectedSubjectsStorage();
    let degree = storage.currentDegree || Object.keys(storage.selectionsByDegree)[0] || '';
    let entry = (storage.selectionsByDegree || {})[degree] || { selectedSubjects: [], totalEcts: 0 };
    let details = Array.isArray(entry.selectedSubjectDetails) ? entry.selectedSubjectDetails : [];

    // Load/normalize preferences from sessionStorage; if missing, attempt to get from backend
    const rawPrefs = sessionStorage.getItem('preferences');
    let preferences = {};
    try {
        if (rawPrefs) {
            const parsed = JSON.parse(rawPrefs);
            if (parsed && parsed.preferencesByKey && parsed.currentUserDegreeKey) {
                preferences = parsed.preferencesByKey[parsed.currentUserDegreeKey] || {};
            } else if (parsed && (parsed.optimization || parsed.preferredTime || parsed.isEmployed)) {
                preferences = parsed;
            }
        }
    } catch (e) {
        preferences = {};
    }

    // If no selectedSubjectDetails, enrich them by fetching authoritative data from backend (H2 DB)
    if ((!details || details.length === 0) && Array.isArray(entry.selectedSubjects) && entry.selectedSubjects.length) {
        try {
            const codes = entry.selectedSubjects;
            let subjectsCatalog = [];

            // Prefer degree-scoped catalog when degree is known
            if (degree) {
                subjectsCatalog = await fetchSubjectsForDegree(degree);
            }

            // If no degree or degree call returned empty, request full catalog
            if (!subjectsCatalog || !subjectsCatalog.length) {
                try {
                    const url = `http://localhost:8080/api/subjects`;
                    const res = await APIHelper.get(url);
                    if (res.ok) {
                        const all = res.data;
                        if (Array.isArray(all)) subjectsCatalog = all;
                    }
                } catch (e) {
                    // ignore — will fall back to per-code minimal objects
                }
            }

            if (subjectsCatalog && subjectsCatalog.length) {
                const byCode = new Map(subjectsCatalog.map(s => [s.code, s]));
                details = codes.map(code => byCode.get(code) || { code, name: code, ects: 0 });
            } else {
                // final fallback: minimal per-code objects
                details = codes.map(code => ({ code, name: code, ects: 0 }));
            }
        } catch (e) {
            console.error('Error enriching subject details from backend catalog:', e);
            details = entry.selectedSubjects.map(code => ({ code, name: code, ects: 0 }));
        }
    }

    // If there's an HTML table with subjects on the page, prefer reading from it
    function readSubjectsFromTable() {
        // Accept different casing for the table id/name (e.g. SUBJECTS)
        let table = document.querySelector('#subjects, table.subjects-table');
        if (!table) {
            // try case-insensitive id match
            const allTables = Array.from(document.querySelectorAll('table'));
            table = allTables.find(t => (t.id || '').toLowerCase() === 'subjects' || (t.getAttribute('data-table') || '').toLowerCase() === 'subjects');
        }
        if (!table) return null;
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        if (!rows.length) return null;

        const headerThs = Array.from(table.querySelectorAll('thead th'));
        const headerCells = headerThs.map(th => (th.textContent || '').trim());

        const normalize = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, '');
        const headerMap = {};
        headerCells.forEach((h, i) => {
            headerMap[normalize(h)] = i;
        });

        const idxFor = (variants, fallback) => {
            for (const v of variants) {
                const n = normalize(v);
                if (headerMap[n] !== undefined) return headerMap[n];
            }
            return (fallback !== undefined) ? fallback : -1;
        };

        // Expected SUBJECTS columns: COURSE ECTS TRIMESTER ID CODE DEGREE NAME TYPE
        const courseIdx = idxFor(['course', 'curs', 'curso'], 0);
        const ectsIdx = idxFor(['ects', 'credit', 'credits', 'crd'], 1);
        const trimesterIdx = idxFor(['trimester', 'trimestre', 'semester', 'trim'], 2);
        const idIdx = idxFor(['id', 'identificador'], 3);
        const codeIdx = idxFor(['code', 'codi', 'codigo'], 4);
        const degreeIdx = idxFor(['degree', 'grau', 'degreecode'], 5);
        const nameIdx = idxFor(['name', 'nom', 'assignatura', 'title'], 6);
        const typeIdx = idxFor(['type', 'tipus', 'category'], 7);

        const parsed = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const getCell = (i) => (cells[i] && cells[i].textContent.trim()) || '';

            const rawEcts = getCell(ectsIdx) || getCell(1) || '';
            const ects = Number((String(rawEcts).match(/-?\d+(?:[.,]\d+)?/) || ['0'])[0].replace(',', '.')) || 0;

            return {
                course: getCell(courseIdx) || getCell(0) || '',
                ects: ects,
                trimester: getCell(trimesterIdx) || getCell(2) || '',
                id: getCell(idIdx) || getCell(3) || '',
                code: getCell(codeIdx) || getCell(4) || '---',
                degree: getCell(degreeIdx) || getCell(5) || '',
                name: getCell(nameIdx) || getCell(6) || '',
                type: getCell(typeIdx) || getCell(7) || ''
            };
        });

        return parsed;
    }

    const tableSubjects = readSubjectsFromTable();
    if (tableSubjects && tableSubjects.length) {
        details = tableSubjects;
        entry.selectedSubjects = tableSubjects.map(s => s.code);
        entry.totalEcts = tableSubjects.reduce((s, d) => s + (Number(d.ects) || 0), 0);
    }

    // If still missing degree or preferences, try to read from backend profile
    if ((!degree || Object.keys(preferences).length === 0) && typeof AuthState !== 'undefined') {
        try {
            const user = (typeof AuthState.getUser === 'function') ? AuthState.getUser() : null;
            const username = AuthHelper.resolveUsername(user);
            if (username) {
                const profile = await fetchProfile(username);
                if (profile) {
                    if (!degree && profile.degree) {
                        degree = profile.degree;
                        entry = (storage.selectionsByDegree || {})[degree] || entry;
                        if ((!details || details.length === 0) && Array.isArray(entry.selectedSubjects) && entry.selectedSubjects.length) {
                            const subjects = await fetchSubjectsForDegree(degree);
                            const byCode = new Map((subjects || []).map(s => [s.code, s]));
                            details = entry.selectedSubjects.map(code => byCode.get(code) || {
                                code,
                                name: code,
                                ects: 0
                            });
                        }
                    }

                    // merge preferences from profile when sessionStorage empty
                    if (Object.keys(preferences).length === 0 && profile) {
                        const maybePrefs = {
                            optimization: profile.optimization,
                            freeDayPreference: profile.freeDayPreference,
                            preferredTime: profile.preferredTime,
                            isEmployed: profile.isEmployed,
                            noMornings: profile.noMornings,
                            noEvenings: profile.noEvenings,
                            noNoon: profile.noNoon
                        };
                        // Only use if any key present
                        if (Object.values(maybePrefs).some(v => v !== undefined)) {
                            preferences = maybePrefs;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching profile fallback:', e);
        }
    }

    let subjectCount = Array.isArray(details) && details.length ? details.length : (Array.isArray(entry.selectedSubjects) ? entry.selectedSubjects.length : 0);
    let totalEcts = entry.totalEcts || (Array.isArray(details) ? details.reduce((s, d) => s + (Number(d.ects) || 0), 0) : 0);

    // If some details are missing ects or type, try fetching full catalog once and fill gaps
    async function enrichMissingFromCatalog() {
        try {
            const needsFill = (details || []).some(d => !d || !d.ects || !d.type);
            if (!needsFill) return;
            let catalog = [];
            // try degree-scoped first
            if (degree) catalog = await fetchSubjectsForDegree(degree);
            if (!catalog || !catalog.length) {
                try {
                    const url = `http://localhost:8080/api/subjects`;
                    const res = await APIHelper.get(url);
                    if (res.ok) {
                        const all = res.data;
                        if (Array.isArray(all)) catalog = all;
                    }
                } catch (e) {
                    // ignore
                }
            }

            if (!catalog || !catalog.length) return;
            const byCode = new Map(catalog.map(s => [s.code, s]));
            details = details.map(d => {
                if (!d) return d;
                const found = byCode.get(d.code) || byCode.get(String(d.code).trim()) || {};
                return {
                    ...d,
                    name: d.name || found.name || d.code,
                    ects: (d.ects && Number(d.ects)) ? Number(d.ects) : (found.ects || found.ECTS || Number(found.ects || found.credit || found.credits) || 0),
                    type: d.type || found.type || found.tipus || found.category || ''
                };
            });
        } catch (e) {
            console.error('Error enriching missing fields from catalog', e);
        }
    }

    await enrichMissingFromCatalog();

    // Ensure details items have a code property and normalize types
    details = (Array.isArray(details) ? details : []).map(d => {
        const raw = d || {};

        const code = raw.code || raw.codigo || raw.id || raw.CODI || raw.Code || String(raw).trim();

        // name variations
        const name = raw.name || raw.title || raw.nombre || raw.nombreAsignatura || raw.Name || raw.NOM || '';

        // try to detect ects-like fields (ects, ECTS, credit, credits, creditos)
        const ectsCandidates = Object.keys(raw).filter(k => /ects|credit|crèdit|credito|credits/i.test(k));
        let ects = 0;
        for (const key of ectsCandidates) {
            const val = raw[key];
            const parsed = Number(String(val).replace(/[^0-9.-]+/g, ''));
            if (!Number.isNaN(parsed) && parsed > 0) {
                ects = parsed;
                break;
            }
        }
        // Direct fallback to common key names
        if (!ects) ects = Number(raw.ects || raw.credit || raw.credits || raw.creditos || 0) || 0;

        // semester/trimester variations
        const semester = raw.semester || raw.trimester || raw.trimestre || raw.Semester || raw.trimester || '';

        // type variations
        const type = raw.type || raw.tipus || raw.category || raw.subjectType || raw.kind || raw.Type || '';

        return {
            code: code || '---',
            name: name || code || 'Assignatura',
            ects: ects,
            semester: semester,
            type: type,
            raw: raw
        };
    });

    // Persist normalized selection back to sessionStorage so generator page can read enriched details
    function saveSelectedSubjectsStorage() {
        try {
            const toSave = loadSelectedSubjectsStorage();
            toSave.currentDegree = degree || toSave.currentDegree || '';
            toSave.selectionsByDegree = toSave.selectionsByDegree || {};
            const codes = Array.isArray(details) && details.length ? details.map(s => s.code) : (Array.isArray(entry.selectedSubjects) ? entry.selectedSubjects : []);
            toSave.selectionsByDegree[toSave.currentDegree] = {
                selectedSubjects: codes,
                totalEcts: Number(totalEcts) || 0,
                selectedSubjectDetails: details
            };
            sessionStorage.setItem('selectedSubjects', JSON.stringify(toSave));
        } catch (e) {
            console.error('Error saving selected subjects to sessionStorage', e);
        }
    }

    // Recompute counts after normalization/enrichment
    subjectCount = Array.isArray(details) ? details.length : (Array.isArray(entry.selectedSubjects) ? entry.selectedSubjects.length : 0);
    totalEcts = (Array.isArray(details) ? details.reduce((s, d) => s + (Number(d.ects) || 0), 0) : (entry.totalEcts || 0));

    // Save normalized/enriched data so subsequent pages read the corrected values
    saveSelectedSubjectsStorage();

    const reviewSubjectCountEl = document.getElementById('reviewSubjectCount');
    const reviewTotalEctsEl = document.getElementById('reviewTotalEcts');
    if (reviewSubjectCountEl) reviewSubjectCountEl.textContent = subjectCount;
    if (reviewTotalEctsEl) reviewTotalEctsEl.textContent = totalEcts;
    const reviewSubjectCountCard = document.getElementById('reviewSubjectCountCard');
    const reviewEctsCard = document.getElementById('reviewEctsCard');
    if (reviewSubjectCountCard) reviewSubjectCountCard.textContent = subjectCount;
    if (reviewEctsCard) reviewEctsCard.textContent = totalEcts;

    const degreeBadge = document.getElementById('reviewDegreeBadge');
    const degreeBadgePanel = document.getElementById('reviewDegreeBadgePanel');
    if (degreeBadge) degreeBadge.textContent = getDegreeLabel(degree);
    if (degreeBadgePanel) degreeBadgePanel.textContent = getDegreeLabel(degree);

    const preferencesList = document.getElementById('reviewPreferencesList');
    if (preferencesList) {
        const items = [
            { label: 'Preferència', value: getPreferenceLabel(preferences.optimization, 'optimization') }
        ];

        preferencesList.innerHTML = items.map((item) => `
            <div class="review-preference-item">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
            </div>
        `).join('');
    }

    const list = document.getElementById('reviewSubjectList');
    if (list && details.length) {
        details.forEach((subject) => {
            list.appendChild(renderSubjectCard(subject));
        });
    } else if (list && Array.isArray(entry.selectedSubjects) && entry.selectedSubjects.length) {
        entry.selectedSubjects.forEach((code) => {
            list.appendChild(renderSubjectCard({ code, name: code }));
        });
    } else if (list) {
        list.innerHTML = `
            <div class="review-empty-state">
                <div class="review-empty-icon">≋</div>
                <h3>No hi ha assignatures seleccionades</h3>
                <p>Torna enrere i <a href="subjects-selector.html">selecciona assignatures</a> per poder generar l'horari.</p>
            </div>
        `;
    }

    // Navigation buttons
    document.getElementById('modifySubjectsBtn')?.addEventListener('click', () => {
        window.location.href = 'subjects-selector.html';
    });
    document.getElementById('modifyPreferencesBtn')?.addEventListener('click', () => {
        window.location.href = 'preferences-selector.html';
    });

    // Continue button: jump into the same generation flow used by the create page
    document.getElementById('continueBtn')?.addEventListener('click', (e) => {
        if (e && e.isTrusted === false) return;
        if (subjectCount === 0) {
            window.location.href = 'subjects-selector.html';
            return;
        }
        // Mark the create page to start generation immediately on load
        setTimeout(() => window.location.href = 'calendar-creation.html#autoGenerate', 150);
    });
});
