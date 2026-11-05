/**
 * Shared utilities and helper functions across scripts
 * Focus: reduce duplication, clarify names, safer defaults
 */

// Small internal helpers (not part of public API)
function safeParseJSON(value, defaultValue = null) {
    try {
        if (value === undefined || value === null || value === '') return defaultValue;
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (err) {
        console.error('safeParseJSON failed:', err);
        return defaultValue;
    }
}

function safeExecute(fn, context = null) {
    try {
        return fn && fn.call ? fn.call(context) : undefined;
    } catch (err) {
        console.error('safeExecute error:', err);
    }
}

// === Storage & Cache ===
const StorageHelper = {
    parseJSON(value, defaultValue = null) {
        return safeParseJSON(value, defaultValue);
    },

    setItem(key, value) {
        try {
            const payload = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, payload);
        } catch (err) {
            console.error('StorageHelper.setItem failed for', key, err);
        }
    },

    getItem(key, defaultValue = null) {
        try {
            return this.parseJSON(localStorage.getItem(key), defaultValue);
        } catch (err) {
            console.error('StorageHelper.getItem failed for', key, err);
            return defaultValue;
        }
    }
    ,
    removeItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (err) {
            console.error('StorageHelper.removeItem failed for', key, err);
        }
    }
};

// === String Utilities ===
const StringHelper = {
    getUsernameFromEmail(email) {
        if (!email || typeof email !== 'string') return null;
        return email.split('@')[0] || null;
    },

    capitalize(str) {
        if (!str || typeof str !== 'string') return '';
        const s = str.trim();
        if (!s) return '';
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    },

    parseEmailToName(email) {
        if (!email || typeof email !== 'string') return {firstName: '', lastNames: ''};

        const emailPart = (email.split('@')[0] || '').trim();
        if (!emailPart) return {firstName: '', lastNames: ''};

        const parts = emailPart.split(/[.\-_]/).filter(Boolean);
        const firstName = this.capitalize(parts[0] || '');
        const lastNames = parts.length > 1 ? parts.slice(1).map(p => this.capitalize(p)).join(' ') : '';
        return {firstName, lastNames};
    },

    isValidString(str) {
        return typeof str === 'string' && str !== 'null' && str.trim() !== '';
    },

    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};

// === Authentication Helpers ===
const AuthHelper = {
    _authListenerSetup: false,

    resolveUsername(user) {
        if (!user) return null;
        if (StringHelper.isValidString(user.username)) {
            return user.username.trim();
        }

        const emailUsername = StringHelper.getUsernameFromEmail(user?.email || '');
        if (StringHelper.isValidString(emailUsername)) {
            return emailUsername.trim();
        }

        // Only accept name as identifier when it already looks like a username.
        if (StringHelper.isValidString(user.name) && !/\s/.test(user.name)) {
            return user.name.trim();
        }

        return null;
    },

    onAuthStateChange(callback) {
        if (typeof callback !== 'function') return;

        // invoke immediately (safe)
        safeExecute(callback);

        if (this._authListenerSetup) return;
        this._authListenerSetup = true;

        window.addEventListener('authStateChange', () => safeExecute(callback));
        window.addEventListener('storage', (e) => {
            if (['user', 'token', 'isLoggedIn'].includes(e.key)) safeExecute(callback);
        });
    },

    parseOAuthParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            oauthStatus: params.get('oauth'),
            token: params.get('token'),
            email: params.get('email'),
            username: params.get('username'),
            error: params.get('error'),
            message: params.get('message')
        };
    }
};

// === UI Helpers ===
const UIHelper = {
    NOTIFICATION_COLORS: {
        success: '#48bb78',
        error: '#f56565',
        warning: '#ecc94b',
        info: '#4299e1'
    },

    toggleLoading(loadingOverlay, show = true) {
        if (loadingOverlay && loadingOverlay.classList) {
            loadingOverlay.classList.toggle('active', !!show);
        }
    },

    setElementsDisplay(target, visible) {
        if (!target) return;
        const display = visible ? 'block' : 'none';

        // Accept objects mapping, NodeList, Array, or single Element
        if (target instanceof Element) {
            target.style.display = display;
            return;
        }

        if (NodeList.prototype.isPrototypeOf(target) || Array.isArray(target)) {
            target.forEach(el => {
                if (el && el.style) el.style.display = display;
            });
            return;
        }

        // Fallback: object with values
        Object.values(target).forEach(el => {
            if (el && el.style) el.style.display = display;
        });
    },

    setSummaryList(container, items, emptyMessage = 'No items') {
        if (!container) return;
        container.innerHTML = '';

        const list = (Array.isArray(items) && items.length > 0) ? items : [emptyMessage];
        const frag = document.createDocumentFragment();
        list.forEach(item => {
            const li = document.createElement('li');
            li.textContent = StringHelper.escapeHtml(item);
            frag.appendChild(li);
        });
        container.appendChild(frag);
    },

    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        const bgColor = this.NOTIFICATION_COLORS[type] || this.NOTIFICATION_COLORS.info;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 16px 24px;
            background: ${bgColor};
            color: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        const safeDuration = typeof duration === 'number' && duration > 0 ? duration : 3000;
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, safeDuration);
    }
};

// === API Helpers ===
const APIHelper = {
    REQUEST_TIMEOUT_MS: 15000,

    async fetch(url, options = {}) {
        const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
            ? options.timeoutMs
            : this.REQUEST_TIMEOUT_MS;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const token = (typeof AuthState !== 'undefined' && AuthState.getToken) ? AuthState.getToken() : null;
        const authHeaders = token ? {Authorization: `Bearer ${token}`} : {};
        const headers = {'Content-Type': 'application/json', ...authHeaders, ...(options.headers || {})};
        const {timeoutMs: _ignoredTimeoutMs, ...requestOptions} = options;
        const config = {...requestOptions, headers, signal: controller.signal};

        try {
            const response = await fetch(url, config);

            let data = null;
            try {
                const contentType = response.headers && response.headers.get ? response.headers.get('content-type') : '';
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json().catch(() => null);
                }
            } catch (e) {
                // keep data as null
            }

            if ((response.status === 401 || response.status === 403) && authHeaders.Authorization && typeof AuthState !== 'undefined' && AuthState.handleInvalidSession) {
                safeExecute(() => AuthState.handleInvalidSession());
            }

            return {
                ok: response.ok,
                status: response.status,
                data,
                error: !response.ok ? (data?.message || `Error ${response.status}`) : null
            };
        } catch (error) {
            console.error('APIHelper.fetch error:', error);
            const isAbortError = error && error.name === 'AbortError';
            return {
                ok: false,
                status: 0,
                data: null,
                error: isAbortError ? 'La petició ha trigat massa. Torna-ho a provar.' : 'Connection error. Please try again.'
            };
        } finally {
            clearTimeout(timeoutId);
        }
    },

    get(url) {
        return this.fetch(url, {method: 'GET'});
    },
    post(url, body) {
        return this.fetch(url, {method: 'POST', body: JSON.stringify(body)});
    },
    put(url, body) {
        return this.fetch(url, {method: 'PUT', body: JSON.stringify(body)});
    },
    delete(url) {
        return this.fetch(url, {method: 'DELETE'});
    }
};

// === Time Utilities ===
const TimeHelper = {
    timeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const match = timeStr.trim().match(/^(\d{1,2})[:.](\d{2})$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        return hours * 60 + minutes;
    },

    minutesToTime(totalMinutes) {
        if (typeof totalMinutes !== 'number' || Number.isNaN(totalMinutes)) return '';
        const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const minutes = String(Math.abs(totalMinutes % 60)).padStart(2, '0');
        return `${hours}:${minutes}`;
    },

    formatDuration(minutes) {
        if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
        const h = Math.floor(minutes / 60);
        const m = Math.abs(minutes % 60);
        if (m === 0) return `${h}h`;
        return `${h}h ${m}min`;
    }
};

// === DOM Event Helpers ===
const EventHelper = {
    attachToElements(selectorOrElements, eventType, callback) {
        if (!selectorOrElements || typeof callback !== 'function') return;

        // If selector provided
        if (typeof selectorOrElements === 'string') {
            document.querySelectorAll(selectorOrElements).forEach(el => el && el.addEventListener(eventType, callback));
            return;
        }

        // NodeList or Array
        if (NodeList.prototype.isPrototypeOf(selectorOrElements) || Array.isArray(selectorOrElements)) {
            selectorOrElements.forEach(el => el && el.addEventListener(eventType, callback));
            return;
        }

        // Single element
        if (selectorOrElements instanceof Element) {
            selectorOrElements.addEventListener(eventType, callback);

        }
    },

    setupPasswordToggle(toggleBtn, inputField) {
        if (!toggleBtn || !inputField) return;
        toggleBtn.addEventListener('click', function () {
            const isPassword = inputField.type === 'password';
            inputField.type = isPassword ? 'text' : 'password';
            if (this.classList) this.classList.toggle('showing', isPassword);
        });
    },

    setupFormLoading(form, loadingOverlay, submitBtn) {
        if (!form || !form.addEventListener) return;
        form.addEventListener('submit', () => {
            UIHelper.toggleLoading(loadingOverlay, true);
            if (submitBtn) submitBtn.disabled = true;
        });
    }
};
