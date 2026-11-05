document.addEventListener('DOMContentLoaded', function () {
    // Omple email i token des de la URL
    const urlParams = new URLSearchParams(window.location.search);
    document.getElementById('email').value = urlParams.get('email') || '';
    document.getElementById('token').value = urlParams.get('token') || '';

    const form = document.getElementById('newPasswordForm');
    const messageDiv = document.getElementById('newPasswordMessage');

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const token = document.getElementById('token').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        messageDiv.style.display = 'none';
        if (!password || password.length < 8) {
            messageDiv.textContent = 'La contrasenya ha de tenir almenys 8 caràcters.';
            messageDiv.style.display = 'block';
            return;
        }
        if (password !== confirmPassword) {
            messageDiv.textContent = 'Les contrasenyes no coincideixen.';
            messageDiv.style.display = 'block';
            return;
        }
        try {
            const result = await APIHelper.post('http://localhost:8080/api/authenticate/new-password', {
                email,
                token,
                password
            });
            if (result.ok) {
                messageDiv.textContent = 'Contrasenya canviada correctament. Redirigint al login...';
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#c6f6d5';
                messageDiv.style.color = '#276749';
                setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            } else {
                messageDiv.textContent = result.error || 'No s’ha pogut canviar la contrasenya.';
                messageDiv.style.display = 'block';
            }
        } catch (err) {
            messageDiv.textContent = 'Error de connexió. Torna-ho a intentar.';
            messageDiv.style.display = 'block';
        }
    });
});
