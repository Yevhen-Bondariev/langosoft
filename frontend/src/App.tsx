import { useCallback, useEffect, useState } from 'react';
import type { AppView, Book, Chapter, Flashcard } from './types';
import { api } from './services/api';
import Reader from './components/Reader';
import Flashcards from './components/Flashcards';
import WordList from './components/WordList';
import ChapterList from './components/ChapterList';
import Essay from './components/Essay';
import { useVoicePreference } from './hooks/useVoicePreference';
import { useLanguagePreference } from './hooks/useLanguagePreference';

export default function App() {
  const [view, setView] = useState<AppView>('reader');
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentChapterNum, setCurrentChapterNum] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPhonemeHints, setShowPhonemeHints] = useState(false);
  const { voices, selectedVoice, selectedVoiceName, setVoice } = useVoicePreference();
  const { languages, selectedLang, setLanguage } = useLanguagePreference();

  const loadFlashcards = useCallback(async () => {
    try {
      const cards = await api.flashcards.list();
      setFlashcards(cards);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const allBooks = await api.books.list();
        if (allBooks.length === 0) {
          setError('No books found. Ensure the backend downloaded the book.');
          setIsLoading(false);
          return;
        }
        setBooks(allBooks);
        const b = allBooks[0];
        setBook(b);
        const chs = await api.books.chapters(b.id);
        setChapters(chs);
        await loadFlashcards();
      } catch {
        setError('Cannot connect to backend at http://localhost:5000. Make sure it is running.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadFlashcards]);

  const handleBookChange = useCallback(async (bookId: number) => {
    const b = books.find(bk => bk.id === bookId);
    if (!b || b.id === book?.id) return;
    setBook(b);
    setCurrentChapterNum(0);
    const chs = await api.books.chapters(b.id);
    setChapters(chs);
  }, [books, book]);

  const dueCount = flashcards.filter(f => new Date(f.nextReview) <= new Date()).length;

  // Global view-switching shortcuts: Alt+1…4
  useEffect(() => {
    const views: AppView[] = ['reader', 'flashcards', 'words', 'essay'];
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
    { id: 'essay',      label: 'Essay',      icon: '✍️',  shortcut: 'Alt+4' },
  ];

  return (
    <div className="h-full flex bg-slate-950 text-slate-100">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-12'} flex-shrink-0 flex flex-col transition-all duration-200 overflow-hidden
          bg-slate-900 border-r border-slate-800`}
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

        {sidebarOpen && (
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
                  {books.map(b => (
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
                  onClick={() => setView(item.id)}
                  title={item.shortcut}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all ${
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
                  <kbd className="text-[9px] text-slate-700 bg-slate-800 border border-slate-700 px-1 py-0.5 rounded leading-none">
                    {item.shortcut}
                  </kbd>
                </button>
              ))}
            </nav>

            {/* Settings */}
            <div className="px-3 py-2.5 border-b border-slate-800 space-y-3">
              {/* Phoneme hints toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Phoneme hints</span>
                <button
                  onClick={() => setShowPhonemeHints(v => !v)}
                  role="switch"
                  aria-checked={showPhonemeHints}
                  className={`relative w-9 h-5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 ${showPhonemeHints ? 'bg-amber-500' : 'bg-slate-700'}`}
                  onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setShowPhonemeHints(v => !v); }}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showPhonemeHints ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Translation language picker */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Translation language</label>
                <select
                  value={selectedLang.code}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                  aria-label="Select translation language"
                >
                  {languages.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              {/* Voice picker */}
              {voices.length > 0 && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Voice</label>
                  <select
                    value={selectedVoiceName}
                    onChange={e => setVoice(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                    aria-label="Select TTS voice"
                  >
                    {voices.map(v => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Chapter list (reader only) */}
            {view === 'reader' && (
              <div className="flex-1 overflow-y-auto">
                <p className="px-3 pt-2.5 pb-1 text-[10px] text-slate-500 font-bold uppercase tracking-widest">Chapters</p>
                <ChapterList
                  chapters={chapters}
                  currentChapterNum={currentChapterNum}
                  onSelect={num => setCurrentChapterNum(num)}
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
          </div>
        )}
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {view === 'reader' && (
          <Reader
            book={book}
            chapters={chapters}
            chapterNum={currentChapterNum}
            onChapterChange={setCurrentChapterNum}
            onFlashcardsChange={loadFlashcards}
            showPhonemeHints={showPhonemeHints}
            selectedVoice={selectedVoice}
            selectedLang={selectedLang}
          />
        )}
        {view === 'flashcards' && (
          <Flashcards
            flashcards={flashcards}
            onUpdate={loadFlashcards}
            selectedLangCode={selectedLang.code}
          />
        )}
        {view === 'words' && <WordList flashcards={flashcards} onUpdate={loadFlashcards} />}
        {view === 'essay' && <Essay book={book} chapters={chapters} currentChapterNum={currentChapterNum} />}
      </main>
    </div>
  );
}
