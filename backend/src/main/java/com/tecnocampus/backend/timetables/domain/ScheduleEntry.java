package com.tecnocampus.backend.timetables.domain;

public record ScheduleEntry(
        String term,
        int dayOfWeek,
        String timeRange,
        int startMinute,
        int endMinute,
        Integer weekType,
        String subjectCode,
        String groupCode,
        String sessionType
) {
}

