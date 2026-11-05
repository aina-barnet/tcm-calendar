// Preferences Script

class PreferencesManager {
    constructor() {
        this.selectedSubjects = null;
        this.preferences = this.getDefaultPreferences();
        this.currentDegree = '';
        this.currentUserDegreeKey = '';

        this.init();
    }

    init() {
        this.loadSelectedSubjects();
        const loadedFromSession = this.loadSavedPreferencesFromSession();
        this.displaySubjectsSummary();
        this.attachEventListeners();

        if (!loadedFromSession) {
            this.syncPreferencesFromBackend();
        }
    }

    getAuthHeaders() {
        const token = AuthState.getToken && AuthState.getToken();
        const headers = { 'Content-Type': 'application/json' };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    }

    getUsername() {
        const user = AuthState.getUser();
        return AuthHelper.resolveUsername(user);
    }

    getDefaultPreferences() {
        return {
            optimization: 'minimize-gaps'
        };
    }

    getDefaultSelectionData() {
        return {
            selectedSubjects: [],
            totalEcts: 0,
            selectedTrimester: null,
            selectedSubjectDetails: []
        };
    }

    getCurrentDegree() {
        if (this.currentDegree) {
            return this.currentDegree;
        }

        if (this.selectedSubjects?.currentDegree) {
            return this.selectedSubjects.currentDegree;
        }

        return '';
    }

    getUserDegreeKey(degree = this.getCurrentDegree()) {
        const username = this.getUsername();
        if (!username || !degree) {
            return '';
        }

        return `${username}::${degree}`;
    }

    normalizePreferencesStorage(parsed) {
        if (parsed && typeof parsed === 'object' && parsed.preferencesByKey && typeof parsed.preferencesByKey === 'object') {
            return {
                currentUserDegreeKey: typeof parsed.currentUserDegreeKey === 'string' ? parsed.currentUserDegreeKey : this.getUserDegreeKey(),
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
            parsed.noNoon != null ||
            parsed.transportMode != null
        )) {
            const key = this.getUserDegreeKey();
            const storage = {
                currentUserDegreeKey: key,
                preferencesByKey: {}
            };

            if (key) {
                storage.preferencesByKey[key] = this.normalizePreferences(parsed);
            }

            return storage;
        }

        return {
            currentUserDegreeKey: this.getUserDegreeKey(),
            preferencesByKey: {}
        };
    }

    loadPreferencesStorage() {
        const raw = sessionStorage.getItem('preferences');
        if (!raw) {
            return this.normalizePreferencesStorage(null);
        }

        try {
            return this.normalizePreferencesStorage(JSON.parse(raw));
        } catch (error) {
            console.error('Error carregant preferències de sessionStorage:', error);
            return this.normalizePreferencesStorage(null);
        }
    }

    persistPreferencesStorage(preferences, userDegreeKey = this.getUserDegreeKey()) {
        if (!userDegreeKey) return;

        const storage = this.loadPreferencesStorage();
        storage.currentUserDegreeKey = userDegreeKey;
        storage.preferencesByKey[userDegreeKey] = this.normalizePreferences(preferences, this.getDefaultPreferences());
        sessionStorage.setItem('preferences', JSON.stringify(storage));
    }

    getSelectedSubjectsEntry() {
        const storage = this.selectedSubjects || this.loadSelectedSubjectsStorage();
        const degree = this.getCurrentDegree();

        if (!degree) {
            return this.getDefaultSelectionData();
        }

        return storage.selectionsByDegree?.[degree] || this.getDefaultSelectionData();
    }

    loadSelectedSubjectsStorage() {
        const raw = sessionStorage.getItem('selectedSubjects');
        if (!raw) {
            return {
                currentDegree: '',
                selectionsByDegree: {}
            };
        }

        try {
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object' && parsed.selectionsByDegree && typeof parsed.selectionsByDegree === 'object') {
                return {
                    currentDegree: typeof parsed.currentDegree === 'string' ? parsed.currentDegree : '',
                    selectionsByDegree: parsed.selectionsByDegree
                };
            }

            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.selectedSubjects)) {
                const currentDegree = typeof parsed.currentDegree === 'string' ? parsed.currentDegree : '';
                return {
                    currentDegree,
                    selectionsByDegree: currentDegree ? {
                        [currentDegree]: {
                            selectedSubjects: parsed.selectedSubjects,
                            totalEcts: Number(parsed.totalEcts) || 0,
                            selectedTrimester: parsed.selectedTrimester ?? null,
                            selectedSubjectDetails: Array.isArray(parsed.selectedSubjectDetails) ? parsed.selectedSubjectDetails : []
                        }
                    } : {}
                };
            }
        } catch (error) {
            console.error('Error carregant assignatures:', error);
        }

        return {
            currentDegree: '',
            selectionsByDegree: {}
        };
    }

    normalizeStringValue(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    normalizeOptimization(value) {
        const normalized = this.normalizeStringValue(value)?.toLowerCase();

        switch (normalized) {
            case 'minimize-days':
            case 'compact':
            case 'compact-days':
                return 'balanced';
            case 'avoid-friday':
            case 'free_day':
            case 'free-day':
                return 'free-day';
            case 'morning':
            case 'avoid-early':
            case 'avoid_early':
            case 'first-hour':
                return 'avoid-early';
            case 'afternoon':
            case 'avoid-late':
            case 'avoid_late':
            case 'last-hour':
                return 'avoid-late';
            case 'group-by-type':
            case 'group_by_type':
            case 'by-type':
                return 'group-by-type';
            case 'balanced':
                return 'balanced';
            case 'minimize_gaps':
            case 'avoid-gaps':
            case 'minimize-gaps':
            default:
                return 'minimize-gaps';
        }
    }

    inferOptimizationFromLegacy(source = {}) {
        const explicitOptimization = this.normalizeStringValue(source.optimization);
        if (explicitOptimization) {
            return this.normalizeOptimization(explicitOptimization);
        }

        if (source.freeDayPreference != null && source.freeDayPreference !== '') {
            return 'free-day';
        }

        if (source.preferredTime === 'morning' || source.noMornings === true) {
            return 'avoid-early';
        }

        if (source.preferredTime === 'afternoon' || source.noEvenings === true) {
            return 'avoid-late';
        }

        return 'minimize-gaps';
    }

    normalizeFreeDayPreference(value) {
        const normalized = this.normalizeStringValue(value)?.toLowerCase();

        if (!normalized || normalized === 'no-preference' || normalized === 'sense-preferencia') {
            return null;
        }

        const aliases = {
            monday: 'monday',
            dilluns: 'monday',
            tuesday: 'tuesday',
            dimarts: 'tuesday',
            wednesday: 'wednesday',
            dimecres: 'wednesday',
            thursday: 'thursday',
            dijous: 'thursday',
            friday: 'friday',
            divendres: 'friday'
        };

        return aliases[normalized] || normalized;
    }

    normalizePreferredTime(value) {
        const normalized = this.normalizeStringValue(value)?.toLowerCase();

        if (!normalized || normalized === 'no-preference' || normalized === 'sense-preferencia') {
            return null;
        }

        if (normalized === 'morning' || normalized === 'afternoon') {
            return normalized;
        }

        return null;
    }

    normalizeEmploymentValue(value) {
        if (value === true || value === 'true') {
            return true;
        }

        if (value === false || value === 'false') {
            return false;
        }

        return null;
    }

    normalizePreferences(source = {}, fallback = this.getDefaultPreferences()) {
        return {
            optimization: this.inferOptimizationFromLegacy(source) || fallback.optimization
        };
    }

    loadSelectedSubjects() {
        const storage = this.loadSelectedSubjectsStorage();
        const degree = storage.currentDegree || '';

        if (!degree) {
            window.location.href = 'subjects-selector.html';
            return;
        }

        this.selectedSubjects = storage;
        this.currentDegree = degree;
        this.currentUserDegreeKey = this.getUserDegreeKey(degree);
    }

    displaySubjectsSummary() {
        if (!this.selectedSubjects) {
            return;
        }

        const subjectCount = document.getElementById('subjectCount');
        const totalEcts = document.getElementById('totalEctsSummary');

        if (subjectCount) {
            const currentEntry = this.getSelectedSubjectsEntry();
            const count = Array.isArray(currentEntry.selectedSubjects)
                ? currentEntry.selectedSubjects.length
                : 0;
            subjectCount.textContent = count;
        }

        if (totalEcts) {
            totalEcts.textContent = this.getSelectedSubjectsEntry().totalEcts ?? 0;
        }
    }

    loadSavedPreferencesFromSession() {
        const storage = this.loadPreferencesStorage();
        const key = this.getUserDegreeKey();
        this.currentUserDegreeKey = key;

        if (key && storage.preferencesByKey[key]) {
            this.preferences = this.normalizePreferences(storage.preferencesByKey[key], this.preferences);
            this.renderPreferencesToForm();
            return true;
        }

        this.renderPreferencesToForm();
        return false;
    }

    renderPreferencesToForm() {
        const optimizationRadio = document.querySelector(
            `input[name="optimization"][value="${this.preferences.optimization}"]`
        );
        if (optimizationRadio) {
            optimizationRadio.checked = true;
        }
    }

    collectPreferencesFromForm() {
        const selectedOptimization = document.querySelector('input[name="optimization"]:checked');

        return this.normalizePreferences({
            optimization: selectedOptimization?.value
        }, this.preferences);
    }

    attachEventListeners() {
        document.querySelectorAll('input[name="optimization"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                this.preferences.optimization = this.normalizeOptimization(radio.value);
            });
        });

        const backBtn = document.getElementById('backBtn');
        const saveBtn = document.getElementById('saveBtn');
        const continueBtn = document.getElementById('continueBtn');

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = 'subjects-selector.html';
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.savePreferences());
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.savePreferences({ redirectAfterSave: true }));
        }

        // Flux de passos: utilitza la mateixa lògica de guardat abans d'anar al pas de generar
        document.querySelectorAll('.workflow-quick-nav .step-link').forEach((link) => {
            link.addEventListener('click', (event) => {
                const href = link.getAttribute('href') || '';
                if (href === 'calendar-creation.html') {
                    event.preventDefault();
                    this.savePreferences({ redirectAfterSave: true });
                }
            });
        });
    }

    persistPreferencesToSession(preferences) {
        this.persistPreferencesStorage(preferences, this.getUserDegreeKey());
    }

    async syncPreferencesFromBackend() {
        const username = this.getUsername();
        if (!username) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                return;
            }

            const profile = await response.json();
            this.preferences = this.normalizePreferences(profile, this.preferences);
            this.persistPreferencesToSession(this.preferences);
            this.renderPreferencesToForm();
        } catch (error) {
            console.error('Error carregant preferències des del perfil:', error);
        }
    }

    async persistPreferencesToProfile(preferences) {
        const username = this.getUsername();
        if (!username) {
            return;
        }

        const response = await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({
                optimization: preferences.optimization
            })
        });

        if (!response.ok) {
            let errorMessage = `Error desant preferències (${response.status})`;
            try {
                const payload = await response.json();
                errorMessage = payload?.message || payload?.error || errorMessage;
            } catch (error) {
                try {
                    const text = await response.text();
                    if (text) {
                        errorMessage = text;
                    }
                } catch (ignored) {
                    // Ignore parsing failures and keep the fallback message.
                }
            }

            throw new Error(errorMessage);
        }

        return response.json().catch(() => null);
    }

    async persistSelectedSubjectsToProfile() {
        const username = this.getUsername();
        if (!username) return;

        const raw = sessionStorage.getItem('selectedSubjects');
        if (!raw) return;

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            return;
        }

        const degree = parsed.currentDegree || '';
        const entry = parsed.selectionsByDegree?.[degree] || null;
        if (!entry) return;

        const normalizedSelectedSubjects = Array.from(new Set(
            (Array.isArray(entry.selectedSubjects) ? entry.selectedSubjects : [])
                .map(code => String(code || '').trim().replace(/(?:__T|_)[1-9]\d*$/, ''))
                .filter(Boolean)
        ));

        try {
            await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    selectedSubjects: normalizedSelectedSubjects
                })
            });
        } catch (error) {
            console.error('Error persistint assignatures des de preferences:', error);
        }
    }

    async savePreferences({ redirectAfterSave = false } = {}) {
        const currentPreferences = this.collectPreferencesFromForm();
        this.preferences = currentPreferences;
        this.currentUserDegreeKey = this.getUserDegreeKey();

        try {
            await this.persistPreferencesToProfile(currentPreferences);
            // Also persist selected subjects if any
            await this.persistSelectedSubjectsToProfile();
            this.persistPreferencesToSession(currentPreferences);
            this.showNotification('Preferències i selecció desades correctament', 'success');

            if (redirectAfterSave) {
                window.setTimeout(() => {
                    // Redirect to a pre-generation review page
                    window.location.href = 'calendar-review.html';
                }, 350);
            }
        } catch (error) {
            console.error('Error desant preferències:', error);
            this.showNotification(error.message || 'No s\'han pogut desar les preferències', 'error');
        }
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

        window.setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            window.setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PreferencesManager();
});

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

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .spinner {
        width: 20px;
        height: 20px;
        animation: spin 1s linear infinite;
    }
`;
document.head.appendChild(style);
