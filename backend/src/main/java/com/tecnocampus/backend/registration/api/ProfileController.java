package com.tecnocampus.backend.registration.api;

import com.tecnocampus.backend.registration.application.DTOs.ProfileDTO;
import com.tecnocampus.backend.registration.application.ProfileService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping("/{username}")
    @ResponseStatus(HttpStatus.OK)
    public ProfileDTO getUserProfile(@Valid @PathVariable String username) {
        return profileService.getUserProfile(username);
    }

    @PutMapping("/{username}")
    @ResponseStatus(HttpStatus.OK)
    public ProfileDTO updateUserProfile(@Valid @PathVariable String username,
            @Valid @RequestBody ProfileDTO profileDTO) {
        return profileService.updateUserProfile(username, profileDTO);
    }
}