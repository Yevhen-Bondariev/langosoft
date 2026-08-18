namespace LangoSoft.Api.Models;

public class ParagraphArchaismCache
{
    public int Id { get; set; }
    public int ParagraphId { get; set; }
    public Paragraph Paragraph { get; set; } = null!;
    // JSON object: { "word": "explanation", ... }  Empty object = analyzed, no archaisms found.
    public string ArchaismsJson { get; set; } = "{}";
}
