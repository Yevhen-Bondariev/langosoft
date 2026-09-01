import { useCallback, useEffect, useState } from 'react';
import type { AppView, Book, Category, Chapter, Flashcard } from './types';
import { api, BASE } from './services/api';
import Reader from './components/Reader';
import Flashcards from './components/Flashcards';
import WordList from './components/WordList';
import ChapterList from './components/ChapterList';
// import Essay from './components/Essay';
import { SidebarDrawer } from './components/SidebarDrawer';
import { useVoicePreference } from './hooks/useVoicePreference';
import { useLanguagePreference } from './hooks/useLanguagePreference';
import { useIsMobile } from './hooks/useIsMobile';

export default function App() {
  const [view, setView] = useState<AppView>('reader');
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentChapterNum, setCurrentChapterNum] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPhonemeHints, setShowPhonemeHints] = useState(false);
  const [langRates, setLangRates] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('tts-rates-v2');
      if (stored) return JSON.parse(stored) as Record<string, number>;
    } catch { /* ignore */ }
    // Migrate from old global rate; fold in previous per-language calibration as defaults.
    const g = parseFloat(localStorage.getItem('tts-rate') ?? '0.9');
    return { en: g, it: Math.round(g * 0.75 * 10) / 10, uk: Math.round(g * 1.25 * 10) / 10 };
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('langosoft-theme') ?? 'dark');
  const { voices, selectedVoice, selectedVoiceName, setVoice, allVoices, langVoiceNames, getVoiceForLang, setVoiceForLang } = useVoicePreference();
  const { languages, selectedLang, setLanguage } = useLanguagePreference();
  const isMobile = useIsMobile();

  // On mobile, start with sidebar closed
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('langosoft-theme', theme);
  }, [theme]);

  const changeLangRate = useCallback((lang: string, delta: number) => {
    setLangRates(prev => {
      const cur = prev[lang] ?? prev['en'] ?? 0.9;
      const next = Math.round(Math.min(2.0, Math.max(0.3, cur + delta)) * 10) / 10;
      const updated = { ...prev, [lang]: next };
      localStorage.setItem('tts-rates-v2', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const loadFlashcards = useCallback(async () => {
    try {
      const [cards, cats] = await Promise.all([
        api.flashcards.list(),
        api.categories.list(),
      ]);
      setFlashcards(cards);
      setCategories(cats);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    let mounted = true;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let stopPollingTimeout: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        setIsLoading(true);
        let allBooks: Book[] = [];
        for (let attempt = 0; attempt < 8; attempt++) {
          if (!mounted) return;
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          allBooks = await api.books.list();
          if (allBooks.length > 0) break;
        }
        if (!mounted) return;
        if (allBooks.length === 0) {
          setError('No books found. The backend may still be downloading them — please wait a moment and refresh.');
          return;
        }
        setBooks(allBooks);
        const b = allBooks.find(b => b.title === 'La Divina Commedia') ?? allBooks[0];
        setBook(b);
        const chs = await api.books.chapters(b.id);
        if (!mounted) return;
        setChapters(chs);
        await loadFlashcards();

        let knownCount = allBooks.length;
        pollingInterval = setInterval(async () => {
          if (!mounted) return;
          try {
            const updated = await api.books.list();
            if (updated.length > knownCount) {
              knownCount = updated.length;
              setBooks(updated);
            }
          } catch { /* ignore */ }
        }, 3000);

        stopPollingTimeout = setTimeout(() => {
          if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
        }, 90000);

      } catch {
        if (mounted) setError(`Cannot connect to backend at ${BASE.replace('/api', '')}. If the server just woke up, wait 30 seconds and refresh.`);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (pollingInterval) clearInterval(pollingInterval);
      if (stopPollingTimeout) clearTimeout(stopPollingTimeout);
    };
  }, [loadFlashcards]);

  const handleBookChange = useCallback(async (bookId: number) => {
    const b = books.find(bk => bk.id === bookId);
    if (!b || b.id === book?.id) return;
    setBook(b);
    setCurrentChapterNum(0);
    setChapters([]);
    try {
      const chs = await api.books.chapters(b.id);
      setChapters(chs);
    } catch { /* leave chapters empty */ }
  }, [books, book]);

  const dueCount = flashcards.filter(f => new Date(f.nextReview) <= new Date()).length;

  useEffect(() => {
    const views: AppView[] = ['reader', 'flashcards', 'words'/*, 'essay'*/];
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < views.length) { e.preventDefault(); setView(views[idx]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-80">📖</div>
          <p className="text-lg font-semibold text-slate-200">Loading LangoSoft…</p>
          <p className="text-sm text-slate-500 mt-1">Downloading books on first run</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-400 font-semibold mb-2">Connection Error</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-amber-500 text-slate-950 rounded-lg font-semibold hover:bg-amber-400 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!book) return null;

  const navItems: { id: AppView; label: string; icon: string; shortcut: string; badge?: number }[] = [
    { id: 'reader',     label: 'Reader',     icon: '📖', shortcut: 'Alt+1' },
    { id: 'flashcards', label: 'Flashcards', icon: '🗂',  shortcut: 'Alt+2', badge: dueCount > 0 ? dueCount : undefined },
    { id: 'words',      label: 'My Words',   icon: '📝', shortcut: 'Alt+3' },
    // { id: 'essay',      label: 'Essay',      icon: '✍️',  shortcut: 'Alt+4' },
  ];

  // Shared sidebar content (used by both desktop aside and mobile drawer)
  const sidebarContent = (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Brand / book info */}
      <div className="px-3 py-3 border-b border-slate-800">
        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-1">LangoSoft</p>
        {books.length > 1 ? (
          <select
            value={book.id}
            onChange={e => handleBookChange(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            aria-label="Select book"
          >
            {books.filter(b => ['La Divina Commedia', 'Faust, Part One', 'Faust, Part Two'].includes(b.title)).map(b => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        ) : (
          <>
            <p className="text-xs text-slate-200 font-semibold leading-snug">{book.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{book.author}</p>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-2 py-2 border-b border-slate-800 space-y-0.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => { setView(item.id); if (isMobile) setSidebarOpen(false); }}
            title={item.shortcut}
            className={`w-full flex items-center gap-2 px-2.5 py-3 rounded-lg text-sm transition-all ${
              view === item.id
                ? 'bg-amber-500/15 text-amber-300 font-semibold ring-1 ring-amber-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === 'words' && (
              <span className="text-[10px] text-slate-600">({flashcards.length})</span>
            )}
            {item.badge !== undefined && (
              <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {item.badge}
              </span>
            )}
            {!isMobile && (
              <kbd className="text-[9px] text-slate-700 bg-slate-800 border border-slate-700 px-1 py-0.5 rounded leading-none">
                {item.shortcut}
              </kbd>
            )}
          </button>
        ))}
      </nav>

      {/* Chapter list (reader only) */}
      {view === 'reader' && (
        <div className="flex-1 overflow-y-auto">
          <p className="px-3 pt-2.5 pb-1 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Chapters</p>
          <ChapterList
            chapters={chapters}
            currentChapterNum={currentChapterNum}
            onSelect={num => { setCurrentChapterNum(num); if (isMobile) setSidebarOpen(false); }}
          />
        </div>
      )}

      {/* Stats (non-reader views) */}
      {view !== 'reader' && (
        <div className="mt-auto p-3 border-t border-slate-800">
          <div className="text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Saved words</span>
              <span className="text-slate-400 font-semibold">{flashcards.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Due for review</span>
              <span className={dueCount > 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>{dueCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Donate */}
      <div className="p-3 border-t border-slate-800">
        <a
          href="https://ko-fi.com/yevhenbondariev"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-colors"
          aria-label="Support this project on Ko-fi"
        >
          <span aria-hidden="true">☕</span> Support this project
        </a>
      </div>
    </div>
  );

  return (
    <div className="h-full flex bg-slate-950 text-slate-100">

      {/* ── Desktop sidebar (hidden on mobile) ──────────────────────────── */}
      {!isMobile && (
        <aside
          className={`${sidebarOpen ? 'w-56' : 'w-12'} flex-shrink-0 flex flex-col transition-all duration-200 overflow-hidden bg-slate-900 border-r border-slate-800`}
          style={{ boxShadow: '2px 0 12px rgba(0,0,0,0.4)' }}
          aria-label="Sidebar navigation"
        >
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="h-10 flex items-center justify-center hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition-colors border-b border-slate-800 shrink-0"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="text-xs font-bold">{sidebarOpen ? '◀' : '▶'}</span>
          </button>
          {sidebarOpen && sidebarContent}
        </aside>
      )}

      {/* ── Mobile sidebar drawer ────────────────────────────────────────── */}
      {isMobile && (
        <SidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          {sidebarContent}
        </SidebarDrawer>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {view === 'reader' && (
          <Reader
            key={book.id}
            book={book}
            chapters={chapters}
            chapterNum={currentChapterNum}
            onChapterChange={setCurrentChapterNum}
            onFlashcardsChange={loadFlashcards}
            categories={categories}
            onCategoriesChange={setCategories}
            showPhonemeHints={showPhonemeHints}
            selectedVoice={selectedVoice}
            selectedLang={selectedLang}
            langRates={langRates}
            onLangRateChange={changeLangRate}
            isMobile={isMobile}
            onOpenSidebar={() => setSidebarOpen(true)}
            voices={voices}
            voiceName={selectedVoiceName}
            onVoiceChange={setVoice}
            allVoices={allVoices}
            langVoiceNames={langVoiceNames}
            getVoiceForLang={getVoiceForLang}
            onLangVoiceChange={setVoiceForLang}
            languages={languages}
            onLangChange={setLanguage}
            onPhonemeToggle={() => setShowPhonemeHints(v => !v)}
            theme={theme}
            onThemeChange={setTheme}
          />
        )}
        {view === 'flashcards' && (
          <Flashcards
            flashcards={flashcards}
            onUpdate={loadFlashcards}
            selectedLangCode={selectedLang.code}
          />
        )}
        {view === 'words' && <WordList flashcards={flashcards} categories={categories} onUpdate={loadFlashcards} />}
        {/* {view === 'essay' && <Essay book={book} chapters={chapters} currentChapterNum={currentChapterNum} />} */}
      </main>
    </div>
  );
}
