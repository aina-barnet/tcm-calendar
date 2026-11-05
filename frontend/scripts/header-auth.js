document.addEventListener('DOMContentLoaded', async function () {
    const headerContainer = document.getElementById('header-container');
    if (!headerContainer) return;

    async function updateHeader() {
        const isAuthenticated = AuthState.isAuthenticated();
        const avatarSrc = AuthState.getAvatar();
        const username = isAuthenticated ? await AuthState.getDisplayName() || AuthState.getUsername() : null;

        const headerHTML = `
        <header class="top-header">
            <div class="header-container">
                <div class="logo-section">
                    <img src="assets/images/logo_horitz.png" alt="TecnoCampus" class="tecnocampus-logo">
                </div>
                <div id="nav-container"></div>
                <div class="auth-section">
                    ${isAuthenticated ? `
                        <span class="welcome-text">Bienvenido, ${username}</span>
                        <a href="user-profile.html" class="profile-link">
                            <img src="${avatarSrc}" alt="Profile" class="profile-avatar">
                        </a>
                    ` : `
                        <a href="login.html" class="auth-button login-btn">Iniciar sessió</a>
                        <a href="register.html" class="auth-button register-btn">Crear compte</a>
                    `}
                </div>
            </div>
        </header>`;

        headerContainer.innerHTML = headerHTML;
    }

    // Load avatar from server if authenticated with default avatar
    if (AuthState.isAuthenticated() && AuthState.getAvatar() === AuthState.DEFAULT_AVATAR) {
        await AuthState.loadAvatarFromServer();
    }

    updateHeader();
    AuthHelper.onAuthStateChange(updateHeader);
});