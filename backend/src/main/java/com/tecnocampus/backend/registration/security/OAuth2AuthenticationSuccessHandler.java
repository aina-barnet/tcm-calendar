package com.tecnocampus.backend.registration.security;

import com.tecnocampus.backend.registration.application.OAuth2UserService;
import com.tecnocampus.backend.registration.domain.User;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final JwtService jwtService;
    private final OAuth2UserService oAuth2UserService;

    @Value("${app.frontend.url}")
    private String frontendUrl;

    public OAuth2AuthenticationSuccessHandler(JwtService jwtService, OAuth2UserService oAuth2UserService) {
        this.jwtService = jwtService;
        this.oAuth2UserService = oAuth2UserService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException, ServletException {
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();

        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");
        String picture = oAuth2User.getAttribute("picture");

        String targetUrl;
        try {
            // Create or get user from OAuth2 data
            User user = oAuth2UserService.processOAuth2User(email, name, picture);
            // Generate JWT token
            String token = jwtService.generateToken(user);
            // Redirect to frontend with token
            targetUrl = UriComponentsBuilder.fromUriString(frontendUrl + "/login.html")
                    .queryParam("token", token)
                    .queryParam("email", user.getEmail())
                    .queryParam("username", user.getUsername())
                    .queryParam("oauth", "success")
                    .build().toUriString();
        } catch (IllegalArgumentException ex) {
            // Email no vàlid: redirigir amb error
            targetUrl = UriComponentsBuilder.fromUriString(frontendUrl + "/login.html")
                    .queryParam("error", "oauth_failed")
                    .queryParam("message", "Només es permeten correus institucionals @edu.tecnocampus.cat")
                    .build().toUriString();
        }
        getRedirectStrategy().sendRedirect(request, response, targetUrl);
    }
}
