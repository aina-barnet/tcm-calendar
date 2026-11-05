package com.tecnocampus.backend.subjects.api;

import com.tecnocampus.backend.subjects.application.DTOs.SubjectDTO;
import com.tecnocampus.backend.subjects.application.SubjectQueryService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/subjects")
public class SubjectController {

    private final SubjectQueryService subjectQueryService;

    public SubjectController(SubjectQueryService subjectQueryService) {
        this.subjectQueryService = subjectQueryService;
    }

    @GetMapping
    @ResponseStatus(HttpStatus.OK)
    public List<SubjectDTO> getAllSubjects() {
        return subjectQueryService.getAllSubjects();
    }

    @GetMapping("/test")
    @ResponseStatus(HttpStatus.OK)
    public String testEndpoint() {
        long count = subjectQueryService.getAllSubjects().size();
        return "SubjectController esta funcionant! Assignatures a la BD: " + count;
    }

    @GetMapping("/{code}")
    @ResponseStatus(HttpStatus.OK)
    public String getSubjectNameByCode(@PathVariable String code) {
        return subjectQueryService.getSubjectByCode(code).getName().toUpperCase();
    }

    @GetMapping("/detail/{code}")
    @ResponseStatus(HttpStatus.OK)
    public SubjectDTO getSubjectByCode(@PathVariable String code) {
        return subjectQueryService.getSubjectByCode(code);
    }

    @GetMapping("/degree/{degree}")
    @ResponseStatus(HttpStatus.OK)
    public List<SubjectDTO> getSubjectsByDegree(@PathVariable String degree) {
        return subjectQueryService.getSubjectsByDegree(degree);
    }

    @GetMapping("/degree/{degree}/course/{course}")
    @ResponseStatus(HttpStatus.OK)
    public List<SubjectDTO> getSubjectsByDegreeAndCourse(
            @PathVariable String degree,
            @PathVariable Integer course) {
        return subjectQueryService.getSubjectsByDegreeAndCourse(degree, course);
    }

    @GetMapping("/degree/{degree}/semester/{semester}")
    @ResponseStatus(HttpStatus.OK)
    public List<SubjectDTO> getSubjectsByDegreeAndSemester(
            @PathVariable String degree,
            @PathVariable Integer semester) {
        return subjectQueryService.getSubjectsByDegreeAndSemester(degree, semester);
    }

    @GetMapping("/degree/{degree}/course/{course}/semester/{semester}")
    @ResponseStatus(HttpStatus.OK)
    public List<SubjectDTO> getSubjectsByDegreeAndCourseAndSemester(
            @PathVariable String degree,
            @PathVariable Integer course,
            @PathVariable Integer semester) {
        return subjectQueryService.getSubjectsByDegreeAndCourseAndSemester(degree, course, semester);
    }
}
