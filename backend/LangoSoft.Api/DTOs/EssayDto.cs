namespace LangoSoft.Api.DTOs;

public record CheckEssayRequestDto(
    string EssayText,
    string ChapterTitle,
    string? ContextText
);

public record CategoryFeedbackDto(
    int Score,
    string[] Issues,
    string Tip
);

public record EssayFeedbackDto(
    int OverallScore,
    Dictionary<string, CategoryFeedbackDto> Categories,
    string[] StrongPoints,
    string[] Recommendations
);
