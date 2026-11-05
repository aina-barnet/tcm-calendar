/**
 * Sidebar Toggle Functionality
 * Aquest script gestiona l'obertura i tancament de la sidebar
 * Funciona a totes les pàgines de l'aplicació
 */

document.addEventListener('DOMContentLoaded', function () {
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function setExpandedState(isExpanded) {
        if (toggleSidebarBtn) {
            toggleSidebarBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        }
    }

    // Funció per obrir/tancar la sidebar
    function toggleSidebar() {
        if (sidebar && sidebarOverlay) {
            sidebar.classList.toggle('show');
            sidebarOverlay.classList.toggle('show');
            document.body.classList.toggle('sidebar-open');
            setExpandedState(sidebar.classList.contains('show'));
        }
    }

    // Funció per tancar la sidebar
    function closeSidebar() {
        if (sidebar && sidebarOverlay) {
            sidebar.classList.remove('show');
            sidebarOverlay.classList.remove('show');
            document.body.classList.remove('sidebar-open');
            setExpandedState(false);
        }
    }

    // Event listeners
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    window.addEventListener('authStateChange', function () {
        if (!AuthState.isAuthenticated()) {
            closeSidebar();
        }
    });

    window.addEventListener('storage', function (e) {
        if (e.key === 'user' || e.key === 'token' || e.key === 'isLoggedIn') {
            if (!AuthState.isAuthenticated()) {
                closeSidebar();
            }
        }
    });

    // Tancar sidebar amb la tecla Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sidebar && sidebar.classList.contains('show')) {
            closeSidebar();
        }
    });

    // Tancar sidebar quan es fa click en un enllaç del menú (en mòbil)
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function () {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
});
