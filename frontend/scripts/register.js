/**
 * Password validation utilities for registration
 */
const PasswordValidator = {
    // IMPORTANT: Special characters must match backend: !@#$%^&*()-+=<>?/[]{}|
    SPECIAL_CHARS_PATTERN: /[!@#$%^&*()\-+=<>?/\[\]{}|]/,
    MIN_LENGTH: 8,

    /**
     * Check password strength (0-5)
     */
    checkStrength(password) {
        let strength = 0;
        const requirements = {
            length: password.length >= this.MIN_LENGTH,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: this.SPECIAL_CHARS_PATTERN.test(password)
        };

        Object.values(requirements).forEach(met => {
            if (met) strength++;
        });

        return {strength, requirements};
    },

    /**
     * Get strength level text
     */
    getStrengthLabel(strength) {
        const labels = {
            0: '',
            1: 'Feble',
            2: 'Feble',
            3: 'Regular',
            4: 'Bona',
            5: 'Molt forta'
        };
        return labels[strength] || '';
    },

    /**
     * Get strength level CSS class
     */
    getStrengthClass(strength) {
        if (strength <= 2) return 'weak';
        if (strength === 3) return 'fair';
        if (strength === 4) return 'good';
        return 'strong';
    },

    /**
     * Validate password meets minimum requirements
     */
    isValid(password) {
        const {strength} = this.checkStrength(password);
        return strength >= 4;
    }
};

document.addEventListener('DOMContentLoaded', function () {
    // Cache DOM elements
    const loadingOverlay = document.getElementById('loadingOverlay');
    const registerForm = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const googleRegisterBtn = document.getElementById('googleRegisterBtn');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    const passwordMatch = document.getElementById('passwordMatch');

    // Requirement elements
    const requirementElements = {
        length: document.getElementById('req-length'),
        uppercase: document.getElementById('req-uppercase'),
        lowercase: document.getElementById('req-lowercase'),
        number: document.getElementById('req-number'),
        special: document.getElementById('req-special')
    };

    /**
     * Show error message
     */
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    /**
     * Update requirement indicator UI
     */
    function updateRequirements(requirements) {
        Object.entries(requirementElements).forEach(([key, element]) => {
            if (!element) return;
            const isValid = requirements[key];
            const icon = element.querySelector('.req-icon');

            element.classList.toggle('valid', isValid);
            if (icon) icon.textContent = isValid ? '✓' : '○';
        });
    }

    /**
     * Update strength indicator UI
     */
    function updateStrengthIndicator(strength) {
        if (!strengthFill || !strengthText) return;

        strengthFill.className = 'strength-fill';
        strengthText.className = 'strength-text';

        if (strength === 0) {
            strengthFill.style.width = '0%';
            strengthText.textContent = '';
        } else {
            const progressPercent = (strength / 5) * 100;
            strengthFill.style.width = `${progressPercent}%`;
            strengthFill.classList.add(PasswordValidator.getStrengthClass(strength));
            strengthText.classList.add(PasswordValidator.getStrengthClass(strength));
            strengthText.textContent = PasswordValidator.getStrengthLabel(strength);
        }
    }

    /**
     * Update password match indicator
     */
    function updatePasswordMatch() {
        if (!passwordMatch || !confirmPasswordInput || !passwordInput) return;

        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (confirmPassword.length === 0) {
            passwordMatch.classList.remove('show');
            return;
        }

        passwordMatch.classList.add('show');
        const isMatch = password === confirmPassword;
        passwordMatch.classList.toggle('match', isMatch);
        passwordMatch.classList.toggle('no-match', !isMatch);
        passwordMatch.textContent = isMatch
            ? '✓ Les contrasenyes coincideixen'
            : '✗ Les contrasenyes no coincideixen';
    }

    /**
     * Handle password input changes
     */
    function handlePasswordInput() {
        const {strength, requirements} = PasswordValidator.checkStrength(passwordInput.value);
        updateStrengthIndicator(strength);
        updateRequirements(requirements);
        updatePasswordMatch();
    }

    // Event listeners for password fields
    if (passwordInput) {
        passwordInput.addEventListener('input', handlePasswordInput);
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', updatePasswordMatch);
    }

    // Toggle password visibility
    EventHelper.setupPasswordToggle(document.getElementById('togglePassword'), passwordInput);
    EventHelper.setupPasswordToggle(document.getElementById('toggleConfirmPassword'), confirmPasswordInput);

    /**
     * Create user data object from auth response
     */
    function createUserData(authData, email) {
        return {
            email: authData?.email || email,
            username: authData?.username || StringHelper.getUsernameFromEmail(email),
            name: authData?.username || StringHelper.getUsernameFromEmail(email),
            avatar: 'assets/images/default-avatar.svg'
        };
    }

    /**
     * Set authenticated state in storage
     */
    function setAuthenticated(userData, token) {
        if (typeof AuthState !== 'undefined') {
            return AuthState.setAuthenticated(userData, token);
        } else {
            StorageHelper.setItem('user', userData);
            localStorage.setItem('token', token);
            return true;
        }
    }

    // Handle OAuth2 callback
    const oauth = AuthHelper.parseOAuthParams();

    if (oauth.oauthStatus === 'success' && oauth.token) {
        const userData = createUserData(
            {email: oauth.email, username: oauth.username},
            oauth.email
        );
        setAuthenticated(userData, oauth.token);
        window.location.href = 'tcm-calendar.html';
        return;
    }

    if (oauth.error === 'oauth_failed') {
        showError(oauth.message || 'Error al registrarse con Google');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Google OAuth2 register/login
    if (googleRegisterBtn) {
        googleRegisterBtn.addEventListener('click', function () {
            UIHelper.toggleLoading(loadingOverlay, true);
            googleRegisterBtn.disabled = true;
            setTimeout(() => {
                if (document.body.contains(loadingOverlay)) {
                    UIHelper.toggleLoading(loadingOverlay, false);
                    googleRegisterBtn.disabled = false;
                }
            }, 5000);
            window.location.href = 'http://localhost:8080/oauth2/authorization/google';
        });
    }

    // Form submission
    registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorMessage.style.display = 'none';

        const email = document.getElementById('email').value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validate email is not empty
        if (!email) {
            showError('Per favor, introdueix un correu electrònic.');
            return;
        }

        // Validate password match
        if (password !== confirmPassword) {
            showError('Les contrasenyes no coincideixen');
            return;
        }

        // Validate password strength
        if (!PasswordValidator.isValid(password)) {
            showError('La contrasenya ha de ser més forta. Assegura\'t que compleix tots els requisits.');
            return;
        }

        UIHelper.toggleLoading(loadingOverlay, true);

        try {
            const result = await APIHelper.post('http://localhost:8080/api/authenticate/signup', {
                email,
                password
            });

            if (result.ok && result.data?.token) {
                const userData = createUserData(result.data, email);
                if (setAuthenticated(userData, result.data.token)) {
                    window.location.href = 'tcm-calendar.html';
                    return;
                }

                showError('No s\'ha pogut crear el compte. Torna-ho a provar.');
                return;
            }

            showError(result.error || 'Error en el registre');
        } catch (error) {
            console.error('Register error:', error);
            showError('S\'ha produït un error inesperat. Torna-ho a provar.');
        } finally {
            UIHelper.toggleLoading(loadingOverlay, false);
        }
    });
});