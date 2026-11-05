package com.tecnocampus.backend.timetables.application.dto;

import com.tecnocampus.backend.timetables.api.dto.TimetableOptionDTO;

import java.util.List;

public record TimetableGenerationResult(List<TimetableOptionDTO> options, String error) {

    public TimetableGenerationResult {
        options = options == null ? List.of() : List.copyOf(options);
    }

    public static TimetableGenerationResult success(List<TimetableOptionDTO> options) {
        return new TimetableGenerationResult(options, null);
    }

    public static TimetableGenerationResult withError(List<TimetableOptionDTO> options, String error) {
        return new TimetableGenerationResult(options, error);
    }
}

