package com.tecnocampus.backend.subjects.application;

import com.tecnocampus.backend.subjects.domain.Subject;
import com.tecnocampus.backend.shared.DegreeResourceRegistry;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SubjectExcelImportService {

    private static final String DEFAULT_TYPE = "OB";
    private static final int DEFAULT_SEMESTER = 1;
    private static final int DEFAULT_ECTS = 6;
    private static final Pattern FIRST_NUMBER_PATTERN = Pattern.compile("(\\d+)");
    private static final Pattern RANGE_PATTERN = Pattern.compile("(\\d+)\\s*-\\s*(\\d+)");

    private final DegreeResourceRegistry degreeResourceRegistry;

    public SubjectExcelImportService() {
        this.degreeResourceRegistry = new DegreeResourceRegistry();
    }

    // DI-friendly constructor - Spring will use this when available
    @org.springframework.beans.factory.annotation.Autowired
    public SubjectExcelImportService(DegreeResourceRegistry degreeResourceRegistry) {
        this.degreeResourceRegistry = degreeResourceRegistry == null ? new DegreeResourceRegistry()
                : degreeResourceRegistry;
    }

    public SubjectImportResult loadFromResource(String excelResourcePath) {
        // preserve existing behavior but associate subjects to the default degree
        return loadFromResource(excelResourcePath, degreeResourceRegistry.getDefaultDegree());
    }

    public SubjectImportResult loadFromResource(String excelResourcePath, String degreeKey) {
        Map<String, Subject> subjectsByKey = new LinkedHashMap<>();
        int totalRowsRead = 0;
        int rowsWithoutCodeOrName = 0;
        int rowsWithoutCourse = 0;
        int duplicatesByCode = 0;

        try {
            ClassPathResource resource = new ClassPathResource(excelResourcePath);
            if (!resource.exists()) {
                return new SubjectImportResult(List.of(), 0, 0, 0, 0, 0);
            }

            try (InputStream inputStream = resource.getInputStream();
                    Workbook workbook = new XSSFWorkbook(inputStream)) {

                DataFormatter formatter = new DataFormatter();
                int totalSheets = workbook.getNumberOfSheets();

                for (int sheetIndex = 0; sheetIndex < totalSheets; sheetIndex++) {
                    Sheet sheet = workbook.getSheetAt(sheetIndex);
                    Integer currentCourse = null;
                    Integer currentSemester = DEFAULT_SEMESTER;
                    String currentType = DEFAULT_TYPE;

                    for (int rowIndex = 0; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                        Row row = sheet.getRow(rowIndex);
                        if (row == null) {
                            continue;
                        }
                        totalRowsRead++;

                        Integer parsedCourse = parsePositiveInteger(cleanCellAsString(row.getCell(0), formatter));
                        if (parsedCourse != null) {
                            currentCourse = parsedCourse;
                        }

                        List<Integer> parsedSemesters = parseSemesters(cleanCellAsString(row.getCell(3), formatter));
                        if (!parsedSemesters.isEmpty()) {
                            currentSemester = parsedSemesters.get(0);
                        }

                        String parsedType = cleanCellAsString(row.getCell(4), formatter);
                        if (parsedType != null) {
                            currentType = parsedType;
                        }

                        String code = cleanCellAsString(row.getCell(1), formatter);
                        String name = cleanCellAsString(row.getCell(2), formatter);

                        if (code == null || name == null) {
                            rowsWithoutCodeOrName++;
                            continue;
                        }
                        if (currentCourse == null) {
                            rowsWithoutCourse++;
                            continue;
                        }

                        Integer ects = parsePositiveInteger(cleanCellAsString(row.getCell(5), formatter));
                        if (ects == null) {
                            ects = DEFAULT_ECTS;
                        }

                        boolean thesisSubject = isThesisSubject(currentType, code, name);
                        List<Integer> semestersToImport = thesisSubject
                                ? List.of(0)
                                : (parsedSemesters.isEmpty()
                                        ? List.of(currentSemester != null ? currentSemester : DEFAULT_SEMESTER)
                                        : parsedSemesters);

                        for (Integer semester : semestersToImport) {
                            if (semester == null) {
                                continue;
                            }

                            Subject subject = new Subject(code, name, ects, currentCourse, semester, currentType,
                                    degreeKey);
                            String subjectKey = buildSubjectKey(degreeKey, code, semester);
                            Subject previous = subjectsByKey.putIfAbsent(subjectKey, subject);
                            if (previous != null) {
                                duplicatesByCode++;
                            }
                        }
                    }
                }

                return new SubjectImportResult(
                        new ArrayList<>(subjectsByKey.values()),
                        totalSheets,
                        totalRowsRead,
                        rowsWithoutCodeOrName,
                        rowsWithoutCourse,
                        duplicatesByCode);
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(SubjectExcelImportService.class)
                    .error("Failed to import subjects from resource {}: {}", excelResourcePath, e.getMessage(), e);
            return new SubjectImportResult(List.of(), 0, totalRowsRead, rowsWithoutCodeOrName, rowsWithoutCourse,
                    duplicatesByCode);
        }
    }

    private String cleanCellAsString(Cell cell, DataFormatter formatter) {
        if (cell == null) {
            return null;
        }

        String value = formatter.formatCellValue(cell);
        if (value == null) {
            return null;
        }

        value = value.trim().replace('\u00A0', ' ');
        return value.isBlank() ? null : value;
    }

    private Integer parsePositiveInteger(String value) {
        if (value == null) {
            return null;
        }

        Matcher matcher = FIRST_NUMBER_PATTERN.matcher(value);
        if (!matcher.find()) {
            return null;
        }

        try {
            int parsed = Integer.parseInt(matcher.group(1));
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private List<Integer> parseSemesters(String value) {
        if (value == null) {
            return List.of();
        }

        String lower = value.toLowerCase();
        LinkedHashSet<Integer> semesters = new LinkedHashSet<>();

        // Treat common words meaning "annual" as all three trimesters
        if (lower.contains("anual") || lower.contains("annual") || lower.contains("any")) {
            semesters.add(1);
            semesters.add(2);
            semesters.add(3);
            return new ArrayList<>(semesters);
        }

        // Expand explicit ranges like "1-3" into 1,2,3
        Matcher rangeMatcher = RANGE_PATTERN.matcher(value);
        while (rangeMatcher.find()) {
            try {
                int start = Integer.parseInt(rangeMatcher.group(1));
                int end = Integer.parseInt(rangeMatcher.group(2));
                if (start > 0 && end >= start) {
                    for (int i = start; i <= end; i++) {
                        semesters.add(i);
                    }
                }
            } catch (NumberFormatException ignored) {
                // ignore malformed ranges
            }
        }

        // Also collect standalone numbers (e.g., "2", "1,3")
        Matcher matcher = FIRST_NUMBER_PATTERN.matcher(value);
        while (matcher.find()) {
            try {
                int parsed = Integer.parseInt(matcher.group(1));
                if (parsed > 0) {
                    semesters.add(parsed);
                }
            } catch (NumberFormatException ignored) {
                // Ignore malformed trimester tokens and continue parsing the rest.
            }
        }

        return new ArrayList<>(semesters);
    }

    private boolean isThesisSubject(String type, String code, String name) {
        String normalizedType = normalizeSubjectText(type);
        if (normalizedType != null && (normalizedType.equals("tfg") || normalizedType.contains("treballfi"))) {
            return true;
        }

        String normalizedCode = normalizeSubjectText(code);
        if (normalizedCode != null && normalizedCode.contains("tfg")) {
            return true;
        }

        String normalizedName = normalizeSubjectText(name);
        return normalizedName != null
                && (normalizedName.contains("treballfidagrau") || normalizedName.contains("treballfinaldegrau"));
    }

    private String normalizeSubjectText(String value) {
        if (value == null) {
            return null;
        }

        String normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "");

        return normalized.isBlank() ? null : normalized;
    }

    private String buildSubjectKey(String degreeKey, String code, Integer semester) {
        return String.join("::",
                degreeKey == null ? "" : degreeKey,
                code == null ? "" : code.trim(),
                semester == null ? "" : semester.toString());
    }
}
