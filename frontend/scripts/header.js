/**
 * Helper to update auth section in header
 */
const PROFILE_PAGE = 'user-profile.html';

function updateAuthSection() {
    const authSection = document.querySelector('.auth-section');
    if (!authSection) return;

    if (AuthState.isAuthenticated()) {
        authSection.innerHTML = `
            <a href="${PROFILE_PAGE}" class="auth-button register-btn" id="profileBtn">Perfil</a>
            <a href="#" class="auth-button login-btn" id="logoutBtn">Tancar sessió</a>
        `;

        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn) {
            profileBtn.setAttribute('href', PROFILE_PAGE);
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = PROFILE_PAGE;
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                AuthState.logout();
            });
        }
    } else {
        authSection.innerHTML = `
            <a href="login.html" class="auth-button login-btn">Iniciar sessió</a>
            <a href="register.html" class="auth-button register-btn">Crear compte</a>
        `;
    }
}

// Scroll handling of header
let lastScrollTop = 0;
const minScroll = 50;
let isScrolling;

document.addEventListener('DOMContentLoaded', async function () {
    updateAuthSection();
});

AuthHelper.onAuthStateChange(updateAuthSection);

// Setup scroll behavior after a brief delay
setTimeout(() => {
    const header = document.querySelector('.top-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        clearTimeout(isScrolling);

        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

        if (currentScroll <= 0) {
            header.classList.remove('header-hidden');
            return;
        }

        if (Math.abs(lastScrollTop - currentScroll) <= minScroll) return;

        if (currentScroll > lastScrollTop) {
            header.classList.add('header-hidden');
        } else {
            if (currentScroll === 0) {
                header.classList.remove('header-hidden');
            } else {
                header.classList.add('header-hidden');
            }
        }

        lastScrollTop = currentScroll;

        isScrolling = setTimeout(() => {
            if (currentScroll === 0) {
                header.classList.remove('header-hidden');
            }
        }, 10);
    });
}, 10);