package com.tecnocampus.backend.subjects.application;

import com.tecnocampus.backend.subjects.domain.Subject;

import java.util.List;
import java.util.Optional;

public interface SubjectCatalog {
    List<Subject> findAll();

    Optional<Subject> findByCode(String code);

    Optional<Subject> findByDegreeAndCode(String degree, String code);

    List<Subject> findByDegree(String degree);

    List<Subject> findByDegreeAndCourse(String degree, Integer course);

    List<Subject> findByDegreeAndTrimester(String degree, Integer trimester);

    List<Subject> findByDegreeAndCourseAndTrimester(String degree, Integer course, Integer trimester);

    long count();

    List<Subject> saveAll(List<Subject> subjects);
}
