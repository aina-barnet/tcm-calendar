package com.tecnocampus.backend.timetables.api.dto;

import com.tecnocampus.backend.timetables.application.dto.TimetableGenerationPreferences;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record TimetableGenerationRequest(
        @NotBlank(message = "Has d'indicar el grau seleccionat") String degreeKey,
        @NotEmpty(message = "Has d'enviar almenys una assignatura") List<@NotBlank(message = "Els codis d'assignatura no poden ser buits") String> subjectCodes,
        @Min(value = 1, message = "trimester ha de ser com a minim 1") @Max(value = 3, message = "trimester no pot superar 3") Integer trimester,
        @Min(value = 1, message = "maxResults ha de ser com a minim 1") @Max(value = 100, message = "maxResults no pot superar 100") Integer maxResults,
        @Valid PreferencesDTO preferences,
        String optimization,
        Boolean noMornings,
        Boolean noEvenings,
        Boolean noNoon) {
    public int resolvedMaxResults() {
        return maxResults == null ? 5 : maxResults;
    }

    public TimetableGenerationPreferences toPreferences() {
        PreferencesDTO nested = preferences == null ? new PreferencesDTO(null, null, null, null, null, null, null)
                : preferences;

        return new TimetableGenerationPreferences(
                firstNonBlank(nested.optimization(), optimization),
                firstNonNull(nested.noMornings(), noMornings),
                firstNonNull(nested.noEvenings(), noEvenings),
                firstNonNull(nested.noNoon(), noNoon),
                nested.freeDayPreference(),
                nested.preferredTime(),
                nested.isEmployed());
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }

        return (fallback == null || fallback.isBlank()) ? null : fallback;
    }

    private static Boolean firstNonNull(Boolean primary, Boolean fallback) {
        return primary != null ? primary : fallback;
    }

    public record PreferencesDTO(
            String optimization,
            Boolean noMornings,
            Boolean noEvenings,
            Boolean noNoon,
            String freeDayPreference,
            String preferredTime,
            Boolean isEmployed) {
    }
}