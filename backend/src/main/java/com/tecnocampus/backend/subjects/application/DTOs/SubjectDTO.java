package com.tecnocampus.backend.subjects.application.DTOs;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public class SubjectDTO {

    private Long id;

    @NotBlank(message = "El codi de l'assignatura és obligatori")
    private String code;

    @NotBlank(message = "El nom de l'assignatura és obligatori")
    private String name;

    @NotNull(message = "Els ECTS són obligatoris")
    @Positive(message = "Els ECTS han de ser positius")
    private Integer ects;

    @NotNull(message = "El curs és obligatori")
    @Positive(message = "El curs ha de ser positiu")
    private Integer course;

    @NotNull(message = "El semestre és obligatori")
    @Positive(message = "El semestre ha de ser positiu")
    private Integer semester;

    @NotBlank(message = "El tipus d'assignatura és obligatori")
    private String type;

    @NotBlank(message = "El grau és obligatori")
    private String degree;

    // Constructors
    public SubjectDTO() {
    }

    public SubjectDTO(Long id, String code, String name, Integer ects, Integer course, Integer semester, String type, String degree) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.ects = ects;
        this.course = course;
        this.semester = semester;
        this.type = type;
        this.degree = degree;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Integer getEcts() {
        return ects;
    }

    public void setEcts(Integer ects) {
        this.ects = ects;
    }

    public Integer getCourse() {
        return course;
    }

    public void setCourse(Integer course) {
        this.course = course;
    }

    public Integer getSemester() {
        return semester;
    }

    public void setSemester(Integer semester) {
        this.semester = semester;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getDegree() {
        return degree;
    }

    public void setDegree(String degree) {
        this.degree = degree;
    }
}
