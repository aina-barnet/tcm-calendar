package com.tecnocampus.backend.timetables.api.dto;

import java.util.List;

public record TimetableOptionDTO(
        List<SubjectSelectionDTO> selections,
        List<ScheduleSlotDTO> firstWeekSlots,
        List<ScheduleSlotDTO> secondWeekSlots,
        List<ScheduleOverlapDTO> overlaps,
        List<SubjectGroupingDTO> subjects,
        String explanation) {
    public TimetableOptionDTO(
            List<SubjectSelectionDTO> selections,
            List<ScheduleSlotDTO> firstWeekSlots,
            List<ScheduleSlotDTO> secondWeekSlots) {
        this(selections, firstWeekSlots, secondWeekSlots, List.of(), List.of(), null);
    }

    public TimetableOptionDTO(
            List<SubjectSelectionDTO> selections,
            List<ScheduleSlotDTO> firstWeekSlots,
            List<ScheduleSlotDTO> secondWeekSlots,
            List<ScheduleOverlapDTO> overlaps) {
        this(selections, firstWeekSlots, secondWeekSlots, overlaps, List.of(), null);
    }
}
