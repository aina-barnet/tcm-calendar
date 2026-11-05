package com.tecnocampus.backend.registration.persistance;

import com.tecnocampus.backend.registration.domain.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProfileRepository extends JpaRepository<UserProfile, String> {
}
