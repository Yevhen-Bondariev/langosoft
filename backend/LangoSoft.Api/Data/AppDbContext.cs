using LangoSoft.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<Paragraph> Paragraphs => Set<Paragraph>();
    public DbSet<Flashcard> Flashcards => Set<Flashcard>();
    public DbSet<ReadingProgress> ReadingProgresses => Set<ReadingProgress>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ReadingProgress>()
            .HasIndex(p => p.BookId)
            .IsUnique();
        modelBuilder.Entity<Paragraph>()
            .HasIndex(p => new { p.ChapterId, p.Index });
        modelBuilder.Entity<Chapter>()
            .HasIndex(c => new { c.BookId, c.Number });
    }
}
