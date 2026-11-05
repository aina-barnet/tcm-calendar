package com.tecnocampus.backend.registration.application;

import com.tecnocampus.backend.registration.application.DTOs.ProfileDTO;
import com.tecnocampus.backend.registration.domain.UserProfile;
import com.tecnocampus.backend.exceptions.InvalidFormatException;
import com.tecnocampus.backend.exceptions.UserNotFoundException;
import com.tecnocampus.backend.registration.persistance.ProfileRepository;
import com.tecnocampus.backend.registration.persistance.UserRepository;
import jakarta.validation.Valid;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProfileService {

    private final UserRepository userRepository;

    private final ProfileRepository profileRepository;

    public ProfileService(UserRepository userRepository, ProfileRepository profileRepository) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
    }

    public ProfileDTO getUserProfile(@Valid String username) {
        UserProfile userProfile = profileRepository.findById(username)
                .orElseThrow(() -> new UserNotFoundException("User profile not found for username: " + username));

        return toDto(userProfile);
    }

    public ProfileDTO updateUserProfile(@Valid String username, @Valid ProfileDTO profileDTO) {
        // Find existing profile or create a new one (upsert)
        UserProfile userProfile = profileRepository.findById(username)
                .orElseGet(() -> {
                    UserProfile newProfile = new UserProfile();
                    newProfile.setUsername(username);
                    return newProfile;
                });

        if (profileDTO.firstName() != null) {
            userProfile.setFirstName(profileDTO.firstName());
        }
        if (profileDTO.lastNames() != null) {
            userProfile.setLastNames(profileDTO.lastNames());
        }
        if (profileDTO.degree() != null) {
            userProfile.setDegree(profileDTO.degree());
        }
        if (profileDTO.academicYear() != null) {
            if (profileDTO.academicYear() < 1 || profileDTO.academicYear() > 6) {
                throw new InvalidFormatException("Academic year must be between 1 and 6");
            }
            userProfile.setAcademicYear(profileDTO.academicYear());
        }
        if (profileDTO.avatar() != null) {
            userProfile.setAvatar(profileDTO.avatar());
        }
        if (profileDTO.optimization() != null) {
            userProfile.setOptimization(profileDTO.optimization());
        }
        if (profileDTO.selectedSubjects() != null) {
            userProfile.setSelectedSubjects(String.join(",", profileDTO.selectedSubjects()));
        }

        profileRepository.save(userProfile);

        return toDto(userProfile);
    }

    private ProfileDTO toDto(UserProfile userProfile) {
        return new ProfileDTO(
                userProfile.getUsername(),
                userProfile.getFirstName(),
                userProfile.getLastNames(),
                userProfile.getDegree(),
                userProfile.getAcademicYear(),
                userProfile.getAvatar(),
                userProfile.getOptimization(),
                parseSelectedSubjects(userProfile.getSelectedSubjects()));
    }

    private List<String> parseSelectedSubjects(String selectedSubjectsCsv) {
        if (selectedSubjectsCsv == null || selectedSubjectsCsv.isBlank()) {
            return Collections.emptyList();
        }

        return Arrays.stream(selectedSubjectsCsv.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toList());
    }
}