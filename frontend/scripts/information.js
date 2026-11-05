/**
 * Script per millorar la usabilitat de la pàgina d'informació
 */

document.addEventListener('DOMContentLoaded', function () {
    // Scroll suau per als enllaços de l'índex
    const navLinks = document.querySelectorAll('.info-nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                // Scroll suau a l'element
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                // Focus a l'element per a accessibilitat
                setTimeout(() => {
                    targetElement.focus();
                }, 500);

                // Marcar l'enllaç actiu
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });

    // Botó per tornar a dalt
    const backToTopBtn = document.getElementById('backToTopBtn');

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', function () {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            // Focus al primer element després del scroll
            setTimeout(() => {
                document.querySelector('h1').focus();
            }, 500);
        });
    }

    // Detectar la secció visible i actualitzar l'índex
    const sections = document.querySelectorAll('article[id]');
    const navItems = document.querySelectorAll('.info-nav-link');

    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navItems.forEach(item => {
                    item.classList.remove('active');
                    if (item.getAttribute('href') === `#${id}`) {
                        item.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => {
        observer.observe(section);
    });

    // Animació d'entrada per a les seccions
    const sectionObserver = new IntersectionObserver(function (entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1
    });

    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        sectionObserver.observe(section);
    });

    // Millorar l'accessibilitat del teclat
    document.addEventListener('keydown', function (e) {
        // Tecla 'Esc' per tancar el menú lateral si està obert
        if (e.key === 'Escape') {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('active')) {
                const toggleBtn = document.getElementById('toggleSidebar');
                if (toggleBtn) {
                    toggleBtn.click();
                }
            }
        }

        // Alt + T per tornar a dalt
        if (e.altKey && e.key === 't') {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    });

    // Afegir indicador de lectura
    createReadingProgressBar();
});

/**
 * Crea una barra de progrés de lectura
 */
function createReadingProgressBar() {
    const progressBar = document.createElement('div');
    progressBar.className = 'reading-progress-bar';
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-label', 'Progrés de lectura');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');

    document.body.appendChild(progressBar);

    window.addEventListener('scroll', function () {
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight - windowHeight;
        const scrolled = window.scrollY;
        const progress = (scrolled / documentHeight) * 100;

        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', Math.round(progress));
    });
}
