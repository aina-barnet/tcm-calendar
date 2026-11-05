document.addEventListener('DOMContentLoaded', function () {
    const unauthenticatedContent = document.getElementById('unauthenticatedContent');
    const authenticatedContent = document.getElementById('authenticatedContent');
    const headerAuthSection = document.getElementById('headerAuthSection');
    const PROFILE_PAGE = 'user-profile.html';

    function updateContentVisibility() {
        const isAuthenticated = AuthState.isAuthenticated();

        if (isAuthenticated) {
            // Mostrar contingut per usuaris autenticats
            if (unauthenticatedContent) unauthenticatedContent.style.display = 'none';
            if (authenticatedContent) authenticatedContent.style.display = 'block';

            // Actualitzar header amb opcions d'usuari autenticat
            if (headerAuthSection) {
                headerAuthSection.innerHTML = `
                    <a href="${PROFILE_PAGE}" class="auth-button register-btn" id="profileBtn">Perfil</a>
                    <a href="#" class="auth-button login-btn" id="logoutBtn">Tancar sessió</a>
                `;

                const profileBtn = document.getElementById('profileBtn');
                if (profileBtn) {
                    profileBtn.setAttribute('href', PROFILE_PAGE);
                    profileBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        window.location.href = PROFILE_PAGE;
                    });
                }

                // Afegir event listener al botó de logout
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        AuthState.logout();
                    });
                }
            }
        } else {
            // Mostrar contingut per usuaris no autenticats
            if (unauthenticatedContent) unauthenticatedContent.style.display = 'block';
            if (authenticatedContent) authenticatedContent.style.display = 'none';

            // Actualitzar header amb opcions de login/registre
            if (headerAuthSection) {
                headerAuthSection.innerHTML = `
                    <a href="login.html" class="auth-button login-btn">Iniciar sessió</a>
                    <a href="register.html" class="auth-button register-btn">Crear compte</a>
                `;
            }
        }
    }

    // Actualizar visibilidad inicial
    updateContentVisibility();

    // Escuchar cambios en el estado de autenticación
    window.addEventListener('authStateChange', updateContentVisibility);

    // Escuchar cambios en localStorage (per si l'usuari obre una altra pestanya)
    window.addEventListener('storage', function (e) {
        if (e.key === 'isLoggedIn' || e.key === 'user' || e.key === 'token') {
            updateContentVisibility();
        }
    });
});