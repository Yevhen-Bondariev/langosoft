namespace LangoSoft.Api.DTOs;

public record BookDto(int Id, string Title, string Author, int ChapterCount);
public record ChapterDto(int Id, int BookId, int Number, string Title, int ParagraphCount);
public record ParagraphDto(int Id, int ChapterId, int Index, string Text);
public record ProgressDto(int BookId, int ChapterNumber, int ParagraphIndex, int WordIndex, DateTime LastRead);
public record FlashcardDto(int Id, string Word, string Context, string Translation, string Synonym, int BookId, int ChapterNumber, int ParagraphIndex, int Interval, float EaseFactor, int Repetitions, DateTime NextReview, DateTime AddedAt);
public record CreateFlashcardDto(string Word, string Context, string? Translation, string? Synonym, int BookId, int ChapterNumber, int ParagraphIndex);
public record UpdateFlashcardDto(string? Translation, string? Synonym);
public record ReviewDto(bool Correct);
public record SaveProgressDto(int ChapterNumber, int ParagraphIndex, int WordIndex);
