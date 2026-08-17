namespace LangoSoft.Api.Models;
public class Book
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Author { get; set; } = "";
    public List<Chapter> Chapters { get; set; } = [];
}
