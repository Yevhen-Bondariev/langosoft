namespace LangoSoft.Api.Models;

public class FlashcardCategory
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsDefault { get; set; }
    public string Color { get; set; } = "#6366f1";
}
