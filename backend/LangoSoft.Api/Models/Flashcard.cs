namespace LangoSoft.Api.Models;
public class Flashcard
{
    public int Id { get; set; }
    public string Word { get; set; } = "";
    public string Context { get; set; } = "";
    public string Translation { get; set; } = "";
    public string Synonym { get; set; } = "";
    public int BookId { get; set; }
    public int ChapterNumber { get; set; }
    public int ParagraphIndex { get; set; }
    public int Interval { get; set; } = 1;
    public float EaseFactor { get; set; } = 2.5f;
    public int Repetitions { get; set; } = 0;
    public DateTime NextReview { get; set; } = DateTime.UtcNow;
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}
