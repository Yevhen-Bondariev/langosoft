using LangoSoft.Api.Services;
using System.Text.RegularExpressions;

namespace LangoSoft.Api.Tests;

/// <summary>
/// Unit tests for Shakespeare play parsing.
///
/// Gutenberg plays have two "act lists":
///   1. An inline TOC that uses mixed-case "Scene" with leading spaces.
///   2. The actual body that uses all-caps "SCENE" (SCENE I at col 0, SCENE II+ with 1 space).
///
/// The pattern ^ACT [IVX]+|^ ?SCENE [IVX]+ with case-sensitive Multiline should match
/// only the body headings — not the TOC — because the case differs.
/// </summary>
public class ShakespeareParsingTests
{
    private const string ShakespearePattern = @"^ACT [IVX]+|^ ?SCENE [IVX]+";
    private static readonly RegexOptions ShakespeareOptions = RegexOptions.Multiline; // case-sensitive!

    // Mirrors the real Gutenberg layout:
    //   - Inline TOC uses " ACT I" (1 leading space) and "Scene" (mixed case) → NOT matched
    //   - Body uses "ACT I" (col 0) and "SCENE I" (all caps) → matched
    private const string SamplePlayText = """
        *** START OF THE PROJECT GUTENBERG EBOOK HAMLET ***

         ACT I
         Scene I. A platform.
         Scene II. A room in the Castle.

         ACT II
         Scene I. A room.

        ACT I

        SCENE I. A platform.

        HORATIO: What has this thing appeared again tonight? It appeared.

        BARNARDO: I have seen nothing at all tonight here sir.

         SCENE II. A room in the Castle.

        POLONIUS: Give him this money and these notes, Reynaldo old friend.

        REYNALDO: Well, my lord. Long enough text to pass the paragraph filter.

        ACT II

        SCENE I. A room in Polonius's house, yes indeed here.

        POLONIUS: More text here for enough paragraphs to exist in this.

        REYNALDO: Well, my lord, as you told me to do here yes.

        *** END OF THE PROJECT GUTENBERG EBOOK HAMLET ***
        """;

    [Fact]
    public void Shakespeare_DoesNotMatchTOCScenes()
    {
        var content = BookImportService.ExtractMainContentPublic(SamplePlayText);
        var allSections = BookImportService.SplitIntoSections(content, ShakespearePattern, "", ShakespeareOptions);

        // TOC "Scene I" (mixed case) must NOT produce a section title
        Assert.DoesNotContain(allSections, s => s.Title.Equals("Scene I", StringComparison.Ordinal));
        Assert.DoesNotContain(allSections, s => s.Title.Equals("Scene II", StringComparison.Ordinal));
    }

    [Fact]
    public void Shakespeare_MatchesBodyScenesOnly()
    {
        var content = BookImportService.ExtractMainContentPublic(SamplePlayText);
        var allSections = BookImportService.SplitIntoSections(content, ShakespearePattern, "", ShakespeareOptions);
        var withParas = allSections.Where(s => BookImportService.SplitParagraphs(s.Body).Count > 0).ToList();

        // 3 content sections: Act I Scene I, Act I Scene II, Act II Scene I
        Assert.Equal(3, withParas.Count);
    }

    [Fact]
    public void Shakespeare_AllContentSectionsHaveParagraphs()
    {
        var content = BookImportService.ExtractMainContentPublic(SamplePlayText);
        var sections = BookImportService.SplitIntoSections(content, ShakespearePattern, "", ShakespeareOptions);

        foreach (var (title, body) in sections)
        {
            var paras = BookImportService.SplitParagraphs(body);
            // Act-only headers will have 0 paragraphs and are expected to be filtered out
            // by the caller — just verify that none sneak through with garbage content
            if (paras.Count > 0)
                Assert.All(paras, p => Assert.True(p.Length > 10, $"Short paragraph in '{title}': '{p}'"));
        }
    }

    [Fact]
    public void CombineActAndSceneTitles_PrefixesCorrectly()
    {
        var sections = new List<(string Title, string Body)>
        {
            ("ACT I", ""),             // act header — no body
            ("SCENE I", "content one two three words long enough"),
            ("SCENE II", "content here also enough words here for sure"),
            ("ACT II", ""),            // act header
            ("SCENE I", "content of act two scene one long text"),
        };

        var result = BookImportService.CombineActAndSceneTitles(sections);

        Assert.Equal(5, result.Count);
        Assert.Equal("ACT I", result[0].Title);
        Assert.Equal("ACT I · SCENE I", result[1].Title);
        Assert.Equal("ACT I · SCENE II", result[2].Title);
        Assert.Equal("ACT II", result[3].Title);
        Assert.Equal("ACT II · SCENE I", result[4].Title);
    }

    [Fact]
    public void CombineActAndSceneTitles_ActSectionsHaveNoParas_GetFiltered()
    {
        var sections = new List<(string Title, string Body)>
        {
            ("ACT I", ""),
            ("SCENE I", "HORATIO: Good night, sweet prince. Long enough text here yes."),
        };

        var combined = BookImportService.CombineActAndSceneTitles(sections);
        // After combining, filter the way ImportBookAsync does
        var kept = combined.Where(s => BookImportService.SplitParagraphs(s.Body).Count > 0).ToList();

        Assert.Single(kept);
        Assert.Equal("ACT I · SCENE I", kept[0].Title);
    }
}
