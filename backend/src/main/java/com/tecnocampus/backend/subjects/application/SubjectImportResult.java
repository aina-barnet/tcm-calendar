package com.tecnocampus.backend.subjects.application;

import com.tecnocampus.backend.subjects.domain.Subject;

import java.util.List;

public record SubjectImportResult(
        List<Subject> subjects,
        int totalSheets,
        int totalRowsRead,
        int rowsWithoutCodeOrName,
        int rowsWithoutCourse,
        int duplicatesByCode
) {
}

