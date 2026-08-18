namespace LangoSoft.Api.Models;
public class Book
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Author { get; set; } = "";
    public string Language { get; set; } = "en"; // BCP-47 code of the book's own language
    public List<Chapter> Chapters { get; set; } = [];
}
