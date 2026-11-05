package com.tecnocampus.backend.timetables.api;

import com.tecnocampus.backend.timetables.api.dto.TimetableResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = TimetableController.class)
public class TimetableControllerAdvice {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.OK)
    public TimetableResponse handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getAllErrors().stream()
                .findFirst()
                .map(error -> error.getDefaultMessage() == null ? "Request invalid" : error.getDefaultMessage())
                .orElse("Request invalid");

        return TimetableResponse.emptyWithError(message);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.OK)
    public TimetableResponse handleMalformedBody() {
        return TimetableResponse.emptyWithError("El cos de la peticio no te un format valid");
    }
}

