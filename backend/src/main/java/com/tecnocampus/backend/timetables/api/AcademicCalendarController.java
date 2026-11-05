package com.tecnocampus.backend.timetables.api;

import com.tecnocampus.backend.timetables.application.AcademicCalendarService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/timetables")
public class AcademicCalendarController {

    private final AcademicCalendarService academicCalendarService;

    public AcademicCalendarController(AcademicCalendarService academicCalendarService) {
        this.academicCalendarService = academicCalendarService;
    }

    @GetMapping(value = "/academic-calendar", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> getAcademicCalendar() {
        return ResponseEntity.ok(academicCalendarService.loadAcademicCalendarText());
    }
}
