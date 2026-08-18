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
    public DbSet<ParagraphArchaismCache> ParagraphArchaismCaches => Set<ParagraphArchaismCache>();
    public DbSet<ParagraphGlossCache> ParagraphGlossCaches => Set<ParagraphGlossCache>();
    public DbSet<FlashcardCategory> FlashcardCategories => Set<FlashcardCategory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ReadingProgress>()
            .HasIndex(p => p.BookId)
            .IsUnique();
        modelBuilder.Entity<Paragraph>()
            .HasIndex(p => new { p.ChapterId, p.Index });
        modelBuilder.Entity<Chapter>()
            .HasIndex(c => new { c.BookId, c.Number });
        modelBuilder.Entity<ParagraphArchaismCache>()
            .HasIndex(a => a.ParagraphId)
            .IsUnique();
        modelBuilder.Entity<ParagraphGlossCache>()
            .HasIndex(g => new { g.ParagraphId, g.TargetLanguage })
            .IsUnique();
    }
}
