package com.tecnocampus.backend.timetables.api.dto;

import java.util.List;

public record SubjectGroupingDTO(
        String subjectCode,
        List<GroupInfoDTO> groups) {
}
