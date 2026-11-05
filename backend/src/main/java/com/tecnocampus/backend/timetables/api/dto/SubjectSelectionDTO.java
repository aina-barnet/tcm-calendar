package com.tecnocampus.backend.timetables.api.dto;

import java.util.List;

public record SubjectSelectionDTO(String subjectCode, List<GroupChoiceDTO> groups) {
}

