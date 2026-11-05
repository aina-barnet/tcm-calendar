package com.tecnocampus.backend.registration.application.DTOs;

public record SignUpRequest(String email,
                            String password) {
}