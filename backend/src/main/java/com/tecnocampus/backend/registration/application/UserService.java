package com.tecnocampus.backend.registration.application;

import org.springframework.beans.factory.annotation.Autowired;
import com.tecnocampus.backend.registration.application.DTOs.AuthResponse;
import com.tecnocampus.backend.registration.application.DTOs.LogInRequest;
import com.tecnocampus.backend.registration.application.DTOs.SignUpRequest;
import com.tecnocampus.backend.registration.domain.User;
import com.tecnocampus.backend.registration.domain.UserProfile;
import com.tecnocampus.backend.exceptions.DuplicateResourceException;
import com.tecnocampus.backend.exceptions.InvalidPasswordException;
import com.tecnocampus.backend.exceptions.UserNotFoundException;
import com.tecnocampus.backend.exceptions.ValidationException;
import com.tecnocampus.backend.registration.persistance.ProfileRepository;
import com.tecnocampus.backend.registration.persistance.UserRepository;
import com.tecnocampus.backend.registration.security.JwtService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    public void setNewPassword(String email, String token, String newPassword) {
        if (email == null || !email.endsWith("@edu.tecnocampus.cat")) {
            throw new ValidationException("Només es permeten emails @edu.tecnocampus.cat");
        }
        if (newPassword == null || newPassword.length() < 8) {
            throw new ValidationException("La contrasenya ha de tenir almenys 8 caràcters");
        }
        // En una implementació real, aquí es validaria el token (ara només mock)
        // Buscar usuari i canviar la contrasenya
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UserNotFoundException("No existeix cap usuari amb aquest email."));
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    private final EmailService emailService;
    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final JwtService jwtUtils;
    private final PasswordEncoder passwordEncoder;
    private final ProfileRepository profileRepository;

    @Autowired
    public UserService(AuthenticationManager authenticationManager,
            UserRepository userRepository,
            JwtService jwtUtils,
            PasswordEncoder passwordEncoder,
            ProfileRepository profileRepository,
            EmailService emailService) {
        this.emailService = emailService;
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.jwtUtils = jwtUtils;
        this.passwordEncoder = passwordEncoder;
        this.profileRepository = profileRepository;
    }

    public AuthResponse signInUser(LogInRequest loginRequest) {
        if (loginRequest.email() == null || loginRequest.email().trim().isEmpty()) {
            throw new ValidationException("Email cannot be empty");
        }
        if (!loginRequest.email().endsWith("@edu.tecnocampus.cat")) {
            throw new ValidationException("Invalid email format. Must be a tecnocampus email");
        }
        if (loginRequest.password() == null || loginRequest.password().trim().isEmpty()) {
            throw new InvalidPasswordException("Password cannot be empty");
        }

        if (!userRepository.existsByEmail(loginRequest.email())) {
            throw new UserNotFoundException("User not found with email: " + loginRequest.email());
        }

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.email(), loginRequest.password()));

        SecurityContextHolder.getContext().setAuthentication(authentication);
        User user = userRepository.findByEmail(loginRequest.email())
                .orElseThrow(() -> new UserNotFoundException("User not found"));

        String jwt = jwtUtils.generateToken(user);
        return new AuthResponse(jwt, user.getEmail(), user.getUsername());
    }

    private void validateSignUpRequest(SignUpRequest request) {
        if (request.email() == null || request.email().trim().isEmpty()) {
            throw new ValidationException("Email cannot be empty");
        }
        if (!request.email().endsWith("@edu.tecnocampus.cat")) {
            throw new ValidationException("Email must be a valid tecnocampus email");
        }
        validatePassword(request.password());
    }

    private void validatePassword(String password) {
        if (password == null || password.trim().isEmpty()) {
            throw new InvalidPasswordException("Password cannot be empty");
        }
        if (password.length() < 8) {
            throw new InvalidPasswordException("Password must be at least 8 characters long");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new InvalidPasswordException("Password must contain at least one uppercase letter");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new InvalidPasswordException("Password must contain at least one lowercase letter");
        }
        if (!password.matches(".*\\d.*")) {
            throw new InvalidPasswordException("Password must contain at least one number");
        }
        if (!password.matches(".*[!@#$%^&*()\\-+=<>?/\\[\\]{}|].*")) {
            throw new InvalidPasswordException("Password must contain at least one special character");
        }
    }

    @org.springframework.transaction.annotation.Transactional
    public AuthResponse signUpUser(SignUpRequest signUpRequest) {
        validateSignUpRequest(signUpRequest);

        if (userRepository.existsByEmail(signUpRequest.email())) {
            throw new DuplicateResourceException("Email is already in use: " + signUpRequest.email());
        }

        String username = signUpRequest.email().split("@")[0];

        // Create new user's account with encoded password
        User user = new User(
                username,
                signUpRequest.email(),
                passwordEncoder.encode(signUpRequest.password()));
        user = userRepository.save(user);

        // Create and save empty profile for the user
        UserProfile profile = new UserProfile();
        profile.setUsername(user.getUsername());
        profileRepository.save(profile);

        String jwt = jwtUtils.generateToken(user);
        return new AuthResponse(jwt, user.getEmail(), user.getUsername());
    }

    @org.springframework.transaction.annotation.Transactional
    public void deleteUser(String username) {
        // Eliminar primer el perfil si existeix
        if (profileRepository.existsById(username)) {
            profileRepository.deleteById(username);
        }

        // Eliminar l'usuari
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UserNotFoundException("User not found with username: " + username));
        userRepository.delete(user);
    }

    public void sendPasswordResetEmail(String email) {
        if (email == null || !email.endsWith("@edu.tecnocampus.cat")) {
            throw new ValidationException("Només es permeten emails @edu.tecnocampus.cat");
        }
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UserNotFoundException("No existeix cap usuari amb aquest email."));
        // Generar un token de reset (mock, UUID)
        String token = java.util.UUID.randomUUID().toString();
        String resetLink = "http://127.0.0.1:5500/new-password.html?token=" + token + "&email=" + email;
        try {
            emailService.sendResetPasswordEmail(email, resetLink);
        } catch (Exception e) {
            throw new RuntimeException("No s'ha pogut enviar el correu de recuperació: " + e.getMessage());
        }
    }
}
