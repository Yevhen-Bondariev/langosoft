namespace LangoSoft.Api.Models;

public class ParagraphGlossCache
{
    public int Id { get; set; }
    public int ParagraphId { get; set; }
    public Paragraph Paragraph { get; set; } = null!;
    public string TargetLanguage { get; set; } = "English";
    // JSON object: { "word": "translation", ... }
    public string GlossJson { get; set; } = "{}";
}
