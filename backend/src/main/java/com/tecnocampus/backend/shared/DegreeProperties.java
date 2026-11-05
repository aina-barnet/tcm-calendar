package com.tecnocampus.backend.shared;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
@ConfigurationProperties(prefix = "degrees")
public class DegreeProperties {

    private Map<String, DegreeEntry> mapping = new HashMap<>();

    public Map<String, DegreeEntry> getMapping() {
        return mapping;
    }

    public void setMapping(Map<String, DegreeEntry> mapping) {
        this.mapping = mapping;
    }

    public static class DegreeEntry {
        private String plan;
        private String timetable;

        public String getPlan() {
            return plan;
        }

        public void setPlan(String plan) {
            this.plan = plan;
        }

        public String getTimetable() {
            return timetable;
        }

        public void setTimetable(String timetable) {
            this.timetable = timetable;
        }
    }
}
