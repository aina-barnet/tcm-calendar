package com.tecnocampus.backend.timetables.api;

import com.tecnocampus.backend.timetables.api.dto.TimetableGenerationRequest;
import com.tecnocampus.backend.timetables.api.dto.TimetableResponse;
import com.tecnocampus.backend.timetables.application.TimetableGenerationService;
import com.tecnocampus.backend.timetables.application.dto.TimetableGenerationResult;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/timetables")
public class TimetableController {

    private static final Logger logger = LoggerFactory.getLogger(TimetableController.class);

    private final TimetableGenerationService timetableGenerationService;

    public TimetableController(TimetableGenerationService timetableGenerationService) {
        this.timetableGenerationService = timetableGenerationService;
    }

    @PostMapping("/generate")
    @ResponseStatus(HttpStatus.OK)
    public TimetableResponse generate(@Valid @RequestBody TimetableGenerationRequest request) {
        logger.info("Generation request received for degree {} with {} subjects: {}", request.degreeKey(),
                request.subjectCodes().size(), request.subjectCodes());
        logger.debug("Trimester: {}, MaxResults: {}, Preferences: {}",
                request.trimester(),
                request.resolvedMaxResults(),
                request.toPreferences());

        try {
            TimetableGenerationResult result = timetableGenerationService.generateDetailed(
                    request.subjectCodes(),
                    request.resolvedMaxResults(),
                    request.trimester(),
                    request.toPreferences(),
                    request.degreeKey());

            logger.info("Generation completed successfully with {} options", result.options().size());
            return new TimetableResponse(result.options(), result.options().size(), result.error());
        } catch (Exception ex) {
            logger.error("Error during timetable generation", ex);
            return TimetableResponse.emptyWithError(ex.getMessage());
        }
    }

    @PostMapping("/cache/invalidate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void invalidateCache() {
        timetableGenerationService.invalidateImportedEntriesCache();
        logger.info("Timetable cache invalidated via API");
    }
}
