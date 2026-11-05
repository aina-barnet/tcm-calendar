document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('resetForm');
    const messageDiv = document.getElementById('resetMessage');

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value.trim();
        messageDiv.style.display = 'none';
        if (!email.endsWith('@edu.tecnocampus.cat')) {
            messageDiv.textContent = 'Només es permeten emails @edu.tecnocampus.cat.';
            messageDiv.style.display = 'block';
            return;
        }
        // Envia la petició al backend
        try {
            const res = await fetch('http://localhost:8080/api/authenticate/reset-password', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email})
            });
            if (res.ok) {
                messageDiv.textContent = 'Rebràs un correu amb l’enllaç per establir una nova contrasenya.';
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#c6f6d5';
                messageDiv.style.color = '#276749';
            } else {
                const data = await res.json();
                messageDiv.textContent = data.message || 'No s’ha pogut enviar l’enllaç. Comprova l’email.';
                messageDiv.style.display = 'block';
            }
        } catch (err) {
            messageDiv.textContent = 'Error de connexió. Torna-ho a intentar.';
            messageDiv.style.display = 'block';
        }
    });
});
