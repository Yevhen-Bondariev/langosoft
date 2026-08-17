import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reader from './Reader';
import type { Book, Chapter, Paragraph } from '../types';
import type { LanguageOption } from '../hooks/useLanguagePreference';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/api', () => ({
  api: {
    books: {
      paragraphs: vi.fn(),
    },
    progress: {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue({}),
    },
    words: {
      translate: vi.fn().mockResolvedValue({ translation: 'тест', synonym: 'test' }),
      translateParagraph: vi.fn().mockResolvedValue({ translation: 'Троянди були червоні. Бузок був фіолетовий.' }),
    },
    grammar: {
      analyze: vi.fn().mockResolvedValue({ tenses: [] }),
    },
  },
}));

vi.mock('../hooks/useTTS', () => ({
  useTTS: () => ({
    speak: vi.fn(),
    speakChain: vi.fn(),
    stop: vi.fn(),
  }),
}));

// jsdom doesn't implement SpeechSynthesis
Object.defineProperty(window, 'speechSynthesis', {
  value: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] },
  writable: true,
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BOOK: Book = { id: 1, title: 'Dorian Gray', author: 'Wilde', chapterCount: 20 };

const CHAPTERS: Chapter[] = [
  { id: 1, bookId: 1, number: 0, title: 'Chapter I', paragraphCount: 3 },
];

const PARAGRAPHS: Paragraph[] = [
  { id: 1, chapterId: 1, index: 0, text: 'The roses were red. The lilacs were purple.' },
  { id: 2, chapterId: 1, index: 1, text: 'A second paragraph with more words in it.' },
];

const LANG: LanguageOption = { code: 'uk', label: 'Українська', name: 'Ukrainian' };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function renderReader() {
  const { api } = await import('../services/api');
  (api.books.paragraphs as ReturnType<typeof vi.fn>).mockResolvedValue(PARAGRAPHS);

  render(
    <Reader
      book={BOOK}
      chapters={CHAPTERS}
      chapterNum={0}
      onChapterChange={vi.fn()}
      onFlashcardsChange={vi.fn()}
      showPhonemeHints={false}
      selectedVoice={null}
      selectedLang={LANG}
      ttsRate={1}
    />
  );

  // Wait for paragraphs to load — the loading spinner disappears
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull(), { timeout: 3000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Reader — r key opens recall modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the recall modal when r is pressed after paragraphs load', async () => {
    const user = userEvent.setup();
    await renderReader();

    // Confirm paragraphs rendered — words are split into individual spans so check one word
    expect(screen.getAllByText('roses').length).toBeGreaterThan(0);

    // Press r
    await user.keyboard('r');

    // Modal should appear
    expect(screen.getByRole('dialog', { name: /recall practice/i })).toBeTruthy();
  });

  it('does NOT open the modal when paragraphs have not loaded', async () => {
    const { api } = await import('../services/api');
    // Make paragraphs never resolve during this test
    (api.books.paragraphs as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <Reader
        book={BOOK}
        chapters={CHAPTERS}
        chapterNum={0}
        onChapterChange={vi.fn()}
        onFlashcardsChange={vi.fn()}
        showPhonemeHints={false}
        selectedVoice={null}
        selectedLang={LANG}
        ttsRate={1}
      />
    );

    // Still loading — press r
    await user.keyboard('r');

    expect(screen.queryByRole('dialog', { name: /recall practice/i })).toBeNull();
  });

  it('shows the status message when r is pressed before paragraphs load', async () => {
    const { api } = await import('../services/api');
    (api.books.paragraphs as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <Reader
        book={BOOK}
        chapters={CHAPTERS}
        chapterNum={0}
        onChapterChange={vi.fn()}
        onFlashcardsChange={vi.fn()}
        showPhonemeHints={false}
        selectedVoice={null}
        selectedLang={LANG}
        ttsRate={1}
      />
    );

    await user.keyboard('r');

    expect(screen.getByText(/No paragraph loaded/i)).toBeTruthy();
  });

  it('modal shows the correct sentence from the first paragraph', async () => {
    const user = userEvent.setup();
    await renderReader();

    await user.keyboard('r');

    // The recall modal should display the sentence at word index 0 — first sentence
    expect(screen.getByText(/The roses were red/i)).toBeTruthy();
  });

  it('closes the recall modal on Escape', async () => {
    const user = userEvent.setup();
    await renderReader();

    await user.keyboard('r');
    expect(screen.getByRole('dialog', { name: /recall practice/i })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /recall practice/i })).toBeNull();
  });
});
