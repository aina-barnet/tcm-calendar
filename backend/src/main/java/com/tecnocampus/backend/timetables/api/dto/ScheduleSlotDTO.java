package com.tecnocampus.backend.timetables.api.dto;

public record ScheduleSlotDTO(
        String term,
        int dayOfWeek,
        String timeRange,
        Integer weekType,
        String subjectCode,
        String groupCode,
        String type
) {
}

