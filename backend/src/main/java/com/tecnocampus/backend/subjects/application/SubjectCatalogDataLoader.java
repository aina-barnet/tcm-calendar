package com.tecnocampus.backend.subjects.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class SubjectCatalogDataLoader implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(SubjectCatalogDataLoader.class);
    private final SubjectCatalog subjectCatalog;
    private final SubjectExcelImportService subjectExcelImportService;
    private final com.tecnocampus.backend.shared.DegreeResourceRegistry degreeResourceRegistry;

    public SubjectCatalogDataLoader(SubjectCatalog subjectCatalog,
            SubjectExcelImportService subjectExcelImportService,
            com.tecnocampus.backend.shared.DegreeResourceRegistry degreeResourceRegistry) {
        this.subjectCatalog = subjectCatalog;
        this.subjectExcelImportService = subjectExcelImportService;
        this.degreeResourceRegistry = degreeResourceRegistry == null
                ? new com.tecnocampus.backend.shared.DegreeResourceRegistry()
                : degreeResourceRegistry;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (subjectCatalog.count() > 0) {
            logger.info("Subject catalog already initialized. Subjects in DB: {}", subjectCatalog.count());
            return;
        }

        for (String degreeKey : degreeResourceRegistry.getAllKnownDegrees()) {
            try {
                if (degreeResourceRegistry.isComposite(degreeKey)) {
                    logger.info("Degree {} is composite, skipping direct import.", degreeKey);
                    continue;
                }

                com.tecnocampus.backend.shared.DegreeResourceRegistry.DegreeResources res = degreeResourceRegistry
                        .getResourcesFor(degreeKey);
                String subjectsResource = res.getPlanResource();

                if (!degreeResourceRegistry.resourceExists(subjectsResource)) {
                    logger.warn("Subjects resource for degree {} not found: {}. Skipping.", degreeKey,
                            subjectsResource);
                    continue;
                }

                SubjectImportResult importResult = subjectExcelImportService.loadFromResource(subjectsResource,
                        degreeKey);
                if (importResult.subjects().isEmpty()) {
                    logger.warn("No subjects imported from {} for degree {}. Check resource format.", subjectsResource,
                            degreeKey);
                    continue;
                }

                subjectCatalog.saveAll(importResult.subjects());
                logger.info("Imported {} subjects for degree {} from {} (sheets={}, rowsRead={}, duplicates={})",
                        importResult.subjects().size(),
                        degreeKey,
                        subjectsResource,
                        importResult.totalSheets(),
                        importResult.totalRowsRead(),
                        importResult.duplicatesByCode());

            } catch (Exception e) {
                logger.warn("Could not import subjects for degree {}: {}. Skipping.", degreeKey, e.getMessage());
            }
        }
    }
}
