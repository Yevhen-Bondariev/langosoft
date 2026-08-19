namespace LangoSoft.Api.Models;
public class Paragraph
{
    public int Id { get; set; }
    public int ChapterId { get; set; }
    public Chapter Chapter { get; set; } = null!;
    public int Index { get; set; }
    public string Text { get; set; } = "";
    public string? LongfellowText { get; set; }
}
