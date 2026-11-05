// Floating action bar: promote the existing .form-actions to a floating bottom bar when scrolling
(function () {
    const SHOW_THRESHOLD = 150;
    let lastY = window.scrollY || 0;
    let ticking = false;

    function updateVisibility() {
        const y = window.scrollY || 0;
        document.querySelectorAll('.form-actions').forEach(el => {
            if (y < SHOW_THRESHOLD) {
                el.classList.remove('floating', 'visible');
                el.style.transform = '';
            } else {
                el.classList.add('floating');
                if (y < lastY) {
                    el.classList.add('visible');
                    const offset = Math.round(Math.sin(y / 200) * 6);
                    // apply small vertical offset for subtle movement
                    if (window.matchMedia('(max-width: 480px)').matches) {
                        el.style.transform = `translateX(0) translateY(${offset}px)`;
                    } else {
                        el.style.transform = `translateX(-50%) translateY(${offset}px)`;
                    }
                } else {
                    el.classList.remove('visible');
                    if (window.matchMedia('(max-width: 480px)').matches) {
                        el.style.transform = `translateX(0) translateY(100%)`;
                    } else {
                        el.style.transform = `translateX(-50%) translateY(100%)`;
                    }
                }
            }
        });
        lastY = y;
    }

    function onScroll() {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateVisibility();
                ticking = false;
            });
            ticking = true;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        // initial update
        updateVisibility();
        window.addEventListener('scroll', onScroll, {passive: true});
        // Basic navigation wiring: make Continue/Back buttons navigate between steps
        const continueBtn = document.getElementById('continueBtn');
        if (continueBtn) {
            const path = window.location.pathname;
            if (path.endsWith('subjects-selector.html') || path.endsWith('/subjects-selector.html')) {
                return;
            }

            continueBtn.addEventListener('click', () => {
                // only navigate when not disabled
                if (!continueBtn.disabled) {
                    // decide destination by current page
                    if (path.endsWith('subjects-selector.html') || path.endsWith('/subjects-selector.html')) {
                        window.location.href = 'preferences-selector.html';
                    } else if (path.endsWith('preferences-selector.html') || path.endsWith('/preferences-selector.html')) {
                        window.location.href = 'calendar-creation.html';
                    }
                }
            });
        }

        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const path = window.location.pathname;
                if (path.endsWith('preferences-selector.html') || path.endsWith('/preferences-selector.html')) {
                    window.location.href = 'subjects-selector.html';
                } else if (path.endsWith('calendar-creation.html') || path.endsWith('/calendar-creation.html')) {
                    window.location.href = 'preferences-selector.html';
                }
            });
        }
    });
})();
