package com.tecnocampus.backend.registration.application;

import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

@Service
public class EmailService {
    private final JavaMailSender mailSender;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendResetPasswordEmail(String to, String resetLink) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true);
        helper.setTo(to);
        helper.setSubject("Recuperació de contrasenya - TCM Calendar");
        helper.setText("<p>Hola,</p>"
                + "<p>Has sol·licitat restablir la teva contrasenya. Fes clic a l'enllaç següent per establir una nova contrasenya:</p>"
                + "<p><a href='" + resetLink + "'>Restablir contrasenya</a></p>"
                + "<p>Si no has fet aquesta sol·licitud, ignora aquest correu.</p>", true);
        mailSender.send(message);
    }
}
