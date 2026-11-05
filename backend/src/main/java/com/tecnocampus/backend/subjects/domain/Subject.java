package com.tecnocampus.backend.subjects.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "subjects", uniqueConstraints = {
        @UniqueConstraint(columnNames = { "degree", "code", "trimester" })
})
public class Subject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private Integer ects;

    @Column(nullable = false)
    private Integer course;

    @Column(nullable = false)
    private Integer trimester;

    @Column(nullable = false)
    private String type; // Obligatòria, Optativa, etc.

    @Column(nullable = false)
    private String degree; // GEI, etc.

    // Constructors
    public Subject() {
    }

    public Subject(String code, String name, Integer ects, Integer course, Integer trimester, String type,
            String degree) {
        this.code = code;
        this.name = name;
        this.ects = ects;
        this.course = course;
        this.trimester = trimester;
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

    public Integer getTrimester() {
        return trimester;
    }

    public void setTrimester(Integer trimester) {
        this.trimester = trimester;
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
