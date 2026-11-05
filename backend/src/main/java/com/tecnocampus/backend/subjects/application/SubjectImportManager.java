package com.tecnocampus.backend.subjects.application;

import com.tecnocampus.backend.shared.DegreeResourceRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SubjectImportManager {

    private static final Logger logger = LoggerFactory.getLogger(SubjectImportManager.class);

    private final SubjectCatalog subjectCatalog;
    private final SubjectExcelImportService subjectExcelImportService;
    private final DegreeResourceRegistry degreeResourceRegistry;

    public SubjectImportManager(SubjectCatalog subjectCatalog,
            SubjectExcelImportService subjectExcelImportService,
            DegreeResourceRegistry degreeResourceRegistry) {
        this.subjectCatalog = subjectCatalog;
        this.subjectExcelImportService = subjectExcelImportService;
        this.degreeResourceRegistry = degreeResourceRegistry;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean importIfResourceAvailable(String degree) {
        try {
            var res = degreeResourceRegistry.getResourcesFor(degree);
            var subjectsResource = res.getPlanResource();
            if (degreeResourceRegistry.resourceExists(subjectsResource)) {
                var importResult = subjectExcelImportService.loadFromResource(subjectsResource, degree);
                if (!importResult.subjects().isEmpty()) {
                    subjectCatalog.saveAll(importResult.subjects());
                    return true;
                }
            }
        } catch (IllegalArgumentException e) {
            // combined degree or unknown -> nothing to import
            return false;
        } catch (Exception e) {
            logger.error("Unexpected error importing subjects for degree {}: {}", degree, e.getMessage(), e);
            return false;
        }
        return false;
    }
}
