/**
 * Pop-up modal system for displaying messages instead of alert()
 * Usage:
 *   showPopup('Message', 'success' | 'error', callbackOpt)
 *   showPopup('Message?', 'info', callback, { confirm: true })
 */

const PopupManager = {
    // Get or create popup container
    getPopupElement() {
        let popup = document.getElementById('custom-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'custom-popup';
            document.body.appendChild(popup);
        }
        return popup;
    },

    /**
     * Show confirmation popup with Yes/No buttons
     */
    showConfirm(message, type, callback) {
        const popup = this.getPopupElement();
        popup.innerHTML = `
            <div class="popup-content">
                <span class="popup-message"></span>
                <div class="popup-actions">
                    <button class="popup-no">No</button>
                    <button class="popup-yes">Sí</button>
                </div>
            </div>
        `;

        const messageSpan = popup.querySelector('.popup-message');
        const noBtn = popup.querySelector('.popup-no');
        const yesBtn = popup.querySelector('.popup-yes');

        messageSpan.textContent = message;
        popup.className = type === 'error' ? 'popup-error' : 'popup-success';
        popup.style.display = 'flex';

        noBtn.onclick = () => {
            popup.style.display = 'none';
        };

        yesBtn.onclick = () => {
            popup.style.display = 'none';
            if (typeof callback === 'function') callback();
        };
    },

    /**
     * Show simple popup with close button
     */
    showSimple(message, type, callback) {
        const popup = this.getPopupElement();
        popup.innerHTML = `
            <div class="popup-content">
                <span class="popup-message"></span>
                <button class="popup-close">Tancar</button>
            </div>
        `;

        const messageSpan = popup.querySelector('.popup-message');
        const closeBtn = popup.querySelector('.popup-close');

        messageSpan.textContent = message;
        popup.className = type === 'error' ? 'popup-error' : 'popup-success';
        popup.style.display = 'flex';

        closeBtn.onclick = () => {
            popup.style.display = 'none';
            if (typeof callback === 'function') callback();
        };
    }
};

/**
 * Public interface for backward compatibility
 */
function showPopup(message, type = 'success', callback, options = {}) {
    if (options.confirm) {
        PopupManager.showConfirm(message, type, callback);
    } else {
        PopupManager.showSimple(message, type, callback);
    }
}
