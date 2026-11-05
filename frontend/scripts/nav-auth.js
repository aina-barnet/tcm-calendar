document.addEventListener('DOMContentLoaded', function () {
    const navContainer = document.getElementById('nav-container');

    if (!navContainer) return;

    function updateNavigation() {
        const isAuthenticated = AuthState.isAuthenticated();
        const username = AuthState.getUsername();

        const authNav = `
            <nav class="main-nav">
                <ul>
                    <li><a href="tcm-calendar.html">Inicio</a></li>
                    ${isAuthenticated ? `
                        <li><a href="saved-calendars.html">Mi Calendario</a></li>
                        <li><a href="user-profile.html">Perfil</a></li>
                        <li><a href="#" onclick="AuthState.logout(); return false;">Cerrar Sesión</a></li>
                    ` : `
                        <li><a href="login.html">Iniciar Sesión</a></li>
                        <li><a href="register.html">Registrarse</a></li>
                    `}
                </ul>
            </nav>
        `;

        navContainer.innerHTML = authNav;
    }

    // Actualizar la navegación inicialmente
    updateNavigation();

    // Escuchar cambios en el almacenamiento local
    window.addEventListener('storage', function (e) {
        if (e.key === 'user' || e.key === 'token') {
            updateNavigation();
        }
    });

    // Escuchar eventos de cambio de autenticación
    window.addEventListener('authStateChange', updateNavigation);
});