document.addEventListener('DOMContentLoaded', function () {
    // Elements for logged in state
    const profileLoggedIn = document.querySelector('.profile-logged-in');
    const profileLoggedOut = document.querySelector('.profile-logged-out');
    const profileName = document.querySelector('.profile-name');
    const profileEmail = document.querySelector('.profile-email');
    const profileAvatar = document.querySelector('.profile-avatar');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const toggleSidebarBtn = document.getElementById('toggleSidebar');

    function syncSidebarChrome(isAuthenticated) {
        if (sidebar) {
            sidebar.dataset.authState = isAuthenticated ? 'authenticated' : 'anonymous';
        }

        if (!isAuthenticated) {
            if (sidebar) sidebar.classList.remove('show');
            if (sidebarOverlay) sidebarOverlay.classList.remove('show');
            document.body.classList.remove('sidebar-open');
            if (toggleSidebarBtn) {
                toggleSidebarBtn.setAttribute('aria-expanded', 'false');
            }
        }
    }

    // Log out button
    const logoutLink = document.querySelector('.logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', function (e) {
            e.preventDefault();
            handleLogout();
        });
    }

    // Check authentication state
    async function checkAuthState() {
        const isAuthenticated = AuthState.isAuthenticated();
        syncSidebarChrome(isAuthenticated);

        if (isAuthenticated) {
            const userData = AuthState.getUser();
            // Carregar avatar des del servidor si no està cached
            if (AuthState.getAvatar() === AuthState.DEFAULT_AVATAR) {
                await AuthState.loadAvatarFromServer();
            }
            await showLoggedInState(userData);
        } else {
            showLoggedOutState();
        }
    }

    // Show logged in state
    async function showLoggedInState(userData) {
        if (profileLoggedIn && profileLoggedOut) {
            profileLoggedIn.style.display = 'block';
            profileLoggedIn.classList.remove('hidden-until-auth');
            profileLoggedOut.style.display = 'none';

            // Obtenir nom del perfil o formatar l'email
            const displayName = await AuthState.getDisplayName();
            if (profileName) profileName.textContent = displayName || userData.name || userData.email.split('@')[0];
            if (profileEmail && userData.email) profileEmail.textContent = userData.email;

            // Usar AuthState.getAvatar() per obtenir l'avatar consistent
            const avatarSrc = AuthState.getAvatar();
            if (profileAvatar) {
                profileAvatar.innerHTML = `<img src="${avatarSrc}" alt="Profile">`;
            }
        }
    }

    // Show logged out state
    function showLoggedOutState() {
        if (profileLoggedIn && profileLoggedOut) {
            profileLoggedIn.style.display = 'none';
            profileLoggedIn.classList.add('hidden-until-auth');
            profileLoggedOut.style.display = 'block';

            if (!profileLoggedOut.querySelector('.auth-message')) {
                const authMessage = document.createElement('div');
                authMessage.className = 'auth-message';
                authMessage.innerHTML = `
                    <p class="auth-title">Encara no has iniciat sessió</p>
                    <p class="auth-subtitle">Accedeix per guardar assignatures, preferències i horaris.</p>
                `;
                profileLoggedOut.prepend(authMessage);
            }
        }
    }

    // Handle logout
    function handleLogout() {
        if (typeof showPopup === 'function') {
            showPopup('Vols tancar la sessió?', 'error', () => {
                AuthState.logout();
            }, {logoutConfirm: true});
            return;
        }

        // Fallback for pages where popup.js is not loaded
        if (window.confirm('Vols tancar la sessio?')) {
            AuthState.logout();
        }
    }

    // Listen for auth state changes
    window.addEventListener('storage', function (e) {
        if (e.key === 'user' || e.key === 'token') {
            checkAuthState();
        }
    });

    // Listen for authStateChange and avatarChange events
    window.addEventListener('authStateChange', checkAuthState);
    window.addEventListener('avatarChange', function () {
        // Actualitzar només l'avatar sense tornar a carregar del servidor
        const avatarSrc = AuthState.getAvatar();
        if (profileAvatar) {
            profileAvatar.innerHTML = `<img src="${avatarSrc}" alt="Profile">`;
        }
    });

    // Initial check
    checkAuthState();
});