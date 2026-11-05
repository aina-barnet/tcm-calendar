package com.tecnocampus.backend.registration.application.DTOs;

import java.time.LocalDate;
import java.util.List;

public record ProfileDTO(
                String username,
                String firstName,
                String lastNames,
                String degree,
                Integer academicYear,
                String avatar,
                String optimization,
                List<String> selectedSubjects) {
}