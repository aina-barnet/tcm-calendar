package com.tecnocampus.backend.subjects.persistance;

import com.tecnocampus.backend.subjects.domain.Subject;
import com.tecnocampus.backend.subjects.application.SubjectCatalog;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class JpaSubjectCatalog implements SubjectCatalog {

    private final SubjectRepository subjectRepository;

    public JpaSubjectCatalog(SubjectRepository subjectRepository) {
        this.subjectRepository = subjectRepository;
    }

    @Override
    public List<Subject> findAll() {
        return subjectRepository.findAll();
    }

    @Override
    public Optional<Subject> findByCode(String code) {
        return subjectRepository.findByCode(code);
    }

    @Override
    public Optional<Subject> findByDegreeAndCode(String degree, String code) {
        return subjectRepository.findByDegreeAndCode(degree, code);
    }

    @Override
    public List<Subject> findByDegree(String degree) {
        return subjectRepository.findByDegree(degree);
    }

    @Override
    public List<Subject> findByDegreeAndCourse(String degree, Integer course) {
        return subjectRepository.findByDegreeAndCourse(degree, course);
    }

    @Override
    public List<Subject> findByDegreeAndTrimester(String degree, Integer trimester) {
        return subjectRepository.findByDegreeAndTrimester(degree, trimester);
    }

    @Override
    public List<Subject> findByDegreeAndCourseAndTrimester(String degree, Integer course, Integer trimester) {
        return subjectRepository.findByDegreeAndCourseAndTrimester(degree, course, trimester);
    }

    @Override
    public long count() {
        return subjectRepository.count();
    }

    @Override
    public List<Subject> saveAll(List<Subject> subjects) {
        return subjectRepository.saveAll(subjects);
    }
}
