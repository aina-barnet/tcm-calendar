package com.tecnocampus.backend.timetables.api.dto;

import java.util.List;

public record TimetableResponse(List<TimetableOptionDTO> options, int totalOptions, String error) {

	public TimetableResponse(List<TimetableOptionDTO> options, int totalOptions) {
		this(options, totalOptions, null);
	}

	public static TimetableResponse emptyWithError(String error) {
		return new TimetableResponse(List.of(), 0, error);
	}
}

