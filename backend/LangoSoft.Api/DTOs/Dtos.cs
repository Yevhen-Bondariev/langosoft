namespace LangoSoft.Api.DTOs;

public record BookDto(int Id, string Title, string Author, string Language, int ChapterCount);
public record ChapterDto(int Id, int BookId, int Number, string Title, int ParagraphCount);
public record ParagraphDto(int Id, int ChapterId, int Index, string Text);
public record ProgressDto(int BookId, int ChapterNumber, int ParagraphIndex, int WordIndex, DateTime LastRead);
public record CategoryDto(int Id, string Name, bool IsDefault, string Color);
public record CreateCategoryDto(string Name, string Color = "#6366f1");
public record FlashcardDto(int Id, string Word, string Context, string Translation, string Synonym, int BookId, int ChapterNumber, int ParagraphIndex, int Interval, float EaseFactor, int Repetitions, DateTime NextReview, DateTime AddedAt, int? CategoryId, string? CategoryName, string? CategoryColor);
public record CreateFlashcardDto(string Word, string Context, string? Translation, string? Synonym, int BookId, int ChapterNumber, int ParagraphIndex, int? CategoryId = null);
public record UpdateFlashcardDto(string? Translation, string? Synonym, int? CategoryId = null);
public record ReviewDto(bool Correct);
public record SaveProgressDto(int ChapterNumber, int ParagraphIndex, int WordIndex);
public record ChapterStatDto(int BookId, string BookTitle, int ChapterNumber, string ChapterTitle, int Count);
