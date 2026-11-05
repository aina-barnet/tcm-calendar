package com.tecnocampus.backend.subjects.persistance;

import com.tecnocampus.backend.subjects.domain.Subject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SubjectRepository extends JpaRepository<Subject, Long> {

    Optional<Subject> findByCode(String code);

    Optional<Subject> findByDegreeAndCode(String degree, String code);

    List<Subject> findByDegree(String degree);

    List<Subject> findByDegreeAndCourse(String degree, Integer course);

    List<Subject> findByDegreeAndTrimester(String degree, Integer trimester);

    List<Subject> findByDegreeAndCourseAndTrimester(String degree, Integer course, Integer trimester);
}
