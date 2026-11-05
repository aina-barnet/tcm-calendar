package com.tecnocampus.backend.registration.api;

import java.util.Map;

import com.tecnocampus.backend.registration.application.DTOs.AuthResponse;
import com.tecnocampus.backend.registration.application.DTOs.LogInRequest;
import com.tecnocampus.backend.registration.application.DTOs.SignUpRequest;
import com.tecnocampus.backend.registration.application.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/authenticate")
public class AuthController {
    @PostMapping("/new-password")
    public Map<String, String> setNewPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String token = body.get("token");
        String password = body.get("password");
        userService.setNewPassword(email, token, password);
        return Map.of("message", "Contrasenya canviada correctament");
    }

    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        userService.sendPasswordResetEmail(email);
        return Map.of("message", "Email de recuperació enviat si l'usuari existeix.");
    }

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    // El registre manual està desactivat. Només Google OAuth2.

    @PostMapping("/signin")
    @ResponseStatus(HttpStatus.OK)
    public AuthResponse signInUser(@RequestBody LogInRequest loginRequest) {
        return userService.signInUser(loginRequest);
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse signUpUser(@RequestBody SignUpRequest signUpRequest) {
        return userService.signUpUser(signUpRequest);
    }

    @DeleteMapping("/delete/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable String username) {
        userService.deleteUser(username);
    }
}
