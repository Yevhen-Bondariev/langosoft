using LangoSoft.Api.Services;

namespace LangoSoft.Api.Tests;

/// <summary>
/// Tests for BookImportService parsing logic.
/// Catches the bug where the Gutenberg TOC chapter headings are double-counted,
/// producing ~42 empty chapters instead of ~21 chapters with paragraphs.
/// </summary>
public class BookParsingTests
{
    private const string DorianPattern = @"(?:THE PREFACE|CHAPTER [IVXLC]+\.?)";

    // Mimics the Gutenberg 174-0.txt layout: TOC headings + real chapters below
    private const string SampleGutenbergText = """
        *** START OF THE PROJECT GUTENBERG EBOOK THE PICTURE OF DORIAN GRAY ***

        Contents:
          THE PREFACE
          CHAPTER I.
          CHAPTER II.

        THE PREFACE

        The artist is the creator of beautiful things. To reveal art and
        conceal the artist is art's aim. The critic is he who can translate
        into another manner or a new material his impression of beautiful
        things.

        Those who find ugly meanings in beautiful things are corrupt without
        being charming. This is a fault.

        CHAPTER I.

        The studio was filled with the rich odour of roses, and when the
        light summer wind stirred amidst the trees of the garden there came
        through the open door the heavy scent of the lilac.

        From the corner of the divan of Persian saddle-bags on which he was
        lying, smoking his usual cigarette, Lord Henry Wotton could just
        catch the gleam of the honey-sweet and honey-coloured blossoms.

        CHAPTER II.

        As they left the room, Dorian Gray smiled to himself. Poor Sibyl!
        How absurd it all was! He had been in love with her, he had suffered
        for her, he had given her his soul.

        She had always been a beautiful thing, and now she was dead. It was
        a very interesting experience.

        *** END OF THE PROJECT GUTENBERG EBOOK THE PICTURE OF DORIAN GRAY ***
        """;

    [Fact]
    public void SplitIntoSections_SkipsTOCEntries_ReturnsOnlyContentSections()
    {
        var content = BookImportService.ExtractMainContentPublic(SampleGutenbergText);
        var sections = BookImportService.SplitIntoSections(content, DorianPattern);

        // Should be 3 real content sections (Preface + 2 chapters), NOT 6 (3 TOC + 3 real)
        Assert.Equal(3, sections.Count);
    }

    [Fact]
    public void SplitIntoSections_AllSectionsHaveParagraphs()
    {
        var content = BookImportService.ExtractMainContentPublic(SampleGutenbergText);
        var sections = BookImportService.SplitIntoSections(content, DorianPattern);

        foreach (var (title, body) in sections)
        {
            var paragraphs = BookImportService.SplitParagraphs(body);
            Assert.True(paragraphs.Count > 0, $"Section '{title}' has no paragraphs");
        }
    }

    [Fact]
    public void SplitIntoSections_SectionTitlesAreCorrect()
    {
        var content = BookImportService.ExtractMainContentPublic(SampleGutenbergText);
        var sections = BookImportService.SplitIntoSections(content, DorianPattern);

        Assert.Contains(sections, s => s.Title.Contains("PREFACE", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(sections, s => s.Title.Contains("CHAPTER I", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(sections, s => s.Title.Contains("CHAPTER II", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void SplitIntoSections_NullPattern_ReturnsSingleSection()
    {
        const string essayText = "This is a long essay paragraph with more than ten characters.\n\nAnother paragraph here too.";
        var sections = BookImportService.SplitIntoSections(essayText, null, "My Essay");

        Assert.Single(sections);
        Assert.Equal("My Essay", sections[0].Title);
    }

    [Fact]
    public void SplitParagraphs_FiltersShortAndBannerLines()
    {
        const string body = "\n\n*** some banner ***\n\nShort.\n\nA real paragraph with enough content to matter here.\n\n";
        var result = BookImportService.SplitParagraphs(body);

        Assert.Single(result);
        Assert.Contains("real paragraph", result[0]);
    }

    [Fact]
    public void SplitParagraphs_JoinsWrappedLines()
    {
        const string body = "\n\nFirst line\nsecond line\nthird line.\n\n";
        var result = BookImportService.SplitParagraphs(body);

        Assert.Single(result);
        // Newlines within a paragraph should be replaced by spaces
        Assert.DoesNotContain('\n', result[0]);
    }

    [Fact]
    public void ExtractMainContent_StripsGutenbergHeader()
    {
        var content = BookImportService.ExtractMainContentPublic(SampleGutenbergText);

        Assert.DoesNotContain("*** START OF", content);
        Assert.DoesNotContain("*** END OF", content);
        Assert.Contains("THE PREFACE", content);
    }
}
