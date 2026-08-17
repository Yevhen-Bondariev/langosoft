using LangoSoft.Api.Models;

namespace LangoSoft.Api.Services;

public class SpacedRepetitionService
{
    public void ProcessReview(Flashcard card, bool correct)
    {
        int quality = correct ? 5 : 1;

        if (quality < 3)
        {
            card.Repetitions = 0;
            card.Interval = 1;
        }
        else
        {
            card.Interval = card.Repetitions switch
            {
                0 => 1,
                1 => 6,
                _ => (int)Math.Round(card.Interval * card.EaseFactor)
            };
            card.Repetitions++;
            card.EaseFactor = Math.Max(1.3f, card.EaseFactor + 0.1f - (5 - quality) * (0.08f + (5 - quality) * 0.02f));
        }

        card.NextReview = DateTime.UtcNow.AddDays(card.Interval);
    }
}
