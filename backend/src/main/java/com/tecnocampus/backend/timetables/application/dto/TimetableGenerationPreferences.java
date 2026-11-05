package com.tecnocampus.backend.timetables.application.dto;

public record TimetableGenerationPreferences(
                String optimization,
                Boolean noMornings,
                Boolean noEvenings,
                Boolean noNoon,
                String freeDayPreference,
                String preferredTime,
                Boolean isEmployed) {
}