package com.tecnocampus.backend.registration.application.DTOs;

public record AuthResponse(
        String token,
        String email,
        String username) {
}