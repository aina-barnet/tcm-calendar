document.addEventListener('DOMContentLoaded', function () {
    // Check for OAuth2 callback parameters
    const oauth = AuthHelper.parseOAuthParams();
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    const sessionExpired = new URLSearchParams(window.location.search).get('session') === 'expired';

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    if (sessionExpired) {
        showError('La sessió ha caducat. Torna a iniciar sessió.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Handle OAuth2 success callback
    if (oauth.oauthStatus === 'success' && oauth.token) {
        const userData = {
            email: oauth.email,
            username: oauth.username || StringHelper.getUsernameFromEmail(oauth.email),
            name: oauth.username || StringHelper.getUsernameFromEmail(oauth.email),
            avatar: 'assets/images/default-avatar.svg'
        };
        if (AuthState.setAuthenticated(userData, oauth.token)) {
            window.location.href = 'tcm-calendar.html';
            return;
        }

        showError('No s\'ha pogut completar l\'inici de sessió. Torna-ho a provar.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Handle OAuth2 error callback
    if (oauth.error === 'oauth_failed') {
        showError(oauth.message || 'Error al iniciar sesión con Google');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (AuthState.redirectIfAuthenticated()) {
        return;
    }

    // Toggle password visibility
    EventHelper.setupPasswordToggle(togglePasswordBtn, passwordInput);

    // Google OAuth2 login
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', function () {
            UIHelper.toggleLoading(loadingOverlay, true);
            googleLoginBtn.disabled = true;
            setTimeout(() => {
                if (document.body.contains(loadingOverlay)) {
                    UIHelper.toggleLoading(loadingOverlay, false);
                    googleLoginBtn.disabled = false;
                }
            }, 5000);
            window.location.href = 'http://localhost:8080/oauth2/authorization/google';
        });
    }

    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        UIHelper.toggleLoading(loadingOverlay, true);

        try {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const result = await APIHelper.post('http://localhost:8080/api/authenticate/signin', {
                email,
                password
            });

            if (result.ok && result.data) {
                const userData = {
                    email: result.data.email || email,
                    username: result.data.username || StringHelper.getUsernameFromEmail(email),
                    name: result.data.username || StringHelper.getUsernameFromEmail(email),
                    avatar: 'assets/images/default-avatar.svg'
                };
                if (AuthState.setAuthenticated(userData, result.data.token)) {
                    window.location.href = 'tcm-calendar.html';
                    return;
                }

                showError('No s\'ha pogut iniciar sessió. Torna-ho a provar.');
                return;
            }

            showError(result.error || 'La contrasenya no coincideix amb el correu electrònic.');
        } catch (error) {
            console.error('Login error:', error);
            showError('S\'ha produït un error inesperat. Torna-ho a provar.');
        } finally {
            UIHelper.toggleLoading(loadingOverlay, false);
        }
    });
});