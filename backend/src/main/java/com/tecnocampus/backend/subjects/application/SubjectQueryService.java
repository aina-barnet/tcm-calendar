package com.tecnocampus.backend.subjects.application;

import com.tecnocampus.backend.shared.DegreeResourceRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.tecnocampus.backend.subjects.application.DTOs.SubjectDTO;
import com.tecnocampus.backend.subjects.domain.Subject;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SubjectQueryService {

    private static final Logger logger = LoggerFactory.getLogger(SubjectQueryService.class);

    private final SubjectCatalog subjectCatalog;
    private final SubjectImportManager subjectImportManager;
    private final DegreeResourceRegistry degreeResourceRegistry;

    public SubjectQueryService(SubjectCatalog subjectCatalog,
            SubjectImportManager subjectImportManager,
            DegreeResourceRegistry degreeResourceRegistry) {
        this.subjectCatalog = subjectCatalog;
        this.subjectImportManager = subjectImportManager;
        this.degreeResourceRegistry = degreeResourceRegistry;
    }

    @Transactional(readOnly = true)
    public List<SubjectDTO> getAllSubjects() {
        return subjectCatalog.findAll().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public SubjectDTO getSubjectByCode(String code) {
        // Legacy lookup retained for backwards compatibility.
        // Code is no longer globally unique, so prefer getSubjectByDegreeAndCode when
        // the degree is known.
        Subject subject = subjectCatalog.findByCode(code)
                .orElseThrow(() -> new RuntimeException("Assignatura no trobada amb codi: " + code));
        return toDTO(subject);
    }

    @Transactional(readOnly = true)
    public SubjectDTO getSubjectByDegreeAndCode(String degree, String code) {
        Subject subject = subjectCatalog.findByDegreeAndCode(degree, code)
                .orElseThrow(() -> new RuntimeException(
                        "Assignatura no trobada amb grau: " + degree + " i codi: " + code));
        return toDTO(subject);
    }

    @Transactional(readOnly = true)
    public List<SubjectDTO> getSubjectsByDegree(String degree) {
        if (degreeResourceRegistry.isComposite(degree)) {
            return distinctByCode(degreeResourceRegistry.getBaseDegrees(degree).stream()
                    .flatMap(baseDegree -> getSubjectsByDegree(baseDegree).stream())
                    .collect(Collectors.toList()));
        }

        var subjects = subjectCatalog.findByDegree(degree);
        if (subjects.isEmpty()) {
            try {
                boolean imported = subjectImportManager.importIfResourceAvailable(degree);
                if (imported) {
                    subjects = subjectCatalog.findByDegree(degree);
                }
            } catch (Exception e) {
                logger.error("Failed on-demand import for degree {}: {}", degree, e.getMessage(), e);
                return List.of();
            }
        }
        return subjects.stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SubjectDTO> getSubjectsByDegreeAndCourse(String degree, Integer course) {
        if (degreeResourceRegistry.isComposite(degree)) {
            return distinctByCode(degreeResourceRegistry.getBaseDegrees(degree).stream()
                    .flatMap(baseDegree -> getSubjectsByDegreeAndCourse(baseDegree, course).stream())
                    .collect(Collectors.toList()));
        }

        var subjects = subjectCatalog.findByDegreeAndCourse(degree, course);
        if (subjects.isEmpty()) {
            // attempt on-demand import then re-query
            getSubjectsByDegree(degree);
            subjects = subjectCatalog.findByDegreeAndCourse(degree, course);
        }
        return subjects.stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SubjectDTO> getSubjectsByDegreeAndSemester(String degree, Integer semester) {
        if (degreeResourceRegistry.isComposite(degree)) {
            return distinctByCode(degreeResourceRegistry.getBaseDegrees(degree).stream()
                    .flatMap(baseDegree -> getSubjectsByDegreeAndSemester(baseDegree, semester).stream())
                    .collect(Collectors.toList()));
        }

        var subjects = subjectCatalog.findByDegreeAndTrimester(degree, semester);
        if (subjects.isEmpty()) {
            getSubjectsByDegree(degree);
            subjects = subjectCatalog.findByDegreeAndTrimester(degree, semester);
        }
        return subjects.stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SubjectDTO> getSubjectsByDegreeAndCourseAndSemester(String degree, Integer course, Integer semester) {
        if (degreeResourceRegistry.isComposite(degree)) {
            return distinctByCode(degreeResourceRegistry.getBaseDegrees(degree).stream()
                    .flatMap(baseDegree -> getSubjectsByDegreeAndCourseAndSemester(baseDegree, course, semester)
                            .stream())
                    .collect(Collectors.toList()));
        }

        var subjects = subjectCatalog.findByDegreeAndCourseAndTrimester(degree, course, semester);
        if (subjects.isEmpty()) {
            getSubjectsByDegree(degree);
            subjects = subjectCatalog.findByDegreeAndCourseAndTrimester(degree, course, semester);
        }
        return subjects.stream().map(this::toDTO).collect(Collectors.toList());
    }

    private SubjectDTO toDTO(Subject subject) {
        return new SubjectDTO(
                subject.getId(),
                subject.getCode(),
                subject.getName(),
                subject.getEcts(),
                subject.getCourse(),
                subject.getTrimester(),
                subject.getType(),
                subject.getDegree());
    }

    private List<SubjectDTO> distinctByCode(List<SubjectDTO> subjects) {
        Map<String, SubjectDTO> uniqueSubjects = new LinkedHashMap<>();

        for (SubjectDTO subject : subjects) {
            if (subject == null || subject.getCode() == null) {
                continue;
            }
            uniqueSubjects.putIfAbsent(subject.getCode(), subject);
        }

        return List.copyOf(uniqueSubjects.values());
    }
}
