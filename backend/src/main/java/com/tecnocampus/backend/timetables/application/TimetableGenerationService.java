package com.tecnocampus.backend.timetables.application;

import com.tecnocampus.backend.exceptions.ResourceNotFoundException;
import com.tecnocampus.backend.timetables.api.dto.GroupChoiceDTO;
import com.tecnocampus.backend.timetables.api.dto.GroupInfoDTO;
import com.tecnocampus.backend.timetables.api.dto.ScheduleOverlapDTO;
import com.tecnocampus.backend.timetables.api.dto.ScheduleSlotDTO;
import com.tecnocampus.backend.timetables.api.dto.SubjectGroupingDTO;
import com.tecnocampus.backend.timetables.api.dto.SubjectSelectionDTO;
import com.tecnocampus.backend.timetables.api.dto.TimetableOptionDTO;
import com.tecnocampus.backend.timetables.application.dto.TimetableGenerationResult;
import com.tecnocampus.backend.timetables.application.dto.TimetableGenerationPreferences;
import com.tecnocampus.backend.timetables.domain.ScheduleEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

@Service
public class TimetableGenerationService {

    private static final Logger logger = LoggerFactory.getLogger(TimetableGenerationService.class);
    private static final String DEBUG_SUBJECT_CODE = "101331";
    private static final String NO_CONFLICT_FREE_COMBINATIONS_ERROR = "No s'han trobat combinacions d'horari sense conflictes";
    private static final int MIN_EXHAUSTIVE_LEAF_LIMIT = 1200;
    private static final int MAX_EXHAUSTIVE_LEAF_LIMIT = 30000;

    private final TimetableExcelImportService timetableExcelImportService;

    public TimetableGenerationService(TimetableExcelImportService timetableExcelImportService) {
        this.timetableExcelImportService = timetableExcelImportService;
    }

    public List<TimetableOptionDTO> generate(List<String> subjectCodes, int maxResults) {
        return generateDetailed(subjectCodes, maxResults, null).options();
    }

    public List<TimetableOptionDTO> generate(List<String> subjectCodes, int maxResults, Integer trimester) {
        return generateDetailed(subjectCodes, maxResults, trimester).options();
    }

    public List<TimetableOptionDTO> generate(List<String> subjectCodes, int maxResults, Integer trimester,
            TimetableGenerationPreferences preferences) {
        return generateDetailed(subjectCodes, maxResults, trimester, preferences).options();
    }

    public TimetableGenerationResult generateDetailed(List<String> subjectCodes, int maxResults) {
        return generateDetailed(subjectCodes, maxResults, null);
    }

    public TimetableGenerationResult generateDetailed(List<String> subjectCodes, int maxResults, Integer trimester) {
        return generateDetailed(subjectCodes, maxResults, trimester, null);
    }

    public TimetableGenerationResult generateDetailed(List<String> subjectCodes, int maxResults, Integer trimester,
            TimetableGenerationPreferences preferences) {
        return generateDetailed(subjectCodes, maxResults, trimester, preferences, null);
    }

    public TimetableGenerationResult generateDetailed(List<String> subjectCodes, int maxResults, Integer trimester,
            TimetableGenerationPreferences preferences, String degreeKey) {
        Integer requestedTrimester = resolveRequestedTrimester(trimester, subjectCodes);
        List<String> normalizedCodes = normalizeSubjectCodes(subjectCodes);
        if (normalizedCodes.isEmpty()) {
            return TimetableGenerationResult.success(List.of());
        }

        int safeMaxResults = Math.max(1, maxResults);
        String normalizedDegreeKey = degreeKey == null ? null : degreeKey.trim();

        Map<String, List<ScheduleEntry>> loadedEntriesBySubject = normalizedDegreeKey == null
                || normalizedDegreeKey.isBlank()
                        ? timetableExcelImportService.loadEntries()
                        : timetableExcelImportService.loadEntriesForDegree(normalizedDegreeKey);
        logger.debug("Loaded {} subjects from import for degree={}", loadedEntriesBySubject.size(),
                normalizedDegreeKey);

        List<String> missingAfterLoad = new ArrayList<>();
        for (String code : normalizedCodes) {
            List<ScheduleEntry> subjectEntries = loadedEntriesBySubject.get(code);
            if (subjectEntries == null || subjectEntries.isEmpty()) {
                for (Map.Entry<String, List<ScheduleEntry>> entry : loadedEntriesBySubject.entrySet()) {
                    if (normalizeSubjectCode(entry.getKey()) != null
                            && normalizeSubjectCode(entry.getKey()).equals(code)) {
                        subjectEntries = entry.getValue();
                        break;
                    }
                }
                if (subjectEntries == null || subjectEntries.isEmpty()) {
                    missingAfterLoad.add(code);
                }
            }
        }

        if (!missingAfterLoad.isEmpty()) {
            logger.warn("Missing timetable entries for subjects {} - invalidating import cache and reloading",
                    missingAfterLoad);
            this.invalidateImportedEntriesCache();

            loadedEntriesBySubject = normalizedDegreeKey == null || normalizedDegreeKey.isBlank()
                    ? timetableExcelImportService.loadEntries()
                    : timetableExcelImportService.loadEntriesForDegree(normalizedDegreeKey);

            List<String> stillMissing = new ArrayList<>();
            for (String code : normalizedCodes) {
                List<ScheduleEntry> subjectEntries = loadedEntriesBySubject.get(code);
                if (subjectEntries == null || subjectEntries.isEmpty()) {
                    stillMissing.add(code);
                }
            }

            if (!stillMissing.isEmpty()) {
                // Add diagnostic information: list available raw keys and their normalized
                // forms
                String availableKeys = String.join(", ", loadedEntriesBySubject.keySet());
                String normalizedMap = loadedEntriesBySubject.keySet().stream()
                        .map(k -> {
                            String nk = normalizeSubjectCode(k);
                            return k + "=>" + (nk == null ? "<null>" : nk);
                        })
                        .sorted()
                        .collect(java.util.stream.Collectors.joining(", "));

                logger.error("Still missing entries after cache invalidation for subjects {}", stillMissing);
                logger.error("Available timetable keys: {}", availableKeys);
                logger.error("Available normalized keys map: {}", normalizedMap);

                throw new ResourceNotFoundException(
                        "No hi ha horari disponible per a l'assignatura(s): " + String.join(", ", stillMissing)
                                + ". Clau disponibles: " + availableKeys);
            }
        }

        final Map<String, List<ScheduleEntry>> entriesBySubject = loadedEntriesBySubject;

        logger.debug("Generating timetables for degree={} subjects={} (available subjects={})",
                normalizedDegreeKey, normalizedCodes, entriesBySubject.size());
        List<Integer> trimesterCandidates = resolveEffectiveTrimesterCandidates(normalizedCodes, entriesBySubject,
                requestedTrimester);

        TimetableGenerationResult bestResult = null;
        RuntimeException lastFailure = null;

        for (Integer effectiveTrimester : trimesterCandidates) {
            try {
                TimetableGenerationResult candidateResult = generateDetailedForTrimester(
                        normalizedCodes,
                        entriesBySubject,
                        safeMaxResults,
                        preferences,
                        effectiveTrimester);

                if (candidateResult.options().isEmpty()) {
                    if (bestResult == null) {
                        bestResult = candidateResult;
                    }
                    continue;
                }

                if (bestResult == null || candidateResult.options().size() > bestResult.options().size()
                        || (bestResult.error() != null && candidateResult.error() == null)) {
                    bestResult = candidateResult;
                }

                if (candidateResult.error() == null) {
                    return candidateResult;
                }
            } catch (ResourceNotFoundException ex) {
                lastFailure = ex;
                logger.debug("Trimester {} produced no timetable options for degree={} subjects={}: {}",
                        effectiveTrimester,
                        normalizedDegreeKey,
                        normalizedCodes,
                        ex.getMessage());
            }
        }

        if (bestResult != null) {
            return bestResult;
        }

        if (lastFailure != null) {
            throw lastFailure;
        }

        return TimetableGenerationResult.success(List.of());
    }

    private TimetableGenerationResult generateDetailedForTrimester(List<String> normalizedCodes,
            Map<String, List<ScheduleEntry>> entriesBySubject, int safeMaxResults,
            TimetableGenerationPreferences preferences, Integer effectiveTrimester) {
        List<SubjectAlternatives> alternativesBySubject = normalizedCodes.stream()
                .map(subjectCode -> buildAlternatives(subjectCode, entriesBySubject, effectiveTrimester, preferences))
                .toList();

        List<ScoredTimetableOption> scoredResults = new ArrayList<>();
        int explorationLimit = calculateExhaustiveLeafLimit(alternativesBySubject.size(), safeMaxResults);
        int[] exploredLeaves = new int[] { 0 };
        boolean limitReached = backtrack(
                0,
                alternativesBySubject,
                new ArrayList<>(),
                new ArrayList<>(),
                scoredResults,
                preferences,
                0,
                0,
                explorationLimit,
                exploredLeaves);

        if (limitReached) {
            logger.info(
                    "Timetable exhaustive search reached exploration limit ({} leaves) for {} subjects in trimester {}",
                    explorationLimit,
                    alternativesBySubject.size(),
                    effectiveTrimester);
        }

        if (!scoredResults.isEmpty()) {
            List<ScoredTimetableOption> orderedResults = scoredResults.stream()
                    .sorted(Comparator
                            .comparingInt(ScoredTimetableOption::conflictCount)
                            .thenComparingInt(ScoredTimetableOption::overlapMinutes)
                            .thenComparing(Comparator.comparingDouble(ScoredTimetableOption::preferenceScore)
                                    .reversed())
                            .thenComparing(candidate -> candidate.option().selections().stream()
                                    .map(selection -> selection.subjectCode() + ":" + selection.groups().stream()
                                            .map(GroupChoiceDTO::groupCode)
                                            .collect(java.util.stream.Collectors.joining("|")))
                                    .collect(java.util.stream.Collectors.joining("||"))))
                    .limit(safeMaxResults)
                    .toList();

            List<TimetableOptionDTO> result = orderedResults.stream()
                    .map(ScoredTimetableOption::option)
                    .toList();

            boolean hasConflictFreeOption = orderedResults.stream()
                    .anyMatch(candidate -> candidate.conflictCount() == 0 && candidate.overlapMinutes() == 0);

            if (hasConflictFreeOption) {
                return TimetableGenerationResult.success(result);
            }

            String collisionMessage = buildCollisionMessage(result.get(0).overlaps());
            return TimetableGenerationResult.withError(result, collisionMessage);
        }

        TimetableOptionDTO fallbackOption = buildBestEffortOption(alternativesBySubject, preferences);
        String collisionMessage = buildCollisionMessage(fallbackOption.overlaps());
        return TimetableGenerationResult.withError(List.of(fallbackOption), collisionMessage);
    }

    private int calculateExhaustiveLeafLimit(int subjectCount, int safeMaxResults) {
        int multiplier = subjectCount >= 8 ? 40 : subjectCount >= 6 ? 90 : 180;
        int requested = Math.max(1, safeMaxResults) * multiplier;
        return Math.max(MIN_EXHAUSTIVE_LEAF_LIMIT, Math.min(MAX_EXHAUSTIVE_LEAF_LIMIT, requested));
    }

    private List<Integer> resolveEffectiveTrimesterCandidates(List<String> subjectCodes,
            Map<String, List<ScheduleEntry>> entriesBySubject, Integer requestedTrimester) {
        if (requestedTrimester != null) {
            return List.of(requestedTrimester);
        }

        LinkedHashSet<Integer> commonTrimesterCandidates = null;
        LinkedHashSet<Integer> allTrimesterCandidates = new LinkedHashSet<>();
        Map<Integer, Integer> trimesterSupport = new LinkedHashMap<>();

        for (String subjectCode : subjectCodes) {
            List<ScheduleEntry> entries = entriesBySubject.get(subjectCode);
            if (entries == null || entries.isEmpty()) {
                continue;
            }

            LinkedHashSet<Integer> subjectTrimesters = new LinkedHashSet<>();
            for (ScheduleEntry entry : entries) {
                subjectTrimesters.addAll(extractTrimesterCandidates(entry.term()));
            }

            if (subjectTrimesters.isEmpty()) {
                continue;
            }

            allTrimesterCandidates.addAll(subjectTrimesters);
            for (Integer candidate : subjectTrimesters) {
                trimesterSupport.merge(candidate, 1, Integer::sum);
            }

            if (commonTrimesterCandidates == null) {
                commonTrimesterCandidates = new LinkedHashSet<>(subjectTrimesters);
            } else {
                commonTrimesterCandidates.retainAll(subjectTrimesters);
            }
        }

        if (commonTrimesterCandidates != null && !commonTrimesterCandidates.isEmpty()) {
            return commonTrimesterCandidates.stream()
                    .sorted(Comparator.<Integer>comparingInt(candidate -> trimesterSupport.getOrDefault(candidate, 0))
                            .reversed()
                            .thenComparingInt(Integer::intValue))
                    .toList();
        }

        if (allTrimesterCandidates.isEmpty()) {
            return List.of();
        }

        return allTrimesterCandidates.stream()
                .sorted(Comparator.<Integer>comparingInt(candidate -> trimesterSupport.getOrDefault(candidate, 0))
                        .reversed()
                        .thenComparingInt(Integer::intValue))
                .toList();
    }

    private Integer resolveEffectiveTrimesterOrThrow(List<String> subjectCodes,
            Map<String, List<ScheduleEntry>> entriesBySubject, Integer requestedTrimester) {
        List<Integer> candidates = resolveEffectiveTrimesterCandidates(subjectCodes, entriesBySubject,
                requestedTrimester);
        return candidates.isEmpty() ? null : candidates.get(0);
    }

    private LinkedHashSet<Integer> extractTrimesterCandidates(String term) {
        LinkedHashSet<Integer> candidates = new LinkedHashSet<>();

        if (isAnnualTerm(term)) {
            candidates.add(1);
            candidates.add(2);
            candidates.add(3);
            return candidates;
        }

        Integer trimester = extractTrimester(term);
        if (trimester != null) {
            candidates.add(trimester);
        }

        return candidates;
    }

    private List<String> normalizeSubjectCodes(List<String> subjectCodes) {
        if (subjectCodes == null || subjectCodes.isEmpty()) {
            return List.of();
        }

        LinkedHashSet<String> uniqueCodes = new LinkedHashSet<>();
        for (String subjectCode : subjectCodes) {
            String normalizedCode = normalizeSubjectCode(subjectCode);
            if (normalizedCode == null) {
                continue;
            }

            uniqueCodes.add(normalizedCode);
        }

        return new ArrayList<>(uniqueCodes);
    }

    private String normalizeSubjectCode(String raw) {
        if (raw == null) {
            return null;
        }

        String cleaned = stripTrimesterSuffix(raw.trim());
        if (cleaned.isEmpty()) {
            return null;
        }

        String normalized = Normalizer.normalize(cleaned, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]", "");

        return normalized.isBlank() ? null : normalized;
    }

    private Integer resolveRequestedTrimester(Integer requestedTrimester, List<String> rawSubjectCodes) {
        LinkedHashSet<Integer> codedTrimesters = new LinkedHashSet<>();

        if (rawSubjectCodes != null) {
            for (String rawCode : rawSubjectCodes) {
                Integer codedTrimester = extractTrimesterFromCode(rawCode);
                if (codedTrimester != null) {
                    codedTrimesters.add(codedTrimester);
                }
            }
        }

        if (requestedTrimester != null) {
            return requestedTrimester;
        }

        return codedTrimesters.size() == 1 ? codedTrimesters.iterator().next() : null;
    }

    private String stripTrimesterSuffix(String code) {
        if (code == null) {
            return null;
        }

        String cleaned = code.trim();
        if (cleaned.isEmpty()) {
            return cleaned;
        }

        int tokenIndex = findTrimesterSuffixIndex(cleaned);
        if (tokenIndex <= 0) {
            return cleaned;
        }

        int suffixLength = cleaned.regionMatches(true, tokenIndex, "__T", 0, 3) ? 3 : 1;
        String maybeTrimester = cleaned.substring(tokenIndex + suffixLength);
        for (int i = 0; i < maybeTrimester.length(); i++) {
            if (!Character.isDigit(maybeTrimester.charAt(i))) {
                return cleaned;
            }
        }

        return cleaned.substring(0, tokenIndex);
    }

    private Integer extractTrimesterFromCode(String code) {
        if (code == null) {
            return null;
        }

        String cleaned = code.trim();
        int tokenIndex = findTrimesterSuffixIndex(cleaned);
        if (tokenIndex <= 0) {
            return null;
        }

        int suffixLength = cleaned.regionMatches(true, tokenIndex, "__T", 0, 3) ? 3 : 1;
        String maybeTrimester = cleaned.substring(tokenIndex + suffixLength);
        for (int i = 0; i < maybeTrimester.length(); i++) {
            if (!Character.isDigit(maybeTrimester.charAt(i))) {
                return null;
            }
        }

        try {
            int parsed = Integer.parseInt(maybeTrimester);
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private int findTrimesterSuffixIndex(String code) {
        String upper = code.toUpperCase(Locale.ROOT);
        int underscoreIndex = upper.lastIndexOf('_');
        if (underscoreIndex > 0 && underscoreIndex + 1 < upper.length()) {
            return underscoreIndex;
        }

        int legacyIndex = upper.lastIndexOf("__T");
        return legacyIndex;
    }

    private SubjectAlternatives buildAlternatives(String subjectCode, Map<String, List<ScheduleEntry>> entriesBySubject,
            Integer trimester, TimetableGenerationPreferences preferences) {
        List<ScheduleEntry> entries = entriesBySubject.get(subjectCode);
        if (entries != null && trimester != null) {
            entries = entries.stream()
                    .filter(entry -> matchesTrimester(entry.term(), trimester))
                    .toList();
        }

        if (entries == null || entries.isEmpty()) {
            if (DEBUG_SUBJECT_CODE.equals(subjectCode)) {
                logger.debug("No entries found for debug subject {}. Entries map has {} subjects",
                        DEBUG_SUBJECT_CODE, entriesBySubject.size());
            }
            throw new ResourceNotFoundException("No hi ha horari disponible per a l'assignatura " + subjectCode);
        }

        Map<String, List<GroupOption>> optionsByType = new LinkedHashMap<>();

        for (ScheduleEntry entry : entries) {
            String typeKey = normalizeType(entry.sessionType(), entry.groupCode());
            List<GroupOption> options = optionsByType.computeIfAbsent(typeKey, key -> new ArrayList<>());

            GroupOption groupOption = options.stream()
                    .filter(option -> option.groupCode().equals(entry.groupCode()))
                    .findFirst()
                    .orElseGet(() -> {
                        GroupOption created = new GroupOption(
                                resolveGroupTypeName(entry.sessionType(), entry.groupCode()),
                                entry.groupCode(),
                                new ArrayList<>());
                        options.add(created);
                        return created;
                    });

            groupOption.entries().add(entry);
        }

        List<GroupOption> theoryOptions = optionsByType.get("teoria");
        List<GroupOption> practiceOptions = optionsByType.get("practiques");

        // Some subjects (e.g. language or workshop subjects) may only have a single
        // kind of session in the import (often recorded as "Pràctiques"). In those
        // cases treat the available option as the main group so the generator can
        // still build alternatives instead of failing with a missing-theory error.
        if ((theoryOptions == null || theoryOptions.isEmpty())
                && (practiceOptions != null && !practiceOptions.isEmpty())) {
            theoryOptions = practiceOptions;
            practiceOptions = null;
        }

        if (theoryOptions == null || theoryOptions.isEmpty()) {
            throw new ResourceNotFoundException("No hi ha grups de teoria per a l'assignatura " + subjectCode);
        }

        List<SubjectAlternative> alternatives = combineTheoryAndPracticeGroups(subjectCode, theoryOptions,
                practiceOptions, preferences);

        if (alternatives.isEmpty()) {
            throw new ResourceNotFoundException(
                    "No s'han pogut construir grups valids per a l'assignatura " + subjectCode);
        }

        return new SubjectAlternatives(alternatives);
    }

    public void invalidateImportedEntriesCache() {
        timetableExcelImportService.invalidateCache();
    }

    private List<SubjectAlternative> combineTheoryAndPracticeGroups(
            String subjectCode,
            List<GroupOption> theoryOptions,
            List<GroupOption> practiceOptions,
            TimetableGenerationPreferences preferences) {
        List<ScoredSubjectAlternative> scoredAlternatives = new ArrayList<>();
        List<GroupOption> effectivePracticeOptions = (practiceOptions == null || practiceOptions.isEmpty())
                ? Collections.singletonList(null)
                : practiceOptions;

        for (GroupOption theoryOption : theoryOptions) {
            for (GroupOption practiceOption : effectivePracticeOptions) {
                Stream<ScheduleEntry> practiceEntries = practiceOption == null
                        ? Stream.empty()
                        : practiceOption.entries().stream();

                List<ScheduleEntry> selectedEntries = Stream.concat(theoryOption.entries().stream(), practiceEntries)
                        .sorted(Comparator
                                .comparing(ScheduleEntry::term)
                                .thenComparingInt(ScheduleEntry::dayOfWeek)
                                .thenComparingInt(ScheduleEntry::startMinute)
                                .thenComparing(ScheduleEntry::subjectCode)
                                .thenComparing(ScheduleEntry::groupCode))
                        .toList();

                if (hasSelfConflict(selectedEntries)) {
                    continue;
                }

                List<GroupChoiceDTO> groups = new ArrayList<>();
                groups.add(new GroupChoiceDTO(theoryOption.typeName(), theoryOption.groupCode()));
                if (practiceOption != null) {
                    groups.add(new GroupChoiceDTO(practiceOption.typeName(), practiceOption.groupCode()));
                }

                scoredAlternatives.add(new ScoredSubjectAlternative(
                        new SubjectAlternative(
                                new SubjectSelectionDTO(subjectCode, List.copyOf(groups)),
                                selectedEntries)));
            }
        }

        scoredAlternatives.sort(Comparator
                .comparing(candidate -> candidate.alternative().selection().groups().stream()
                        .map(GroupChoiceDTO::groupCode)
                        .collect(java.util.stream.Collectors.joining("|"))));

        return scoredAlternatives.stream()
                .map(ScoredSubjectAlternative::alternative)
                .toList();
    }

    private boolean backtrack(
            int depth,
            List<SubjectAlternatives> alternativesBySubject,
            List<SubjectSelectionDTO> selectedSubjects,
            List<ScheduleEntry> selectedEntries,
            List<ScoredTimetableOption> result,
            TimetableGenerationPreferences preferences,
            int currentConflictCount,
            int currentOverlapMinutes,
            int explorationLimit,
            int[] exploredLeaves) {

        if (exploredLeaves[0] >= explorationLimit) {
            return true;
        }

        if (depth == alternativesBySubject.size()) {
            TimetableOptionDTO option = toTimetableOption(selectedSubjects, selectedEntries);
            result.add(new ScoredTimetableOption(
                    option,
                    currentConflictCount,
                    currentOverlapMinutes,
                    calculatePreferenceScore(option, preferences)));
            exploredLeaves[0] += 1;
            return exploredLeaves[0] >= explorationLimit;
        }

        SubjectAlternatives subjectAlternatives = alternativesBySubject.get(depth);
        for (SubjectAlternative alternative : subjectAlternatives.alternatives()) {
            ConflictStats additionalStats = calculateConflictStats(alternative.entries(), selectedEntries);

            selectedSubjects.add(alternative.selection());
            selectedEntries.addAll(alternative.entries());

            boolean limitReached = backtrack(
                    depth + 1,
                    alternativesBySubject,
                    selectedSubjects,
                    selectedEntries,
                    result,
                    preferences,
                    currentConflictCount + additionalStats.conflictCount(),
                    currentOverlapMinutes + additionalStats.overlapMinutes(),
                    explorationLimit,
                    exploredLeaves);

            selectedSubjects.remove(selectedSubjects.size() - 1);
            selectedEntries.subList(selectedEntries.size() - alternative.entries().size(), selectedEntries.size())
                    .clear();

            if (limitReached) {
                return true;
            }
        }

        return false;
    }

    private TimetableOptionDTO buildBestEffortOption(List<SubjectAlternatives> alternativesBySubject,
            TimetableGenerationPreferences preferences) {
        BestEffortSolution bestSolution = new BestEffortSolution(null, Integer.MAX_VALUE, Integer.MAX_VALUE, -1d);

        BestEffortSolution resolvedSolution = backtrackBestEffort(
                0,
                alternativesBySubject,
                new ArrayList<>(),
                new ArrayList<>(),
                0,
                0,
                preferences,
                bestSolution);

        if (resolvedSolution.option() == null) {
            throw new ResourceNotFoundException(
                    "No s'ha pogut generar cap horari per a les assignatures seleccionades");
        }

        return resolvedSolution.option();
    }

    private BestEffortSolution backtrackBestEffort(
            int depth,
            List<SubjectAlternatives> alternativesBySubject,
            List<SubjectSelectionDTO> selectedSubjects,
            List<ScheduleEntry> selectedEntries,
            int currentConflictCount,
            int currentOverlapMinutes,
            TimetableGenerationPreferences preferences,
            BestEffortSolution bestSolution) {
        if (isWorseOrEqualThanBest(currentConflictCount, currentOverlapMinutes, bestSolution)) {
            return bestSolution;
        }

        if (depth == alternativesBySubject.size()) {
            TimetableOptionDTO option = toTimetableOption(selectedSubjects, selectedEntries);
            return new BestEffortSolution(
                    option,
                    currentConflictCount,
                    currentOverlapMinutes,
                    calculatePreferenceScore(option, preferences));
        }

        BestEffortSolution currentBest = bestSolution;
        SubjectAlternatives subjectAlternatives = alternativesBySubject.get(depth);

        for (SubjectAlternative alternative : subjectAlternatives.alternatives()) {
            ConflictStats additionalStats = calculateConflictStats(alternative.entries(), selectedEntries);

            selectedSubjects.add(alternative.selection());
            selectedEntries.addAll(alternative.entries());

            BestEffortSolution candidateSolution = backtrackBestEffort(
                    depth + 1,
                    alternativesBySubject,
                    selectedSubjects,
                    selectedEntries,
                    currentConflictCount + additionalStats.conflictCount(),
                    currentOverlapMinutes + additionalStats.overlapMinutes(),
                    preferences,
                    currentBest);

            selectedSubjects.remove(selectedSubjects.size() - 1);
            selectedEntries.subList(selectedEntries.size() - alternative.entries().size(), selectedEntries.size())
                    .clear();

            if (candidateSolution.isBetterThan(currentBest)) {
                currentBest = candidateSolution;
            }
        }

        return currentBest;
    }

    private boolean isWorseOrEqualThanBest(int currentConflictCount, int currentOverlapMinutes,
            BestEffortSolution bestSolution) {
        return bestSolution.option() != null
                && (currentConflictCount > bestSolution.conflictCount()
                        || (currentConflictCount == bestSolution.conflictCount()
                                && currentOverlapMinutes > bestSolution.overlapMinutes()));
    }

    private ConflictStats calculateConflictStats(List<ScheduleEntry> candidateEntries,
            List<ScheduleEntry> selectedEntries) {
        int conflicts = 0;
        int overlapMinutes = 0;

        for (ScheduleEntry candidate : candidateEntries) {
            for (ScheduleEntry selected : selectedEntries) {
                if (isConflict(candidate, selected)) {
                    conflicts++;
                    overlapMinutes += calculateOverlapMinutes(candidate, selected);
                }
            }
        }

        return new ConflictStats(conflicts, overlapMinutes);
    }

    private int calculateOverlapMinutes(ScheduleEntry first, ScheduleEntry second) {
        return Math.max(
                0,
                Math.min(first.endMinute(), second.endMinute()) - Math.max(first.startMinute(), second.startMinute()));
    }

    private double calculatePreferenceScore(TimetableOptionDTO option, TimetableGenerationPreferences preferences) {
        String optimization = normalizeOptimizationKey(preferences == null ? null : preferences.optimization());
        if (optimization == null) {
            return 0d;
        }

        PreferenceMetrics metrics = calculatePreferenceMetrics(option);

        return switch (optimization) {
            case "minimize-gaps" -> inverseScore(metrics.gapMinutes() / 60d);
            case "free-day" -> clampScore(metrics.freeDays() / 5d);
            case "balanced" -> inverseScore(metrics.meanDeviationMinutes() / 60d);
            case "avoid-early" -> inverseScore(metrics.earlyStarts());
            case "avoid-late" -> inverseScore(metrics.lateEnds());
            case "group-by-type" -> clampScore((metrics.pureDays()
                    + Math.min(metrics.theoryDays(), metrics.practiceDays) * 0.5
                    - metrics.mixedDays() * 0.25) / Math.max(1, metrics.activeDays()));
            default -> 0d;
        };
    }

    private PreferenceMetrics calculatePreferenceMetrics(TimetableOptionDTO option) {
        Map<Integer, List<ScheduleSlotDTO>> byDay = new LinkedHashMap<>();
        List<ScheduleSlotDTO> allSlots = Stream
                .concat(option.firstWeekSlots().stream(), option.secondWeekSlots().stream())
                .toList();

        for (ScheduleSlotDTO slot : allSlots) {
            int day = slot.dayOfWeek();
            if (day < 1 || day > 5) {
                continue;
            }

            byDay.computeIfAbsent(day, ignored -> new ArrayList<>()).add(slot);
        }

        int activeDays = 0;
        int freeDays = Math.max(0, 5 - byDay.size());
        double totalDailyMinutes = 0d;
        List<Double> dailyTotalsByDay = new ArrayList<>();
        int gapMinutes = 0;
        int earlyStarts = 0;
        int lateEnds = 0;
        int pureDays = 0;
        int mixedDays = 0;
        int theoryDays = 0;
        int practiceDays = 0;

        for (int day = 1; day <= 5; day++) {
            List<ScheduleSlotDTO> daySlots = byDay.get(day);
            if (daySlots == null || daySlots.isEmpty()) {
                continue;
            }

            activeDays++;
            List<ScheduleSlotDTO> sortedDaySlots = daySlots.stream()
                    .sorted(Comparator.comparingInt(slot -> parseTimeRange(slot.timeRange())[0]))
                    .toList();

            double dailyMinutes = 0d;
            java.util.Set<String> types = new java.util.LinkedHashSet<>();

            for (int index = 0; index < sortedDaySlots.size(); index++) {
                ScheduleSlotDTO slot = sortedDaySlots.get(index);
                int[] range = parseTimeRange(slot.timeRange());
                int startMinute = range[0];
                int endMinute = range[1];
                dailyMinutes += Math.max(0, endMinute - startMinute);

                String normalizedType = normalizeSlotType(slot.type());
                if (normalizedType != null) {
                    types.add(normalizedType);
                }

                if (index == 0 && (startMinute == 8 * 60 + 15 || startMinute == 15 * 60)) {
                    earlyStarts++;
                }

                if (endMinute == 14 * 60 || endMinute == 20 * 60 + 45) {
                    lateEnds++;
                }

                if (index > 0) {
                    int[] previousRange = parseTimeRange(sortedDaySlots.get(index - 1).timeRange());
                    gapMinutes += Math.max(0, startMinute - previousRange[1]);
                }
            }

            totalDailyMinutes += dailyMinutes;
            dailyTotalsByDay.add(dailyMinutes);

            if (types.size() == 1) {
                pureDays++;
                if (types.contains("theory")) {
                    theoryDays++;
                }
                if (types.contains("practice")) {
                    practiceDays++;
                }
            } else if (types.size() > 1) {
                mixedDays++;
            }
        }

        double meanDailyMinutes = activeDays == 0 ? 0d : totalDailyMinutes / activeDays;
        double meanDeviationMinutes = 0d;
        for (double value : dailyTotalsByDay) {
            meanDeviationMinutes += Math.abs(value - meanDailyMinutes);
        }
        if (activeDays > 0) {
            meanDeviationMinutes /= activeDays;
        }

        return new PreferenceMetrics(activeDays, freeDays, gapMinutes, meanDeviationMinutes, earlyStarts,
                lateEnds, pureDays, mixedDays, theoryDays, practiceDays);
    }

    private int[] parseTimeRange(String timeRange) {
        if (timeRange == null || timeRange.isBlank()) {
            return new int[] { 0, 0 };
        }

        String[] parts = timeRange.trim().split("-");
        if (parts.length != 2) {
            return new int[] { 0, 0 };
        }

        return new int[] { parseHourMinute(parts[0]), parseHourMinute(parts[1]) };
    }

    private int parseHourMinute(String time) {
        if (time == null || time.isBlank()) {
            return 0;
        }

        String[] parts = time.trim().split(":");
        if (parts.length != 2) {
            return 0;
        }

        try {
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private String normalizeOptimizationKey(String optimization) {
        if (optimization == null || optimization.isBlank()) {
            return null;
        }

        return switch (optimization.trim().toLowerCase(Locale.ROOT)) {
            case "minimize-gaps", "minimize_gaps", "avoid-gaps", "avoid_gaps" -> "minimize-gaps";
            case "free-day", "free_day", "avoid-friday" -> "free-day";
            case "balanced", "minimize-days", "compact-days" -> "balanced";
            case "avoid-early", "avoid_early", "first-hour", "morning" -> "avoid-early";
            case "avoid-late", "avoid_late", "last-hour", "afternoon" -> "avoid-late";
            case "group-by-type", "group_by_type", "by-type", "compact" -> "group-by-type";
            default -> optimization.trim().toLowerCase(Locale.ROOT);
        };
    }

    private String normalizeSlotType(String type) {
        if (type == null || type.isBlank()) {
            return null;
        }

        String normalized = Normalizer.normalize(type, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");

        if (normalized.contains("teoria")) {
            return "theory";
        }

        if (normalized.contains("practic")) {
            return "practice";
        }

        return null;
    }

    private double clampScore(double value) {
        return Math.max(0d, Math.min(1d, value));
    }

    private double inverseScore(double penalty) {
        return 1d / (1d + Math.max(0d, penalty));
    }

    private TimetableOptionDTO toTimetableOption(List<SubjectSelectionDTO> selectedSubjects,
            List<ScheduleEntry> selectedEntries) {
        List<ScheduleEntry> sortedEntries = selectedEntries.stream()
                .sorted(Comparator
                        .comparing(ScheduleEntry::term)
                        .thenComparingInt(ScheduleEntry::dayOfWeek)
                        .thenComparingInt(ScheduleEntry::startMinute)
                        .thenComparing(ScheduleEntry::subjectCode)
                        .thenComparing(ScheduleEntry::groupCode))
                .toList();

        List<ScheduleSlotDTO> firstWeekSlots = sortedEntries.stream()
                .filter(entry -> entry.weekType() == null || entry.weekType() == 1)
                .map(this::toSlot)
                .toList();

        List<ScheduleSlotDTO> secondWeekSlots = sortedEntries.stream()
                .filter(entry -> entry.weekType() == null || entry.weekType() == 2)
                .map(this::toSlot)
                .toList();

        List<ScheduleOverlapDTO> overlaps = buildOverlaps(sortedEntries);
        List<SubjectGroupingDTO> subjects = buildSubjectGroupings(sortedEntries);
        String explanation = buildOptionExplanation(subjects);

        return new TimetableOptionDTO(
                List.copyOf(selectedSubjects),
                firstWeekSlots,
                secondWeekSlots,
                overlaps,
                subjects,
                explanation);
    }

    private List<SubjectGroupingDTO> buildSubjectGroupings(List<ScheduleEntry> entries) {
        Map<String, Map<String, GroupInfoDTO>> groupsBySubject = new LinkedHashMap<>();

        for (ScheduleEntry entry : entries) {
            String subjectCode = entry.subjectCode();
            if (subjectCode == null || subjectCode.isBlank()) {
                continue;
            }

            String typeName = resolveGroupTypeName(entry.sessionType(), entry.groupCode());
            String groupCode = (entry.groupCode() == null || entry.groupCode().isBlank())
                    ? "-"
                    : entry.groupCode().trim();

            Map<String, GroupInfoDTO> subjectGroups = groupsBySubject.computeIfAbsent(
                    subjectCode,
                    ignored -> new LinkedHashMap<>());
            String uniqueKey = typeName + "|" + groupCode;
            subjectGroups.putIfAbsent(uniqueKey, new GroupInfoDTO(typeName, groupCode));
        }

        List<SubjectGroupingDTO> result = new ArrayList<>();
        for (Map.Entry<String, Map<String, GroupInfoDTO>> subjectEntry : groupsBySubject.entrySet()) {
            result.add(new SubjectGroupingDTO(subjectEntry.getKey(), List.copyOf(subjectEntry.getValue().values())));
        }

        return result;
    }

    private String buildOptionExplanation(List<SubjectGroupingDTO> subjects) {
        StringBuilder sb = new StringBuilder();
        sb.append("Assignatures:\n");

        for (SubjectGroupingDTO subject : subjects) {
            List<String> parts = subject.groups().stream()
                    .map(group -> group.typeName() + " (" + group.groupCode() + ")")
                    .toList();

            sb.append(subject.subjectCode())
                    .append(": ")
                    .append(String.join(", ", parts))
                    .append("\n");
        }

        return sb.toString().trim();
    }

    private List<ScheduleOverlapDTO> buildOverlaps(List<ScheduleEntry> sortedEntries) {
        List<ScheduleOverlapDTO> overlaps = new ArrayList<>();

        for (int i = 0; i < sortedEntries.size(); i++) {
            for (int j = i + 1; j < sortedEntries.size(); j++) {
                ScheduleEntry first = sortedEntries.get(i);
                ScheduleEntry second = sortedEntries.get(j);

                if (!isConflict(first, second)) {
                    continue;
                }

                int overlapStart = Math.max(first.startMinute(), second.startMinute());
                int overlapEnd = Math.min(first.endMinute(), second.endMinute());
                int overlapMinutes = Math.max(0, overlapEnd - overlapStart);

                overlaps.add(new ScheduleOverlapDTO(
                        first.term(),
                        first.dayOfWeek(),
                        formatTimeRange(overlapStart, overlapEnd),
                        overlapMinutes,
                        resolveOverlapWeekType(first.weekType(), second.weekType()),
                        toSlot(first),
                        toSlot(second)));
            }
        }

        return overlaps;
    }

    private Integer resolveOverlapWeekType(Integer firstWeekType, Integer secondWeekType) {
        if (firstWeekType == null && secondWeekType == null) {
            return null;
        }

        if (firstWeekType == null) {
            return secondWeekType;
        }

        if (secondWeekType == null) {
            return firstWeekType;
        }

        return firstWeekType;
    }

    private String formatTimeRange(int startMinute, int endMinute) {
        return toHourMinute(startMinute) + "-" + toHourMinute(endMinute);
    }

    private String toHourMinute(int totalMinutes) {
        int hour = totalMinutes / 60;
        int minute = totalMinutes % 60;
        return String.format(Locale.ROOT, "%02d:%02d", hour, minute);
    }

    private String buildCollisionMessage(List<ScheduleOverlapDTO> overlaps) {
        if (overlaps == null || overlaps.isEmpty()) {
            return NO_CONFLICT_FREE_COMBINATIONS_ERROR;
        }

        List<String> lines = overlaps.stream()
                .map(overlap -> String.format(
                        Locale.ROOT,
                        "%s %s (%s i %s)",
                        toDayName(overlap.dayOfWeek()),
                        overlap.overlapTimeRange(),
                        overlap.firstSlot().subjectCode(),
                        overlap.secondSlot().subjectCode()))
                .distinct()
                .toList();

        return "Hi ha col·lisions d'horari: " + String.join("; ", lines);
    }

    private String toDayName(int dayOfWeek) {
        return switch (dayOfWeek) {
            case 1 -> "dilluns";
            case 2 -> "dimarts";
            case 3 -> "dimecres";
            case 4 -> "dijous";
            case 5 -> "divendres";
            case 6 -> "dissabte";
            case 7 -> "diumenge";
            default -> "dia " + dayOfWeek;
        };
    }

    private boolean hasConflict(List<ScheduleEntry> candidateEntries, List<ScheduleEntry> selectedEntries) {
        for (ScheduleEntry candidate : candidateEntries) {
            for (ScheduleEntry selected : selectedEntries) {
                if (isConflict(candidate, selected)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean hasSelfConflict(List<ScheduleEntry> entries) {
        for (int i = 0; i < entries.size(); i++) {
            for (int j = i + 1; j < entries.size(); j++) {
                if (isConflict(entries.get(i), entries.get(j))) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean isConflict(ScheduleEntry first, ScheduleEntry second) {
        if (!first.term().equals(second.term())) {
            return false;
        }

        if (first.dayOfWeek() != second.dayOfWeek()) {
            return false;
        }

        if (!weeksOverlap(first.weekType(), second.weekType())) {
            return false;
        }

        return first.startMinute() < second.endMinute() && second.startMinute() < first.endMinute();
    }

    private boolean weeksOverlap(Integer firstWeekType, Integer secondWeekType) {
        return firstWeekType == null || secondWeekType == null || firstWeekType.equals(secondWeekType);
    }

    private record ScoredSubjectAlternative(SubjectAlternative alternative) {
    }

    private record PreferenceMetrics(int activeDays, int freeDays, int gapMinutes, double meanDeviationMinutes,
            int earlyStarts, int lateEnds, int pureDays, int mixedDays, int theoryDays, int practiceDays) {
    }

    private record ScoredTimetableOption(TimetableOptionDTO option, int conflictCount, int overlapMinutes,
            double preferenceScore) {
    }

    private String normalizeType(String type) {
        return normalizeType(type, null);
    }

    private String normalizeType(String type, String groupCode) {
        if (groupCode != null && groupCode.trim().matches("^G\\d{3,}$")) {
            return "practiques";
        }

        if (type == null || type.isBlank()) {
            return "general";
        }

        String normalized = Normalizer.normalize(type, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");

        if (normalized.contains("teoria")) {
            return "teoria";
        }

        if (normalized.contains("practic")) {
            return "practiques";
        }

        return normalized.isBlank() ? "general" : normalized;
    }

    private String resolveGroupTypeName(String type, String groupCode) {
        if (groupCode != null && groupCode.trim().matches("^G\\d{3,}$")) {
            return "Pràctiques";
        }

        if (type == null || type.isBlank()) {
            return "General";
        }

        String normalized = Normalizer.normalize(type, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");

        if (normalized.contains("teoria")) {
            return "Teoria";
        }

        if (normalized.contains("practic")) {
            return "Pràctiques";
        }

        return type.trim().isEmpty() ? "General" : type.trim();
    }

    private ScheduleSlotDTO toSlot(ScheduleEntry entry) {
        return new ScheduleSlotDTO(
                entry.term(),
                entry.dayOfWeek(),
                entry.timeRange(),
                entry.weekType(),
                entry.subjectCode(),
                entry.groupCode(),
                entry.sessionType());
    }

    private boolean matchesTrimester(String term, Integer requestedTrimester) {
        if (requestedTrimester == null)
            return true;

        if (isAnnualTerm(term)) {
            return true;
        }

        Integer parsedTrimester = extractTrimester(term);
        return parsedTrimester != null && parsedTrimester.equals(requestedTrimester);
    }

    private boolean isAnnualTerm(String term) {
        if (term == null || term.isBlank()) {
            return false;
        }

        String normalized = term.trim().toLowerCase(Locale.ROOT);
        return normalized.contains("anual") || normalized.contains("annual") || normalized.contains("any");
    }

    private Integer extractTrimester(String term) {
        if (term == null || term.isBlank()) {
            return null;
        }

        String normalized = term.trim().toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");

        if (normalized.contains("1r trim"))
            return 1;
        if (normalized.contains("2n trim"))
            return 2;
        if (normalized.contains("3r trim"))
            return 3;
        return null;
    }

    private record SubjectAlternatives(List<SubjectAlternative> alternatives) {
    }

    private record SubjectAlternative(SubjectSelectionDTO selection, List<ScheduleEntry> entries) {
    }

    private record GroupOption(String typeName, String groupCode, List<ScheduleEntry> entries) {
    }

    private record ConflictStats(int conflictCount, int overlapMinutes) {
    }

    private record BestEffortSolution(TimetableOptionDTO option, int conflictCount, int overlapMinutes,
            double preferenceScore) {
        private boolean isBetterThan(BestEffortSolution other) {
            if (other == null || other.option() == null) {
                return option != null;
            }

            if (option == null) {
                return false;
            }

            if (conflictCount != other.conflictCount()) {
                return conflictCount < other.conflictCount();
            }

            if (overlapMinutes != other.overlapMinutes()) {
                return overlapMinutes < other.overlapMinutes();
            }

            return preferenceScore > other.preferenceScore();
        }
    }
}
