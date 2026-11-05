package com.tecnocampus.backend.registration.application.DTOs;

public record LogInRequest(String email,
                           String password) {
}