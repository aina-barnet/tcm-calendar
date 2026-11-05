package com.tecnocampus.backend.timetables.api.dto;

public record ScheduleOverlapDTO(
        String term,
        int dayOfWeek,
        String overlapTimeRange,
        int overlapMinutes,
        Integer weekType,
        ScheduleSlotDTO firstSlot,
        ScheduleSlotDTO secondSlot
) {
}

