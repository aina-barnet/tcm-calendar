package com.tecnocampus.backend.timetables.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Service
public class AcademicCalendarService {

    private static final Logger logger = LoggerFactory.getLogger(AcademicCalendarService.class);
    private static final String RESOURCE_PATH = "Calendario_Academico.txt";

    private volatile String cachedCalendarText;

    public String loadAcademicCalendarText() {
        String cached = cachedCalendarText;
        if (cached != null) {
            return cached;
        }

        synchronized (this) {
            if (cachedCalendarText == null) {
                cachedCalendarText = readCalendarText();
            }
            return cachedCalendarText;
        }
    }

    private String readCalendarText() {
        ClassPathResource resource = new ClassPathResource(RESOURCE_PATH);
        if (!resource.exists()) {
            throw new IllegalStateException("No s'ha trobat el calendari acadèmic a resources");
        }

        try (InputStream inputStream = resource.getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            logger.error("Error reading academic calendar resource", ex);
            throw new IllegalStateException("No s'ha pogut llegir el calendari acadèmic", ex);
        }
    }
}
