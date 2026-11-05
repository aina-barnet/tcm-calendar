// Subjects Selection Script

class SubjectsManager {
    constructor() {
        this.selectedSubjects = new Set();
        this.totalEcts = 0;
        this.maxEcts = 20; // Màxim recomanat per trimestre acadèmic
        this.canSelectSubjects = true;
        this.subjects = [];
        this.userDegree = null;
        this.userAcademicYear = null;
        this.userCourseFilter = null;

        this.init();
    }

    async init() {
        await this.enforceDegreeRequirement();

        if (this.canSelectSubjects && this.userDegree) {
            const initialCourseFilter = this.resolveInitialCourseFilter();
            const initialSemesterFilter = this.resolveInitialSemesterFilter();
            this.applyProfileFilters(initialCourseFilter, initialSemesterFilter);
            try {
                // Load all degree subjects once; course filter is applied client-side.
                await this.loadSubjectsFromBackend();
            } catch (e) {
                console.error('Error carregant assignatures en init:', e);
                this.subjects = [];
            }
            this.renderSubjects();
            this.loadSavedSubjects();
            this.attachSubjectCheckboxListeners(); // Afegir listeners després de renderitzar
        }

        this.attachEventListeners();
        this.updateUI();

        if (!this.canSelectSubjects) {
            this.lockSubjectsSelectionUI();
        }
    }

    attachEventListeners() {
        // Filtres
        const courseFilter = document.getElementById('courseFilter');
        const semesterFilter = document.getElementById('semesterFilter');

        if (courseFilter) {
            courseFilter.addEventListener('change', () => {
                // Keep all selected courses loaded and only filter what is shown.
                this.applyFilters();
                this.updateUI();
            });
        }

        if (semesterFilter) {
            semesterFilter.addEventListener('change', () => this.applyFilters());
        }

        // Botons d'acció
        const saveBtn = document.getElementById('saveSubjectsBtn');
        const continueBtn = document.getElementById('continueBtn');
        const modifyBtn = document.getElementById('modifyBtn');

        if (modifyBtn) {
            modifyBtn.addEventListener('click', () => {
                // Navigate to profile and focus degree selection
                window.location.href = 'user-profile.html#degree';
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSubjects());
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.continueToPreferences());
        }

        // Flux de passos: reutilitza la mateixa lògica de validació que el botó continuar
        document.querySelectorAll('.workflow-quick-nav .step-link').forEach((link) => {
            link.addEventListener('click', (event) => {
                const href = link.getAttribute('href') || '';
                if (href === 'preferences-selector.html' || href === 'calendar-creation.html') {
                    event.preventDefault();
                    this.continueToPreferences();
                }
            });
        });
    }

    attachSubjectCheckboxListeners() {
        // Checkboxes d'assignatures (cridar després de renderitzar)
        document.querySelectorAll('.subject-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleSubjectChange(e));
        });
    }

    getEmptySelectionData() {
        return {
            selectedSubjects: [],
            totalEcts: 0,
            selectedTrimester: null,
            selectedCourse: null,
            selectedSubjectDetails: []
        };
    }

    parseSelectedSubjectsStorage() {
        const raw = sessionStorage.getItem('selectedSubjects');
        if (!raw) {
            return {
                currentDegree: this.userDegree || '',
                selectionsByDegree: {}
            };
        }

        try {
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object' && parsed.selectionsByDegree && typeof parsed.selectionsByDegree === 'object') {
                return {
                    currentDegree: typeof parsed.currentDegree === 'string' ? parsed.currentDegree : (this.userDegree || ''),
                    selectionsByDegree: parsed.selectionsByDegree
                };
            }

            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.selectedSubjects)) {
                const oldCurrentDegree = typeof parsed.currentDegree === 'string' ? parsed.currentDegree : '';
                const migrated = {
                    currentDegree: oldCurrentDegree || '',
                    selectionsByDegree: {}
                };

                if (oldCurrentDegree) {
                    migrated.selectionsByDegree[oldCurrentDegree] = {
                        selectedSubjects: parsed.selectedSubjects,
                        totalEcts: Number(parsed.totalEcts) || 0,
                        selectedTrimester: Number.isFinite(Number(parsed.selectedTrimester)) ? Number(parsed.selectedTrimester) : null,
                        selectedSubjectDetails: Array.isArray(parsed.selectedSubjectDetails) ? parsed.selectedSubjectDetails : []
                    };
                }

                return migrated;
            }
        } catch (e) {
            console.error('Error parsejant selectedSubjects de sessionStorage:', e);
        }

        return {
            currentDegree: this.userDegree || '',
            selectionsByDegree: {}
        };
    }

    recalculateTotalEcts() {
        const ectsByCode = new Map(this.subjects.map(subject => [this.getSubjectSelectionKey(subject), Number(subject.ects) || 0]));
        let total = 0;

        this.selectedSubjects.forEach(selectionKey => {
            total += ectsByCode.get(selectionKey) || 0;
        });

        this.totalEcts = total;
    }

    buildSelectionKey(code, semester) {
        const normalizedCode = String(code || '').trim();
        const normalizedSemester = Number(semester);
        if (!normalizedCode) {
            return '';
        }

        if (Number.isFinite(normalizedSemester) && normalizedSemester > 0) {
            return `${normalizedCode}_${normalizedSemester}`;
        }

        return normalizedCode;
    }

    parseSelectionKey(selectionKey) {
        const raw = String(selectionKey || '').trim();
        const match = raw.match(/^(.*?)(?:__T|_)([1-9]\d*)$/);
        if (!match) {
            return {
                baseCode: raw,
                trimester: null
            };
        }

        return {
            baseCode: match[1],
            trimester: Number(match[2])
        };
    }

    normalizeSelectionCode(selectionKey) {
        return this.parseSelectionKey(selectionKey).baseCode;
    }

    stripSelectionSuffix(selectionKey) {
        return this.normalizeSelectionCode(selectionKey);
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

    getSubjectSelectionKey(subject) {
        const baseCode = String(subject?.code || '').trim();
        if (this.isThesisSubject(subject)) {
            return baseCode;
        }

        const semester = Number(subject?.semester);
        const semestersForCode = this.getSemestersForSubjectCode(baseCode);

        if (semestersForCode.size > 1 && Number.isFinite(semester) && semester > 0) {
            return this.buildSelectionKey(baseCode, semester);
        }

        return baseCode;
    }

    isSubjectSelected(subject) {
        return this.selectedSubjects.has(this.getSubjectSelectionKey(subject));
    }

    clearConflictingVariantSelections(baseCode, keepSelectionKey) {
        const toRemove = [];

        this.selectedSubjects.forEach((selectionKey) => {
            const parsed = this.parseSelectionKey(selectionKey);
            if (parsed.baseCode === baseCode && selectionKey !== keepSelectionKey) {
                toRemove.push(selectionKey);
            }
        });

        toRemove.forEach((selectionKey) => {
            this.selectedSubjects.delete(selectionKey);
            const checkbox = document.querySelector(`.subject-checkbox[data-selection-key="${selectionKey}"]`);
            if (checkbox) {
                checkbox.checked = false;
            }
        });
    }

    resolveInitialCourseFilter() {
        const storage = this.parseSelectedSubjectsStorage();
        const degreeSelection = storage.selectionsByDegree?.[this.userDegree] || null;
        const savedCourse = degreeSelection?.selectedCourse;

        if (savedCourse != null && String(savedCourse).trim() !== '') {
            return String(savedCourse);
        }

        const courseFromAcademicYear = this.mapAcademicYearToCourse(this.userAcademicYear);
        if (courseFromAcademicYear) {
            return courseFromAcademicYear;
        }

        return null;
    }

    resolveInitialSemesterFilter() {
        const storage = this.parseSelectedSubjectsStorage();
        const degreeSelection = storage.selectionsByDegree?.[this.userDegree] || null;
        const savedTrimester = degreeSelection?.selectedTrimester;

        if (Number.isFinite(Number(savedTrimester)) && Number(savedTrimester) > 0) {
            return String(Number(savedTrimester));
        }

        return null;
    }

    mapAcademicYearToCourse(academicYear) {
        const year = Number(academicYear);
        if (!Number.isFinite(year) || year < 1) {
            return null;
        }

        if (year === 1) return '1';
        if (year === 2) return '2';
        if (year === 3) return '3';
        if (year >= 4 && year <= 6) return '4';

        return null;
    }

    applyProfileFilters(initialCourseFilter = null, initialSemesterFilter = null) {
        const courseFilter = document.getElementById('courseFilter');
        const semesterFilter = document.getElementById('semesterFilter');

        if (semesterFilter) {
            semesterFilter.value = initialSemesterFilter ? String(initialSemesterFilter) : '';
            semesterFilter.disabled = false;
            semesterFilter.title = '';
        }

        if (!courseFilter) return;

        courseFilter.value = initialCourseFilter ? String(initialCourseFilter) : '';

        // It is only a default for consistency; users can still explore other courses.
        courseFilter.disabled = false;
        courseFilter.title = '';
    }

    handleSubjectChange(e) {
        const checkbox = e.target;
        const selectionKey = checkbox.dataset.selectionKey || checkbox.dataset.code;
        const subjectCode = checkbox.dataset.code;
        const subjectSemester = Number(checkbox.dataset.semester);
        if (!selectionKey) {
            return;
        }

        if (checkbox.checked) {
            // Prevent mixing different trimesters
            const currentlySelectedSemesters = this.getFixedSelectedSemesters();
            // If there's already a selected trimester and it's different from the one being checked, block it
            if (currentlySelectedSemesters.size > 0) {
                // If the subject itself has no trimester (shouldn't happen) allow it
                if (!Number.isFinite(subjectSemester) || subjectSemester <= 0) {
                    // allow
                } else if (!currentlySelectedSemesters.has(subjectSemester)) {
                    // Revert UI change and inform the user
                    checkbox.checked = false;
                    const existing = Array.from(currentlySelectedSemesters)[0];
                    this.showNotification(`No pots barrejar trimestres. Ja tens assignatures del ${this.getSemesterName(existing)}.`, 'warning');
                    return;
                }
            }

            const parsedSelection = this.parseSelectionKey(selectionKey);
            this.clearConflictingVariantSelections(parsedSelection.baseCode, selectionKey);

            this.selectedSubjects.add(selectionKey);
        } else {
            this.selectedSubjects.delete(selectionKey);
        }

        this.recalculateTotalEcts();

        this.updateUI();
        this.saveToSessionStorage();
    }

    updateUI() {
        // Actualitzar comptador d'ECTS
        const totalEctsElement = document.getElementById('totalEcts');
        const ectsProgress = document.getElementById('ectsProgress');
        const continueBtn = document.getElementById('continueBtn');

        if (totalEctsElement) {
            totalEctsElement.textContent = this.totalEcts;
        }

        if (ectsProgress) {
            const percentage = Math.min((this.totalEcts / this.maxEcts) * 100, 100);
            ectsProgress.style.width = `${percentage}%`;
        }

        // Habilitar/deshabilitar botó de continuar
        if (continueBtn) {
            continueBtn.disabled = !this.canSelectSubjects || this.selectedSubjects.size === 0;
        }
    }

    async enforceDegreeRequirement() {
        const username = this.getUsername();
        console.log('👤 Nom d\'usuari:', username);

        if (!username) {
            console.error('❌ No s\'ha trobat nom d\'usuari');
            this.canSelectSubjects = false;
            return;
        }

        try {
            const response = await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
                method: 'GET',
                headers: AuthState.getAuthHeaders()
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    AuthState.handleInvalidSession();
                }
                console.error('❌ Error obtenint perfil, status:', response.status);
                this.canSelectSubjects = false;
                return;
            }

            const profile = await response.json();
            console.log('Perfil rebut:', profile);
            console.log('Grau del perfil:', profile?.degree);

            this.canSelectSubjects = Boolean(profile?.degree && String(profile.degree).trim());

            if (this.canSelectSubjects) {
                this.userDegree = profile.degree;
                this.userAcademicYear = Number(profile?.academicYear) || null;
                this.userCourseFilter = this.mapAcademicYearToCourse(this.userAcademicYear);
                console.log('✅ Grau configurat:', this.userDegree);
                console.log('✅ Curs acadèmic configurat:', this.userAcademicYear, '=> filtre curs:', this.userCourseFilter);
            } else {
                console.warn('⚠️ Grau no configurat al perfil');
            }
        } catch (error) {
            console.error('❌ Error enforceDegreeRequirement:', error);
            this.canSelectSubjects = false;
        }
    }

    // Optionally pass `course` (string/number). If provided, the backend will be queried with ?course={course}
    async loadSubjectsFromBackend(course = null) {
        console.log('Carregant assignatures per al grau:', this.userDegree, 'curs:', course);

        try {
            let url = `http://localhost:8080/api/subjects/degree/${encodeURIComponent(this.userDegree)}`;
            if (course) {
                const qp = `?course=${encodeURIComponent(course)}`;
                url += qp;
            }
            console.log('URL de la petició:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: AuthState.getAuthHeaders()
            });

            console.log('Resposta rebuda, status:', response.status);

            if (!response.ok) {
                console.error('Error response from backend when loading subjects:', response.status);
                this.subjects = [];
                this.showNotification('Error carregant assignatures: servidor retornà ' + response.status, 'error');
                return;
            }

            this.subjects = await response.json();
            if (!Array.isArray(this.subjects)) this.subjects = [];
            console.log('✅ Assignatures carregades:', this.subjects.length);
        } catch (error) {
            console.error('❌ Error carregant assignatures:', error);
            this.showNotification('Error carregant les assignatures', 'error');
            this.subjects = [];
        }
    }

    renderSubjects() {
        console.log('Renderitzant assignatures, total:', this.subjects.length);

        const subjectsList = document.getElementById('subjectsList');
        if (!subjectsList) {
            console.error('❌ Element #subjectsList no trobat');
            return;
        }

        // Netejar contingut existent
        subjectsList.innerHTML = '';

        if (this.subjects.length === 0) {
            console.warn('Cap assignatura per renderitzar');
            this.recalculateTotalEcts();
            const noResults = document.getElementById('noResults');
            if (noResults) {
                noResults.style.display = 'block';
                const p = noResults.querySelector('p');
                if (p) p.textContent = 'No hi ha assignatures disponibles per aquest grau.';
            }
            return;
        }

        // Agrupar assignatures per curs
        const subjectsByCourse = this.subjects.reduce((acc, subject) => {
            if (!acc[subject.course]) {
                acc[subject.course] = [];
            }
            acc[subject.course].push(subject);
            return acc;
        }, {});

        // Renderitzar cada curs
        Object.keys(subjectsByCourse).sort().forEach(course => {
            const courseGroup = this.createCourseGroup(course, subjectsByCourse[course]);
            subjectsList.appendChild(courseGroup);
        });

        this.recalculateTotalEcts();
    }

    createCourseGroup(course, subjects) {
        const courseGroup = document.createElement('div');
        courseGroup.className = 'course-group';
        courseGroup.dataset.course = course;
        courseGroup.dataset.degree = this.userDegree;

        const courseTitle = document.createElement('h3');
        courseTitle.className = 'course-title';
        courseTitle.textContent = `${this.getCourseName(course)} - ${this.getDegreeName(this.userDegree)}`;

        const subjectsGrid = document.createElement('div');
        subjectsGrid.className = 'subjects-grid';

        subjects.forEach(subject => {
            const subjectCard = this.createSubjectCard(subject);
            subjectsGrid.appendChild(subjectCard);
        });

        courseGroup.appendChild(courseTitle);
        courseGroup.appendChild(subjectsGrid);

        return courseGroup;
    }

    createSubjectCard(subject) {
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.dataset.semester = this.isThesisSubject(subject) ? '' : String(subject.semester || '');
        const selectionKey = this.getSubjectSelectionKey(subject);
        const semesterName = this.isThesisSubject(subject) ? '' : this.getSemesterName(subject.semester);

        card.innerHTML = `
            <label class="subject-label">
                <input type="checkbox" class="subject-checkbox" 
                       data-ects="${subject.ects}" 
                      data-code="${subject.code}"
                      data-selection-key="${selectionKey}"
                      data-semester="${subject.semester}">
                <div class="subject-content">
                    <div class="subject-code-badge">${subject.code}</div>
                    <div class="subject-name">${subject.name}</div>
                    <div class="subject-info">
                        <span class="subject-info-item">
                            <span class="info-label">Crèdits:</span>
                            <span class="info-value">${subject.ects} ECTS</span>
                        </span>
                        ${semesterName ? `
                        <span class="subject-info-item">
                            <span class="info-label">Trimestre:</span>
                            <span class="info-value">${semesterName}</span>
                        </span>
                        ` : ''}
                        <span class="subject-info-item">
                            <span class="info-label">Tipus:</span>
                            <span class="info-value">${this.getTypeName(subject.type)}</span>
                        </span>
                    </div>
                </div>
            </label>
        `;

        return card;
    }

    getSemesterName(semester) {
        if (!Number.isFinite(Number(semester)) || Number(semester) <= 0) {
            return '';
        }

        const names = {
            1: '1r trimestre',
            2: '2n trimestre',
            3: '3r trimestre'
        };
        return names[semester] || `Trimestre ${semester}`;
    }

    getTypeName(type) {
        const types = {
            'FB': 'Formació Bàsica',
            'OB': 'Obligatòria',
            'OPT': 'Optativa',
            'TFG': 'Treball Final de Grau'
        };
        return types[type] || type;
    }

    getCourseName(course) {
        const names = {
            '1': '1r Curs',
            '2': '2n Curs',
            '3': '3r Curs',
            '4': '4t Curs'
        };
        return names[course] || `Curs ${course}`;
    }

    getDegreeName(degree) {
        const names = {
            'GEEIA': 'Grau en Enginyeria Electrònica Industrial i Automàtica',
            'GEIGSI': 'Grau en Enginyeria Informàtica de Gestió i Sistemes d\'Informació',
            'GEM': 'Grau en Enginyeria Mecànica',
            'GEIGDP': 'Doble grau en Informàtica de Gestió i Sistemes d\'Informació i Disseny i Producció de Videojocs',
            'GEEIA+GEM': 'Graus simultanis d\'Enginyeria Electrònica Industrial i Automàtica i Enginyeria Mecànica',
            'GEOI': 'Grau en Enginyeria d\'Organització Industrial',
            'GEEIA+GEIGSI': 'Graus simultanis d\'Enginyeria Electrònica Industrial i Automàtica i Enginyeria Informàtica de Gestió i Sistemes d\'Informació'
        };
        return names[degree] || degree;
    }

    lockSubjectsSelectionUI() {
        const courseGroups = document.querySelectorAll('.course-group');
        const noResults = document.getElementById('noResults');
        const noResultsText = noResults ? noResults.querySelector('p') : null;
        const saveBtn = document.getElementById('saveSubjectsBtn');
        const continueBtn = document.getElementById('continueBtn');
        const courseFilter = document.getElementById('courseFilter');
        const checkboxes = document.querySelectorAll('.subject-checkbox');

        courseGroups.forEach(group => {
            group.style.display = 'none';
        });

        if (noResults) {
            noResults.style.display = 'block';
        }

        if (noResultsText) {
            noResultsText.textContent = 'Primer has de seleccionar un grau al teu perfil per poder veure assignatures.';
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.title = 'Selecciona un grau al perfil per activar aquesta opció';
        }

        if (continueBtn) {
            continueBtn.disabled = true;
            continueBtn.title = 'Selecciona un grau al perfil per continuar';
        }

        if (courseFilter) {
            courseFilter.disabled = true;
        }

        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.disabled = true;
        });

        this.selectedSubjects.clear();
        this.totalEcts = 0;
        this.updateUI();
    }

    applyFilters() {
        const courseFilter = document.getElementById('courseFilter')?.value || '';
        const semesterFilter = document.getElementById('semesterFilter')?.value || '';
        const courseGroups = document.querySelectorAll('.course-group');
        const noResults = document.getElementById('noResults');

        let visibleGroups = 0;

        courseGroups.forEach(group => {
            const groupCourse = group.dataset.course;
            const courseMatch = !courseFilter || groupCourse === courseFilter;
            const subjectCards = group.querySelectorAll('.subject-card');
            let hasVisibleSubject = false;

            subjectCards.forEach(card => {
                const cardSemester = card.dataset.semester || '';
                const semesterMatch = !semesterFilter || !cardSemester || cardSemester === semesterFilter;
                const visible = courseMatch && semesterMatch;
                card.style.display = visible ? '' : 'none';
                if (visible) {
                    hasVisibleSubject = true;
                }
            });

            if (hasVisibleSubject) {
                group.style.display = 'block';
                visibleGroups++;
            } else {
                group.style.display = 'none';
            }
        });

        // Mostrar missatge si no hi ha resultats
        if (noResults) {
            noResults.style.display = visibleGroups === 0 ? 'block' : 'none';
        }
    }

    saveToSessionStorage() {
        if (!this.userDegree) return;

        this.recalculateTotalEcts();
        const selectionTrimester = this.getSelectedTrimesterFromSelection();
        const semesterFilter = document.getElementById('semesterFilter')?.value || '';
        const courseFilter = document.getElementById('courseFilter')?.value || '';

        const selectedSubjectDetails = this.subjects
            .filter(subject => this.isSubjectSelected(subject))
            .map(subject => ({
                selectionKey: this.getSubjectSelectionKey(subject),
                code: subject.code,
                name: subject.name,
                semester: this.isThesisSubject(subject) ? null : subject.semester,
                type: subject.type
            }));

        const storage = this.parseSelectedSubjectsStorage();
        storage.currentDegree = this.userDegree;
        storage.selectionsByDegree[this.userDegree] = {
            selectedSubjects: Array.from(this.selectedSubjects),
            totalEcts: this.totalEcts,
            selectedTrimester: selectionTrimester ?? (semesterFilter ? Number(semesterFilter) : null),
            selectedCourse: courseFilter || null,
            selectedSubjectDetails
        };

        sessionStorage.setItem('selectedSubjects', JSON.stringify(storage));
    }

    getSelectedTrimesterFromSelection() {
        const selectedSemesters = this.getFixedSelectedSemesters();

        if (selectedSemesters.size === 0) {
            return null;
        }

        if (selectedSemesters.size !== 1) {
            return null;
        }

        return Array.from(selectedSemesters)[0];
    }

    getSemestersForSubjectCode(subjectCode) {
        const semesters = new Set();

        this.subjects
            .filter(subject => subject.code === subjectCode)
            .forEach(subject => {
                const semester = Number(subject.semester);
                if (Number.isFinite(semester) && semester > 0) {
                    semesters.add(semester);
                }
            });

        return semesters;
    }

    getFixedSelectedSemesters() {
        const selectedSemesters = new Set();

        this.selectedSubjects.forEach(code => {
            const { baseCode, trimester } = this.parseSelectionKey(code);
            if (Number.isFinite(trimester) && trimester > 0) {
                selectedSemesters.add(trimester);
                return;
            }

            const semestersForCode = this.getSemestersForSubjectCode(baseCode);
            if (semestersForCode.size === 1) {
                semestersForCode.forEach(semester => selectedSemesters.add(semester));
            }
        });

        return selectedSemesters;
    }

    loadSavedSubjects() {
        const storage = this.parseSelectedSubjectsStorage();
        if (!this.userDegree) {
            this.selectedSubjects = new Set();
            this.totalEcts = 0;
            this.recalculateTotalEcts();
            return;
        }

        const degreeSelection = storage.selectionsByDegree?.[this.userDegree] || this.getEmptySelectionData();
        const savedSelection = new Set(Array.isArray(degreeSelection.selectedSubjects) ? degreeSelection.selectedSubjects : []);
        const availableSubjectCodes = new Set(this.subjects.map(subject => this.getSubjectSelectionKey(subject)));

        const normalizedSelectionByBase = new Map();
        const preferredTrimester = Number(degreeSelection.selectedTrimester);

        savedSelection.forEach(storedCode => {
            const trimmedStoredCode = String(storedCode || '').trim();
            if (!trimmedStoredCode) {
                return;
            }

            const rememberByBase = (candidateSelectionKey) => {
                const parsedCandidate = this.parseSelectionKey(candidateSelectionKey);
                const current = normalizedSelectionByBase.get(parsedCandidate.baseCode);
                if (!current) {
                    normalizedSelectionByBase.set(parsedCandidate.baseCode, candidateSelectionKey);
                    return;
                }

                if (!Number.isFinite(preferredTrimester) || preferredTrimester <= 0) {
                    return;
                }

                const currentTrimester = this.parseSelectionKey(current).trimester;
                const candidateTrimester = parsedCandidate.trimester;
                if (candidateTrimester === preferredTrimester && currentTrimester !== preferredTrimester) {
                    normalizedSelectionByBase.set(parsedCandidate.baseCode, candidateSelectionKey);
                }
            };

            if (availableSubjectCodes.has(trimmedStoredCode)) {
                rememberByBase(trimmedStoredCode);
                return;
            }

            const baseCode = this.normalizeSelectionCode(trimmedStoredCode);
            if (this.subjects.some(subject => this.isThesisSubject(subject) && this.getSubjectSelectionKey(subject) === baseCode)) {
                rememberByBase(baseCode);
                return;
            }

            const semestersForCode = Array.from(this.getSemestersForSubjectCode(baseCode));
            if (semestersForCode.length === 0) {
                if (availableSubjectCodes.has(baseCode)) {
                    rememberByBase(baseCode);
                }
                return;
            }

            if (semestersForCode.length === 1) {
                rememberByBase(baseCode);
                return;
            }

            const matchedSemester = Number.isFinite(preferredTrimester) && semestersForCode.includes(preferredTrimester)
                ? preferredTrimester
                : semestersForCode[0];
            rememberByBase(this.buildSelectionKey(baseCode, matchedSemester));
        });

        const normalizedSavedSelection = new Set(normalizedSelectionByBase.values());

        // Keep selection aligned with the subjects currently available in the degree.
        this.selectedSubjects = new Set(
            Array.from(normalizedSavedSelection).filter(code => availableSubjectCodes.has(code))
        );

        const removedSelections = savedSelection.size - this.selectedSubjects.size;
        storage.currentDegree = this.userDegree;
        if (!storage.selectionsByDegree[this.userDegree]) {
            storage.selectionsByDegree[this.userDegree] = this.getEmptySelectionData();
        }

        this.recalculateTotalEcts();

        storage.selectionsByDegree[this.userDegree].selectedSubjects = Array.from(this.selectedSubjects);
        storage.selectionsByDegree[this.userDegree].totalEcts = this.totalEcts;
        storage.selectionsByDegree[this.userDegree].selectedSubjectDetails = this.subjects
            .filter(subject => this.isSubjectSelected(subject))
            .map(subject => ({
                selectionKey: this.getSubjectSelectionKey(subject),
                code: subject.code,
                name: subject.name,
                semester: subject.semester
            }));

        sessionStorage.setItem('selectedSubjects', JSON.stringify(storage));

        if (removedSelections > 0) {
            this.showNotification('S\'han eliminat assignatures que ja no estan disponibles.', 'warning');
        }

        const semesterFilter = document.getElementById('semesterFilter');
        if (semesterFilter && Number.isFinite(Number(degreeSelection.selectedTrimester)) && Number(degreeSelection.selectedTrimester) > 0) {
            semesterFilter.value = String(degreeSelection.selectedTrimester);
        }

        const courseFilter = document.getElementById('courseFilter');
        const selectedCourse = degreeSelection.selectedCourse || '';
        if (courseFilter && selectedCourse) {
            courseFilter.value = String(selectedCourse);
        }

        // Marcar checkboxes guardats
        this.selectedSubjects.forEach(selectionKey => {
            const checkbox = document.querySelector(`.subject-checkbox[data-selection-key="${selectionKey}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });

        this.applyFilters();
    }

    getUsername() {
        const user = AuthState.getUser();
        return AuthHelper.resolveUsername(user);
    }

    async persistSubjectsToProfile() {
        const username = this.getUsername();
        if (!username) return;

        try {
            await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
                method: 'PUT',
                headers: AuthState.getAuthHeaders(),
                body: JSON.stringify({
                    selectedSubjects: Array.from(this.selectedSubjects).map(code => this.normalizeSelectionCode(code))
                })
            });
        } catch (error) {
            console.error('Error persistint assignatures al perfil:', error);
        }
    }

    async saveSubjects() {
        if (!this.canSelectSubjects) {
            this.showNotification('Has de seleccionar un grau al perfil abans de triar assignatures', 'warning');
            return;
        }

        if (this.selectedSubjects.size === 0) {
            this.showNotification('Selecciona almenys una assignatura', 'warning');
            return;
        }

        // Prevent saving mixed-trimester selections
        const fixedSemesters = this.getFixedSelectedSemesters();
        if (fixedSemesters.size > 1) {
            this.showNotification('No pots barrejar trimestres. Revisa la teva selecció.', 'warning');
            return;
        }

        // Aquí es faria la crida al backend per guardar les assignatures
        try {
            // Simulació de crida API
            await new Promise(resolve => setTimeout(resolve, 500));

            this.saveToSessionStorage();
            await this.persistSubjectsToProfile();
            this.showNotification('Assignatures guardades correctament', 'success');
        } catch (error) {
            console.error('Error guardant assignatures:', error);
            this.showNotification('Error guardant les assignatures', 'error');
        }
    }

    continueToPreferences() {
        if (!this.canSelectSubjects) {
            this.showNotification('Has de seleccionar un grau al perfil abans de continuar', 'warning');
            return;
        }

        if (this.selectedSubjects.size === 0) {
            this.showNotification('Selecciona almenys una assignatura', 'warning');
            return;
        }

        // Disallow continuing if multiple trimesters are selected
        const fixedSemesters = this.getFixedSelectedSemesters();
        if (fixedSemesters.size > 1) {
            this.showNotification('No pots barrejar trimestres. Revisa la teva selecció.', 'warning');
            return;
        }

        // Guardar i redirigir a preferències
        this.saveToSessionStorage();
        this.persistSubjectsToProfile().finally(() => {
            window.location.href = 'preferences-selector.html';
        });
    }

    showNotification(message, type = 'info') {
        // Crear notificació temporal
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

        // Eliminar després de 3 segons
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Inicialitzar quan el DOM estigui carregat
document.addEventListener('DOMContentLoaded', () => {
    new SubjectsManager();
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
