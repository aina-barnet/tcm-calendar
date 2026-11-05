package com.tecnocampus.backend.shared;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class DegreeResourceRegistry {

    // Official degree keys
    public static final String GEEIA = "GEEIA";
    public static final String GEIGSI = "GEIGSI";
    public static final String GEM = "GEM";
    public static final String GEIGDP = "GEIGDP";
    public static final String GEOI = "GEOI";
    public static final String GEEIA_PLUS_GEM = "GEEIA+GEM";
    public static final String GEEIA_PLUS_GEIGSI = "GEEIA+GEIGSI";

    // file code mapping for degrees that have Excel files
    private static final java.util.Map<String, String> FILE_CODE_MAP = new LinkedHashMap<>();
    static {
        FILE_CODE_MAP.put(GEEIA, "GEEIA");
        FILE_CODE_MAP.put(GEIGSI, "GEIGSI");
        FILE_CODE_MAP.put(GEM, "GEM");
        FILE_CODE_MAP.put(GEOI, "GEOI");
        FILE_CODE_MAP.put(GEIGDP, "GEIGDP");
    }

    // Composite degrees reuse base-degree Excel files and do not have direct
    // resources.
    private static final Map<String, List<String>> COMPOSITE_DEGREE_MAP;
    static {
        Map<String, List<String>> m = new LinkedHashMap<>();
        m.put(GEEIA_PLUS_GEM, List.of(GEEIA, GEM));
        m.put(GEEIA_PLUS_GEIGSI, List.of(GEEIA, GEIGSI));
        COMPOSITE_DEGREE_MAP = Collections.unmodifiableMap(m);
    }

    private final Map<String, DegreeResources> registry;
    private final String defaultDegree;

    public DegreeResourceRegistry() {
        // fallback default used when instantiated manually (tests)
        Map<String, DegreeResources> m = new LinkedHashMap<>();
        // Use convention-based filenames for supported file-backed degrees
        FILE_CODE_MAP.forEach((degreeKey, fileCode) -> m.put(degreeKey,
                new DegreeResources("Plan_Estudios_" + fileCode + ".xlsx", fileCode + "_Horarios.xlsx")));
        this.registry = Collections.unmodifiableMap(m);
        this.defaultDegree = GEIGSI;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public DegreeResourceRegistry(DegreeProperties degreeProperties) {
        Map<String, DegreeResources> m = new LinkedHashMap<>();
        if (degreeProperties != null && degreeProperties.getMapping() != null
                && !degreeProperties.getMapping().isEmpty()) {
            degreeProperties.getMapping().forEach((k, v) -> {
                if (v != null) {
                    m.put(k, new DegreeResources(v.getPlan(), v.getTimetable()));
                }
            });
        }
        if (m.isEmpty()) {
            // fallback to convention-based resolver for supported degrees
            FILE_CODE_MAP.forEach((degreeKey, fileCode) -> m.put(degreeKey,
                    new DegreeResources("Plan_Estudios_" + fileCode + ".xlsx", fileCode + "_Horarios.xlsx")));
        }

        this.registry = Collections.unmodifiableMap(m);
        this.defaultDegree = registry.containsKey(GEIGSI) ? GEIGSI : registry.keySet().iterator().next();
    }

    public String getDefaultDegree() {
        return defaultDegree;
    }

    public List<String> getSupportedDegrees() {
        return List.copyOf(registry.keySet());
    }

    public List<String> getAllKnownDegrees() {
        List<String> all = new java.util.ArrayList<>(registry.keySet());
        all.addAll(COMPOSITE_DEGREE_MAP.keySet());
        return List.copyOf(all);
    }

    public boolean isComposite(String degreeKey) {
        return degreeKey != null && COMPOSITE_DEGREE_MAP.containsKey(degreeKey);
    }

    public List<String> getBaseDegrees(String degreeKey) {
        List<String> baseDegrees = COMPOSITE_DEGREE_MAP.get(degreeKey);
        if (baseDegrees == null) {
            throw new IllegalArgumentException("Degree is not composite: " + degreeKey);
        }
        return baseDegrees;
    }

    public DegreeResources getResourcesFor(String degreeKey) {
        if (degreeKey == null) {
            throw new IllegalArgumentException("Degree key is null");
        }
        DegreeResources res = registry.get(degreeKey);
        if (res != null)
            return res;

        if (isComposite(degreeKey)) {
            throw new IllegalArgumentException("Composite degree has no direct Excel resources: " + degreeKey);
        }

        // Unknown degree key
        throw new IllegalArgumentException("Unknown degree key: " + degreeKey);
    }

    public boolean resourceExists(String resourcePath) {
        if (resourcePath == null)
            return false;
        return new ClassPathResource(resourcePath).exists();
    }

    public static final class DegreeResources {
        private final String planResource;
        private final String timetableResource;

        public DegreeResources(String planResource, String timetableResource) {
            this.planResource = planResource;
            this.timetableResource = timetableResource;
        }

        public String getPlanResource() {
            return planResource;
        }

        public String getTimetableResource() {
            return timetableResource;
        }
    }
}
