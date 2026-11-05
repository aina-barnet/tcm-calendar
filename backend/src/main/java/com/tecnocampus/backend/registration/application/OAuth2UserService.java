package com.tecnocampus.backend.registration.application;

import com.tecnocampus.backend.registration.domain.User;
import com.tecnocampus.backend.registration.domain.UserProfile;
import com.tecnocampus.backend.registration.persistance.ProfileRepository;
import com.tecnocampus.backend.registration.persistance.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class OAuth2UserService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;

    public OAuth2UserService(UserRepository userRepository,
            ProfileRepository profileRepository,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Process OAuth2 user login/registration.
     * If user exists, return existing user. If not, create a new user.
     */
    @Transactional
    public User processOAuth2User(String email, String name, String picture) {
        if (email == null || !email.endsWith("@edu.tecnocampus.cat")) {
            throw new IllegalArgumentException("Accés restringit: només emails @edu.tecnocampus.cat");
        }
        return userRepository.findByEmail(email)
                .orElseGet(() -> createNewOAuth2User(email, name, picture));
    }

    private User createNewOAuth2User(String email, String name, String picture) {
        // Create new user from OAuth2 data
        String baseUsername = email.split("@")[0];
        String username = baseUsername;

        // Handle duplicate username by appending a number
        int counter = 1;
        while (userRepository.existsByUsername(username)) {
            username = baseUsername + counter;
            counter++;
        }

        // Generate a random password for OAuth2 users (they won't use it)
        String randomPassword = UUID.randomUUID().toString();

        User newUser = new User(
                username,
                email,
                passwordEncoder.encode(randomPassword));
        newUser = userRepository.save(newUser);

        // Create profile for OAuth2 user
        UserProfile profile = new UserProfile();
        profile.setUsername(newUser.getUsername());
        if (name != null && !name.isEmpty()) {
            String[] nameParts = name.split(" ", 2);
            profile.setFirstName(nameParts[0]);
            if (nameParts.length > 1) {
                profile.setLastNames(nameParts[1]);
            }
        }
        profileRepository.save(profile);

        return newUser;
    }
}
