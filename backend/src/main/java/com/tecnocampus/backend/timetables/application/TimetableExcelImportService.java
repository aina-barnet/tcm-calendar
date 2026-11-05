package com.tecnocampus.backend.timetables.application;

import com.tecnocampus.backend.timetables.domain.ScheduleEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class TimetableExcelImportService {

    private final com.tecnocampus.backend.shared.DegreeResourceRegistry degreeResourceRegistry;
    // Accept time separators ':' or '.' and hyphen or dash variants between ranges
    private static final Pattern TIME_RANGE_PATTERN = Pattern
            .compile("(\\d{1,2})[:.](\\d{2})\\s*[-–—]\\s*(\\d{1,2})[:.](\\d{2})");
    private static final Pattern TIME_RANGE_FALLBACK = Pattern
            .compile("(\\d{1,2})[:.](\\d{2})\\s*(\\d{1,2})[:.](\\d{2})");
    private static final Pattern FIRST_NUMBER_PATTERN = Pattern.compile("(\\d+)");

    private static final Logger logger = LoggerFactory.getLogger(TimetableExcelImportService.class);
    private static final String DEBUG_SUBJECT_CODE = "101331";

    private final Map<String, Map<String, List<ScheduleEntry>>> cachedEntriesByDegree = new LinkedHashMap<>();

    public TimetableExcelImportService() {
        this.degreeResourceRegistry = new com.tecnocampus.backend.shared.DegreeResourceRegistry();
    }

    // DI-friendly constructor - Spring will use this when available
    @org.springframework.beans.factory.annotation.Autowired
    public TimetableExcelImportService(com.tecnocampus.backend.shared.DegreeResourceRegistry degreeResourceRegistry) {
        this.degreeResourceRegistry = degreeResourceRegistry == null
                ? new com.tecnocampus.backend.shared.DegreeResourceRegistry()
                : degreeResourceRegistry;
    }

    public Map<String, List<ScheduleEntry>> loadEntries() {
        return loadEntriesForDegree(degreeResourceRegistry.getDefaultDegree());
    }

    public void invalidateCache() {
        synchronized (this) {
            cachedEntriesByDegree.clear();
        }
        logger.info("Timetable entries cache invalidated");
    }

    public Map<String, List<ScheduleEntry>> loadEntriesForDegree(String degreeKey) {
        if (degreeKey == null || degreeKey.isBlank()) {
            throw new IllegalArgumentException("Degree key is blank");
        }

        String normalizedDegreeKey = degreeKey.trim();

        synchronized (this) {
            Map<String, List<ScheduleEntry>> cachedEntries = cachedEntriesByDegree.get(normalizedDegreeKey);
            if (cachedEntries != null) {
                logger.debug("Returning timetable entries from cache for degree {} ({} subjects)",
                        normalizedDegreeKey, cachedEntries.size());
                return cachedEntries;
            }
        }

        if (degreeResourceRegistry.isComposite(normalizedDegreeKey)) {
            // For composite (simultaneous) degrees prefer to use the timetable
            // entries from a single base degree to avoid duplicated/ambiguous
            // optional subjects across degrees. Use the first base degree as
            // the source for timetable entries (this matches the UX expectation
            // that optatives are resolved within a single degree).
            List<String> baseDegrees = degreeResourceRegistry.getBaseDegrees(normalizedDegreeKey);
            if (baseDegrees == null || baseDegrees.isEmpty()) {
                return Map.of();
            }

            String primaryBase = baseDegrees.get(0);
            Map<String, List<ScheduleEntry>> primaryEntries = loadEntriesForDegree(primaryBase);
            synchronized (this) {
                cachedEntriesByDegree.put(normalizedDegreeKey, primaryEntries);
            }
            logger.debug("Composite degree {} uses primary base degree {} for timetable entries ({} subjects)",
                    normalizedDegreeKey, primaryBase, primaryEntries.size());
            return primaryEntries;
        }

        com.tecnocampus.backend.shared.DegreeResourceRegistry.DegreeResources res = degreeResourceRegistry
                .getResourcesFor(normalizedDegreeKey);
        String resource = res.getTimetableResource();
        if (!degreeResourceRegistry.resourceExists(resource)) {
            throw new IllegalStateException(
                    "Timetable resource for degree " + normalizedDegreeKey + " not found: " + resource);
        }
        Map<String, List<ScheduleEntry>> loadedEntries = loadEntriesFromResource(resource);
        synchronized (this) {
            cachedEntriesByDegree.put(normalizedDegreeKey, loadedEntries);
        }
        return loadedEntries;
    }

    private void mergeEntriesBySubject(Map<String, List<ScheduleEntry>> target,
            Map<String, List<ScheduleEntry>> source) {
        source.forEach((subjectCode, entries) -> target
                .computeIfAbsent(subjectCode, key -> new ArrayList<>())
                .addAll(entries));
    }

    public Map<String, List<ScheduleEntry>> loadEntriesFromResource(String excelResourcePath) {
        Map<String, List<ScheduleEntry>> entriesBySubject = new LinkedHashMap<>();

        try {
            ClassPathResource resource = new ClassPathResource(excelResourcePath);
            if (!resource.exists()) {
                return entriesBySubject;
            }

            try (InputStream inputStream = resource.getInputStream();
                    Workbook workbook = new XSSFWorkbook(inputStream)) {

                DataFormatter formatter = new DataFormatter();
                int totalSheets = workbook.getNumberOfSheets();

                for (int sheetIndex = 0; sheetIndex < totalSheets; sheetIndex++) {
                    Sheet sheet = workbook.getSheetAt(sheetIndex);
                    String term = sheet.getSheetName();

                    for (int rowIndex = 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                        Row row = sheet.getRow(rowIndex);
                        if (row == null) {
                            continue;
                        }

                        try {
                            Integer dayOfWeek = parsePositiveInteger(cleanCellAsString(row.getCell(0), formatter));
                            String timeRangeRaw = cleanCellAsString(row.getCell(1), formatter);
                            String subjectCodeRaw = cleanCellAsString(row.getCell(2), formatter);
                            String groupCodeRaw = cleanCellAsString(row.getCell(3), formatter);
                            String sessionTypeRaw = cleanCellAsString(row.getCell(4), formatter);
                            Integer weekType = parseWeekType(cleanCellAsString(row.getCell(5), formatter));

                            String subjectCode = normalizeSubjectCode(subjectCodeRaw);
                            if (groupCodeRaw == null || "nan".equalsIgnoreCase(groupCodeRaw.trim())) {
                                groupCodeRaw = "-";
                            }
                            String groupCode = groupCodeRaw;

                            if (dayOfWeek == null) {
                                logger.debug("Skipping row {} on sheet {}: invalid or missing dayOfWeek", rowIndex,
                                        term);
                                continue;
                            }

                            TimeRange parsedRange = parseTimeRangeFlexible(timeRangeRaw);
                            if (parsedRange == null) {
                                logger.debug("Skipping row {} on sheet {}: invalid or missing timeRange='{}'", rowIndex,
                                        term, timeRangeRaw);
                                continue;
                            }

                            if (subjectCode == null) {
                                logger.debug("Skipping row {} on sheet {}: missing subjectCode", rowIndex, term);
                                continue;
                            }

                            String sessionType = normalizeSessionType(sessionTypeRaw);

                            ScheduleEntry entry = new ScheduleEntry(
                                    term,
                                    dayOfWeek,
                                    timeRangeRaw == null ? String.format("%02d:%02d-%02d:%02d",
                                            parsedRange.startMinute(), parsedRange.endMinute()) : timeRangeRaw,
                                    parsedRange.startMinute(),
                                    parsedRange.endMinute(),
                                    weekType,
                                    subjectCode,
                                    groupCode,
                                    sessionType);

                            logger.debug(
                                    "Parsed timetable row sheet={} row={} subject={} group={} type={} weekType={} day={} timeRange='{}'",
                                    term,
                                    rowIndex,
                                    subjectCode,
                                    groupCode,
                                    sessionType,
                                    weekType,
                                    dayOfWeek,
                                    timeRangeRaw);

                            if (DEBUG_SUBJECT_CODE.equals(subjectCode)) {
                                logger.debug(
                                        "Debug subject {} parsed from raw values: subjectRaw='{}' groupRaw='{}' sessionRaw='{}'",
                                        DEBUG_SUBJECT_CODE,
                                        subjectCodeRaw,
                                        groupCodeRaw,
                                        sessionTypeRaw);
                            }

                            entriesBySubject.computeIfAbsent(subjectCode, key -> new ArrayList<>()).add(entry);
                        } catch (Exception rowEx) {
                            logger.warn("Failed to parse row {} in sheet {}: {}", rowIndex, term, rowEx.getMessage());
                            // continue to next row
                        }
                    }
                }
            }
        } catch (Exception ex) {
            logger.error("Error reading Excel resource {}: {}", excelResourcePath, ex.getMessage(), ex);
            // return whatever has been parsed so far instead of throwing
        }

        return entriesBySubject;
    }

    String normalizeSessionType(String raw) {
        if (raw == null) {
            return "General";
        }

        String cleaned = raw.trim();
        if (cleaned.isEmpty() || "nan".equalsIgnoreCase(cleaned)) {
            return "General";
        }

        String normalized = Normalizer.normalize(cleaned, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");

        if (normalized.isBlank()) {
            return "General";
        }

        if (normalized.contains("teor")
                || normalized.equals("teo")
                || normalized.equals("t")
                || normalized.equals("theory")) {
            return "Teoria";
        }

        if (normalized.contains("practic")
                || normalized.contains("labor")
                || normalized.equals("lab")
                || normalized.equals("p")) {
            return "Pràctiques";
        }

        return "General";
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

    private String normalizeSubjectCode(String raw) {
        if (raw == null)
            return null;
        String code = raw.trim();
        // strip quotes and surrounding non-alphanumerics
        code = code.replaceAll("^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "");
        return code.isEmpty() ? null : code;
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

    private Integer parseWeekType(String value) {
        Integer parsed = parsePositiveInteger(value);
        if (parsed == null || parsed == 1 || parsed == 2) {
            return parsed;
        }
        return null;
    }

    /**
     * Flexible time range parser: tries strict pattern first, then fallback
     * variants.
     */
    private TimeRange parseTimeRangeFlexible(String value) {
        if (value == null)
            return null;

        Matcher matcher = TIME_RANGE_PATTERN.matcher(value);
        if (matcher.find()) {
            int startMinute = parseToMinutes(matcher.group(1), matcher.group(2));
            int endMinute = parseToMinutes(matcher.group(3), matcher.group(4));
            if (startMinute >= 0 && endMinute > startMinute) {
                return new TimeRange(startMinute, endMinute);
            }
        }

        // Fallback: maybe the separator is missing or different
        Matcher fallback = TIME_RANGE_FALLBACK.matcher(value.replaceAll("\\s+", ""));
        if (fallback.find()) {
            int startMinute = parseToMinutes(fallback.group(1), fallback.group(2));
            int endMinute = parseToMinutes(fallback.group(3), fallback.group(4));
            if (startMinute >= 0 && endMinute > startMinute) {
                return new TimeRange(startMinute, endMinute);
            }
        }

        // Try to extract any two time-like groups
        Matcher anyMatcher = Pattern.compile("(\\d{1,2})[:.](\\d{2}).*?(\\d{1,2})[:.](\\d{2})").matcher(value);
        if (anyMatcher.find()) {
            int startMinute = parseToMinutes(anyMatcher.group(1), anyMatcher.group(2));
            int endMinute = parseToMinutes(anyMatcher.group(3), anyMatcher.group(4));
            if (startMinute >= 0 && endMinute > startMinute) {
                return new TimeRange(startMinute, endMinute);
            }
        }

        return null;
    }

    private int parseToMinutes(String hour, String minute) {
        try {
            int h = Integer.parseInt(hour);
            int m = Integer.parseInt(minute);
            if (h < 0 || h > 23 || m < 0 || m > 59) {
                return -1;
            }
            return h * 60 + m;
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    private record TimeRange(int startMinute, int endMinute) {
    }
}
