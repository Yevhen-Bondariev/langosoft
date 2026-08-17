namespace LangoSoft.Api.Models;
public class ReadingProgress
{
    public int Id { get; set; }
    public int BookId { get; set; }
    public int ChapterNumber { get; set; }
    public int ParagraphIndex { get; set; }
    public int WordIndex { get; set; }
    public DateTime LastRead { get; set; } = DateTime.UtcNow;
}
