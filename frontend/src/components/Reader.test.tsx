import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reader from './Reader';
import type { Book, Chapter, Paragraph } from '../types';
import type { LanguageOption } from '../hooks/useLanguagePreference';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Module-level so we can inspect calls across tests.
const mockSpeak = vi.fn();

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
      gloss: vi.fn().mockResolvedValue({ gloss: '{}' }),
    },
    grammar: {
      analyze: vi.fn().mockResolvedValue({ tenses: [] }),
    },
    paragraphs: {
      archaisms: vi.fn().mockResolvedValue({ archaisms: '{}' }),
    },
  },
}));

vi.mock('../hooks/useTTS', () => ({
  useTTS: () => ({
    speak: mockSpeak,
    speakChain: vi.fn(),
    stop: vi.fn(),
    isSpeaking: vi.fn().mockReturnValue(false),
  }),
}));

// jsdom doesn't implement SpeechSynthesis
Object.defineProperty(window, 'speechSynthesis', {
  value: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] },
  writable: true,
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BOOK: Book = { id: 1, title: 'Dorian Gray', author: 'Wilde', language: 'en', chapterCount: 20 };

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
      onFlashcardsChange={vi.fn()} categories={[]} onCategoriesChange={vi.fn()}
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

describe('Reader — r key opens recall panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the recall input panel when r is pressed after paragraphs load', async () => {
    const user = userEvent.setup();
    await renderReader();

    // Confirm paragraphs rendered — words are split into individual spans so check one word
    expect(screen.getAllByText('roses').length).toBeGreaterThan(0);

    await user.keyboard('r');

    // Default mode is translation (see original, type translation) — LANG.label = 'Українська'
    expect(screen.getByPlaceholderText('Type the Українська translation…')).toBeTruthy();
  });

  it('does NOT open the recall panel when paragraphs have not loaded', async () => {
    const { api } = await import('../services/api');
    (api.books.paragraphs as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <Reader
        book={BOOK}
        chapters={CHAPTERS}
        chapterNum={0}
        onChapterChange={vi.fn()}
        onFlashcardsChange={vi.fn()} categories={[]} onCategoriesChange={vi.fn()}
        showPhonemeHints={false}
        selectedVoice={null}
        selectedLang={LANG}
        ttsRate={1}
      />
    );

    await user.keyboard('r');

    expect(screen.queryByPlaceholderText('Type the Українська translation…')).toBeNull();
  });

  it('does not enter recall mode when r is pressed while still loading', async () => {
    const { api } = await import('../services/api');
    (api.books.paragraphs as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <Reader
        book={BOOK}
        chapters={CHAPTERS}
        chapterNum={0}
        onChapterChange={vi.fn()}
        onFlashcardsChange={vi.fn()} categories={[]} onCategoriesChange={vi.fn()}
        showPhonemeHints={false}
        selectedVoice={null}
        selectedLang={LANG}
        ttsRate={1}
      />
    );

    await user.keyboard('r');

    // enterRecall() bails out silently when paragraphs are empty — no panel, no status
    expect(screen.queryByPlaceholderText('Type the Українська translation…')).toBeNull();
  });

  it('recall panel opens when r is pressed on a loaded paragraph', async () => {
    const user = userEvent.setup();
    await renderReader();

    await user.keyboard('r');

    // Panel is present — textarea is the unique marker
    expect(screen.getByPlaceholderText('Type the Українська translation…')).toBeTruthy();
  });

  it('closes the recall panel on ArrowLeft', async () => {
    const user = userEvent.setup();
    await renderReader();

    await user.keyboard('r');
    expect(screen.getByPlaceholderText('Type the Українська translation…')).toBeTruthy();

    // ArrowLeft exits recall mode (not Escape — the component maps ← to exit)
    await user.keyboard('{ArrowLeft}');
    expect(screen.queryByPlaceholderText('Type the Українська translation…')).toBeNull();
  });
});

// ── Italian gloss feature: 4 / 5 / 6 keys ────────────────────────────────────

const ITALIAN_BOOK: Book = { id: 2, title: 'La Divina Commedia', author: 'Dante', language: 'it', chapterCount: 3 };
const ITALIAN_CHAPTERS: Chapter[] = [{ id: 2, bookId: 2, number: 0, title: 'Inferno I', paragraphCount: 2 }];
const ITALIAN_PARAGRAPHS: Paragraph[] = [
  { id: 10, chapterId: 2, index: 0, text: 'Nel mezzo del cammin di nostra vita' },
  { id: 11, chapterId: 2, index: 1, text: 'mi ritrovai per una selva oscura' },
];

// Gloss map for the first Italian stanza.
const DANTE_GLOSS: Record<string, string> = {
  nel: 'in',
  mezzo: 'midst',
  del: 'of',
  cammin: 'journey',
  di: 'of',
  nostra: 'our',
  vita: 'life',
};

async function renderItalianReader() {
  const { api } = await import('../services/api');
  (api.books.paragraphs as ReturnType<typeof vi.fn>).mockResolvedValue(ITALIAN_PARAGRAPHS);
  render(
    <Reader
      book={ITALIAN_BOOK}
      chapters={ITALIAN_CHAPTERS}
      chapterNum={0}
      onChapterChange={vi.fn()}
      onFlashcardsChange={vi.fn()} categories={[]} onCategoriesChange={vi.fn()}
      showPhonemeHints={false}
      selectedVoice={null}
      selectedLang={LANG}
      ttsRate={1}
    />
  );
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull(), { timeout: 3000 });
}

describe('Reader — Italian gloss (4/5/6 keys)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches gloss with English as target when an Italian book loads', async () => {
    const { api } = await import('../services/api');
    await renderItalianReader();

    await waitFor(() =>
      expect(api.words.gloss).toHaveBeenCalledWith(
        'Nel mezzo del cammin di nostra vita',
        'English',
        'it',
      )
    );
  });

  it('does NOT fetch gloss for an English book', async () => {
    const { api } = await import('../services/api');
    (api.books.paragraphs as ReturnType<typeof vi.fn>).mockResolvedValue(PARAGRAPHS);
    render(
      <Reader
        book={BOOK}
        chapters={CHAPTERS}
        chapterNum={0}
        onChapterChange={vi.fn()}
        onFlashcardsChange={vi.fn()} categories={[]} onCategoriesChange={vi.fn()}
        showPhonemeHints={false}
        selectedVoice={null}
        selectedLang={LANG}
        ttsRate={1}
      />
    );
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
    // Give the effect a tick to fire (it should bail out immediately for language='en')
    await act(async () => { await Promise.resolve(); });

    expect(api.words.gloss).not.toHaveBeenCalled();
  });

  it('pressing 5 speaks the Italian word immediately', async () => {
    const { api } = await import('../services/api');
    await renderItalianReader();
    await waitFor(() => expect(api.words.gloss).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: '5' });

    // First word of the stanza is "Nel"
    expect(mockSpeak).toHaveBeenCalledWith('Nel');
  });

  it('pressing 5 speaks the English translation after a delay when the gloss is populated', async () => {
    const { api } = await import('../services/api');
    vi.mocked(api.words.gloss).mockResolvedValue({ gloss: JSON.stringify(DANTE_GLOSS) });

    await renderItalianReader();

    // Wait for the effect to call the API and the .then() to populate the cache
    await waitFor(() => expect(api.words.gloss).toHaveBeenCalled());
    // Flush the .then() callback (2 microtask ticks are sufficient)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    vi.useFakeTimers();
    try {
      fireEvent.keyDown(window, { key: '5' });

      // Italian word must be spoken first (no delay)
      expect(mockSpeak).toHaveBeenCalledWith('Nel');

      // Advance past the dynamic delay: max(700, round(3 * 110 / 1)) = 700 ms
      vi.advanceTimersByTime(800);

      // English translation must follow
      expect(mockSpeak).toHaveBeenCalledWith('in', { lang: 'en' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('pressing 5 speaks only the Italian word when gloss is empty (API unavailable)', async () => {
    // Explicitly reset — a previous test may have changed the mock implementation
    const { api } = await import('../services/api');
    vi.mocked(api.words.gloss).mockResolvedValue({ gloss: '{}' });
    await renderItalianReader();
    await waitFor(() => expect(api.words.gloss).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    vi.useFakeTimers();
    try {
      fireEvent.keyDown(window, { key: '5' });
      expect(mockSpeak).toHaveBeenCalledWith('Nel');

      vi.advanceTimersByTime(800);

      // speak must have been called exactly once — no translation follow-up
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pressing 6 advances to the next word and speaks it with translation', async () => {
    const { api } = await import('../services/api');
    vi.mocked(api.words.gloss).mockResolvedValue({ gloss: JSON.stringify(DANTE_GLOSS) });

    await renderItalianReader();
    await waitFor(() => expect(api.words.gloss).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    vi.useFakeTimers();
    try {
      // At start, word index is 0 ("Nel"). Press 6 → move to word 1 ("mezzo").
      fireEvent.keyDown(window, { key: '6' });

      expect(mockSpeak).toHaveBeenCalledWith('mezzo');

      vi.advanceTimersByTime(900); // "mezzo" has 5 chars → delay = max(700, round(5*110/1)) = 700 ms
      expect(mockSpeak).toHaveBeenCalledWith('midst', { lang: 'en' });
    } finally {
      vi.useRealTimers();
    }
  });
});
