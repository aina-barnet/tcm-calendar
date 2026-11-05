// Gestión del estado de autenticación
const AuthState = {
    DEFAULT_AVATAR: 'assets/images/default-avatar.svg',
    STORAGE_KEYS: {
        user: 'user',
        token: 'token',
        isLoggedIn: 'isLoggedIn'
    },
    _cachedAvatar: null,

    parseTokenPayload(token) {
        if (!token || typeof token !== 'string') return null;

        const parts = token.split('.');
        if (parts.length !== 3) return null;

        try {
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
            const payload = atob(paddedBase64);
            return JSON.parse(payload);
        } catch (error) {
            console.error('Error parsing JWT payload:', error);
            return null;
        }
    },

    isTokenValid(token = this.getStoredToken()) {
        if (!token) return false;

        const payload = this.parseTokenPayload(token);
        if (!payload || !payload.exp) return false;

        return payload.exp * 1000 > Date.now();
    },

    getStoredToken() {
        return localStorage.getItem(this.STORAGE_KEYS.token);
    },

    clearAuthState(options = {}) {
        localStorage.removeItem(this.STORAGE_KEYS.user);
        localStorage.removeItem(this.STORAGE_KEYS.token);
        localStorage.removeItem(this.STORAGE_KEYS.isLoggedIn);

        if (options.clearSessionState) {
            sessionStorage.clear();
        }

        if (!options.keepAvatar) {
            this._cachedAvatar = null;
        }

        window.dispatchEvent(new Event('authStateChange'));
    },

    handleInvalidSession() {
        this.clearAuthState();

        if (!window.location.pathname.endsWith('/login.html')) {
            window.location.replace('login.html?session=expired');
        }
    },

    isAuthenticated() {
        const token = this.getStoredToken();
        const userStr = localStorage.getItem(this.STORAGE_KEYS.user);
        const isLoggedIn = localStorage.getItem(this.STORAGE_KEYS.isLoggedIn) === 'true';

        if (!token || !userStr) {
            if (token || userStr || isLoggedIn) {
                this.clearAuthState({ keepAvatar: false });
            }
            return false;
        }

        if (!this.isTokenValid(token)) {
            this.handleInvalidSession();
            return false;
        }

        if (!isLoggedIn) {
            localStorage.setItem(this.STORAGE_KEYS.isLoggedIn, 'true');
            window.dispatchEvent(new Event('authStateChange'));
        }

        return true;
    },

    getUser() {
        const userStr = localStorage.getItem(this.STORAGE_KEYS.user);
        console.log('AuthState.getUser() - raw string:', userStr);
        try {
            const user = userStr ? JSON.parse(userStr) : null;
            if (user) {
                user.avatar = this._cachedAvatar || this.DEFAULT_AVATAR;
            }
            return user;
        } catch (e) {
            console.error('Error parsing user JSON:', e);
            return null;
        }
    },

    getUsername() {
        const user = this.getUser();
        return user ? AuthHelper.resolveUsername(user) : null;
    },

    // Obtenir el nom per mostrar (nom complet o part de l'email)
    async getDisplayName() {
        const user = this.getUser();
        if (!user) return null;

        const username = AuthHelper.resolveUsername(user);
        try {
            const response = await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                const profile = await response.json();
                if (StringHelper.isValidString(profile.firstName)) {
                    const hasLastNames = StringHelper.isValidString(profile.lastNames);
                    return hasLastNames ? `${profile.firstName} ${profile.lastNames}` : profile.firstName;
                }
            }
        } catch (error) {
            console.log('No s\'ha pogut carregar el perfil, usant email');
        }

        // Si no hi ha nom al perfil, mostrar directament la part de l'email abans de @
        return user.email.split('@')[0];
    },

    // Formatar email com a nom (nom.cognom@... -> Nom Cognom)
    formatEmailAsName(email) {
        const parsed = StringHelper.parseEmailToName(email);
        return parsed.firstName + (parsed.lastNames ? ` ${parsed.lastNames}` : '');
    },

    // Obtenir l'avatar de l'usuari (des de cache local)
    getAvatar() {
        return this._cachedAvatar || this.DEFAULT_AVATAR;
    },

    // Establir l'avatar a la cache local (s'envia al servidor al guardar el perfil)
    setAvatar(avatarSrc) {
        this._cachedAvatar = avatarSrc;
        // Disparar event per notificar el canvi visual
        window.dispatchEvent(new Event('avatarChange'));
    },

    // Carregar avatar des de la base de dades
    async loadAvatarFromServer() {
        const username = this.getUsername();
        if (!username) return;

        try {
            const response = await fetch(`http://localhost:8080/api/profile/${encodeURIComponent(username)}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                const profile = await response.json();
                this._cachedAvatar = profile.avatar || this.DEFAULT_AVATAR;
                window.dispatchEvent(new Event('avatarChange'));
            }
        } catch (error) {
            console.error('Error carregant avatar des del servidor:', error);
        }
    },

    setAuthenticated(userData, token) {
        if (!token || !this.isTokenValid(token)) {
            this.clearAuthState();
            return false;
        }

        localStorage.setItem(this.STORAGE_KEYS.user, JSON.stringify(userData));
        localStorage.setItem(this.STORAGE_KEYS.isLoggedIn, 'true');
        localStorage.setItem(this.STORAGE_KEYS.token, token);

        // Dispatch event to notify other components
        window.dispatchEvent(new Event('authStateChange'));
        return true;
    },

    logout() {
        this.clearAuthState({ clearSessionState: true });

        // After logout, go to the login page so the user sees the login/register UI
        window.location.replace('login.html');
    },

    // Obtener el email del usuario
    getEmail() {
        const user = this.getUser();
        return user ? user.email : null;
    },

    // Obtener el token
    getToken() {
        const token = this.getStoredToken();
        if (!token) return null;

        if (!this.isTokenValid(token)) {
            this.clearAuthState();
            return null;
        }

        return token;
    },

    getAuthHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders
        };

        const token = this.getToken();
        if (token && !headers.Authorization) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    },

    // Función para proteger rutas
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    // Función para redirigir si ya está autenticado
    redirectIfAuthenticated() {
        if (this.isAuthenticated()) {
            window.location.replace('tcm-calendar.html');
            return true;
        }
        return false;
    }
};