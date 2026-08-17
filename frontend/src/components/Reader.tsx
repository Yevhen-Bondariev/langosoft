import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, Chapter, Paragraph, WordToken } from '../types';
import { api } from '../services/api';
import { tokenizeParagraph, getWordTokens } from '../utils/tokenize';
import { useTTS } from '../hooks/useTTS';
import { phonemeHints, type PhonemeHint } from '../utils/phonemes';
import type { LanguageOption } from '../hooks/useLanguagePreference';
import { grammarRules } from '../utils/grammarRules';

interface Props {
  book: Book;
  chapters: Chapter[];
  chapterNum: number;
  onChapterChange: (num: number) => void;
  onFlashcardsChange: () => void;
  showPhonemeHints: boolean;
  selectedVoice?: SpeechSynthesisVoice | null;
  selectedLang: LanguageOption;
}

interface AddFlashcardState {
  word: string;
  context: string;
  wordIndex: number;
  paragraphIndex: number;
  chapterNumber: number;
}

export default function Reader({ book, chapters, chapterNum, onChapterChange, onFlashcardsChange, showPhonemeHints, selectedVoice, selectedLang }: Props) {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const [addState, setAddState] = useState<AddFlashcardState | null>(null);
  const [addTranslation, setAddTranslation] = useState('');
  const [addSynonym, setAddSynonym] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [tokens, setTokens] = useState<WordToken[]>([]);
  const [currentHint, setCurrentHint] = useState<PhonemeHint | null>(null);
  const [grammarTenses, setGrammarTenses] = useState<string[] | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [selectedTense, setSelectedTense] = useState<string | null>(null);
  const grammarCache = useRef<Map<number, string[]>>(new Map());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const translationInputRef = useRef<HTMLInputElement>(null);
  const currentParaRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { speak, speakChain, stop } = useTTS(selectedVoice);

  // Load progress on mount
  useEffect(() => {
    api.progress.get(book.id).then(progress => {
      if (progress) {
        onChapterChange(progress.chapterNumber);
        setCurrentParagraphIndex(progress.paragraphIndex);
        setCurrentWordIndex(progress.wordIndex);
      }
      setProgressLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Load paragraphs when chapter changes
  useEffect(() => {
    if (!progressLoaded) return;
    setIsLoading(true);
    api.books.paragraphs(book.id, chapterNum)
      .then(paras => setParagraphs(paras))
      .catch(() => setParagraphs([]))
      .finally(() => setIsLoading(false));
  }, [book.id, chapterNum, progressLoaded]);

  // Tokenize current paragraph
  useEffect(() => {
    const para = paragraphs[currentParagraphIndex];
    if (para) setTokens(tokenizeParagraph(para.text));
  }, [paragraphs, currentParagraphIndex]);

  // Reset letter index when word changes
  useEffect(() => {
    setCurrentLetterIndex(0);
  }, [currentWordIndex]);

  // Clear grammar panel when paragraph changes
  useEffect(() => {
    const cached = grammarCache.current.get(currentParagraphIndex);
    if (cached) {
      setGrammarTenses(cached);
      setSelectedTense(cached[0] ?? null);
    } else {
      setGrammarTenses(null);
      setSelectedTense(null);
    }
  }, [currentParagraphIndex]);

  // Scroll current paragraph into view
  useEffect(() => {
    currentParaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentParagraphIndex]);

  const wordTokens = getWordTokens(tokens);
  const totalChapters = chapters.length;
  const currentChapter = chapters.find(c => c.number === chapterNum);

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 2500);
  }, []);

  const saveProgress = useCallback((chapterNumber: number, paragraphIndex: number, wordIndex: number) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      api.progress.save(book.id, { chapterNumber, paragraphIndex, wordIndex }).catch(() => {});
    }, 800);
  }, [book.id]);

  const goToChapter = useCallback((num: number) => {
    const clamped = Math.max(0, Math.min(num, totalChapters - 1));
    onChapterChange(clamped);
    setCurrentParagraphIndex(0);
    setCurrentWordIndex(0);
    saveProgress(clamped, 0, 0);
    stop();
  }, [totalChapters, onChapterChange, saveProgress, stop]);

  const goToParagraph = useCallback((idx: number, autoSpeak = false) => {
    const clamped = Math.max(0, Math.min(idx, paragraphs.length - 1));
    setCurrentParagraphIndex(clamped);
    setCurrentWordIndex(0);
    saveProgress(chapterNum, clamped, 0);
    setCurrentHint(null);
    if (autoSpeak) {
      const para = paragraphs[clamped];
      if (para) speak(para.text);
    }
  }, [paragraphs, chapterNum, saveProgress, speak]);

  const goToWord = useCallback((wordIdx: number) => {
    if (wordTokens.length === 0) return;
    const clamped = Math.max(0, Math.min(wordIdx, wordTokens.length - 1));
    setCurrentWordIndex(clamped);
    const word = wordTokens[clamped]?.rawWord || wordTokens[clamped]?.text || '';
    if (word) {
      speak(word);
      if (showPhonemeHints) {
        const hint = phonemeHints[word.toLowerCase()];
        setCurrentHint(hint ?? null);
        if (hint) setTimeout(() => speak(`Tip: native speakers say ${hint.audioHint}`), 950);
      } else {
        setCurrentHint(null);
      }
    }
    saveProgress(chapterNum, currentParagraphIndex, clamped);
  }, [wordTokens, speak, chapterNum, currentParagraphIndex, saveProgress, showPhonemeHints]);

  const analyzeGrammar = useCallback(async () => {
    // Toggle off if already showing for this paragraph
    if (grammarTenses !== null) {
      setGrammarTenses(null);
      setSelectedTense(null);
      return;
    }
    const para = paragraphs[currentParagraphIndex];
    if (!para) return;

    // Use cache if available
    const cached = grammarCache.current.get(currentParagraphIndex);
    if (cached) {
      setGrammarTenses(cached);
      setSelectedTense(cached[0] ?? null);
      return;
    }

    setGrammarLoading(true);
    try {
      const result = await api.grammar.analyze(para.text);
      const tenses = result.tenses;
      grammarCache.current.set(currentParagraphIndex, tenses);
      setGrammarTenses(tenses);
      setSelectedTense(tenses[0] ?? null);
    } catch {
      setGrammarTenses([]);
    } finally {
      setGrammarLoading(false);
    }
  }, [grammarTenses, paragraphs, currentParagraphIndex]);

  const readCurrentParagraph = useCallback(() => {
    const para = paragraphs[currentParagraphIndex];
    if (para) speak(para.text);
  }, [paragraphs, currentParagraphIndex, speak]);

  const openAddFlashcard = useCallback((wordIdx?: number) => {
    const idx = wordIdx !== undefined ? wordIdx : currentWordIndex;
    const token = wordTokens[idx];
    if (!token) return;
    const para = paragraphs[currentParagraphIndex];
    const word = token.rawWord || token.text;
    const context = para?.text || '';
    setAddState({ word, context, wordIndex: idx, paragraphIndex: currentParagraphIndex, chapterNumber: chapterNum });
    setAddTranslation('');
    setAddSynonym('');

    // Speak the word immediately
    speak(word);

    // Auto-fetch translation + synonym via Groq, then read all three aloud
    setAddLoading(true);
    api.words.translate(word, context, selectedLang.name)
      .then(d => {
        const translation = d.translation ?? '';
        const synonym = d.synonym ?? '';
        setAddTranslation(translation);
        setAddSynonym(synonym);
        // Read: word (EN) → translation (target lang) → synonym (EN)
        speakChain([
          { text: word },
          { text: translation, lang: selectedLang.code },
          { text: synonym },
        ]);
      })
      .catch(() => {})
      .finally(() => setAddLoading(false));

    setTimeout(() => translationInputRef.current?.focus(), 50);
  }, [wordTokens, currentWordIndex, paragraphs, currentParagraphIndex, chapterNum, speak, speakChain, selectedLang]);

  const submitFlashcard = useCallback(async () => {
    if (!addState) return;
    try {
      await api.flashcards.create({
        word: addState.word,
        context: addState.context,
        translation: addTranslation || undefined,
        synonym: addSynonym || undefined,
        bookId: book.id,
        chapterNumber: addState.chapterNumber,
        paragraphIndex: addState.paragraphIndex,
      });
      onFlashcardsChange();
      showStatus(`"${addState.word}" saved`);
      speak(`${addState.word} saved`);
    } catch {
      showStatus('Failed to save');
    }
    setAddState(null);
  }, [addState, addTranslation, addSynonym, book.id, onFlashcardsChange, showStatus, speak]);

  // Search matches within current paragraph
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return wordTokens.map((t, i) => ({ i, t })).filter(({ t }) => t.rawWord.toLowerCase().startsWith(q));
  }, [searchQuery, wordTokens]);

  const clampedSearchIdx = Math.min(searchSelectedIndex, Math.max(0, searchMatches.length - 1));

  // Main keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Add flashcard modal shortcuts
      if (addState) {
        if (e.key === 'Escape') { setAddState(null); e.preventDefault(); }
        if (e.key === 'Enter' && !inInput) { submitFlashcard(); e.preventDefault(); }
        return;
      }

      // Ctrl (alone) = stop TTS — works everywhere
      if (e.key === 'Control' && !e.altKey && !e.shiftKey && !e.metaKey && !inInput) {
        e.preventDefault();
        stop();
        return;
      }

      // Search mode
      if (searchMode) {
        if (e.key === 'Escape') { setSearchMode(false); setSearchQuery(''); e.preventDefault(); return; }
        if (e.key === 'Enter') {
          if (searchMatches.length > 0) {
            const match = searchMatches[clampedSearchIdx];
            setCurrentWordIndex(match.i);
            setSearchMode(false);
            setSearchQuery('');
          }
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowDown' || e.code === 'Numpad6') { setSearchSelectedIndex(i => Math.min(i + 1, searchMatches.length - 1)); e.preventDefault(); return; }
        if (e.key === 'ArrowUp' || e.code === 'Numpad4') { setSearchSelectedIndex(i => Math.max(i - 1, 0)); e.preventDefault(); return; }
        if (e.key === '0' || e.code === 'Numpad0') {
          if (searchMatches.length > 0) {
            const match = searchMatches[clampedSearchIdx];
            setCurrentWordIndex(match.i);
            setSearchMode(false);
            setSearchQuery('');
            openAddFlashcard(match.i);
          }
          e.preventDefault();
          return;
        }
        return;
      }

      if (inInput) return;

      const code = e.code;
      const key = e.key;

      // ── 1 / Numpad1 ── previous letter
      if (key === '1' || code === 'Numpad1') {
        e.preventDefault();
        const letters = wordTokens[currentWordIndex]?.rawWord.split('') ?? [];
        const next = Math.max(0, currentLetterIndex - 1);
        setCurrentLetterIndex(next);
        if (letters[next]) speak(letters[next]);
        return;
      }
      // ── 2 / Numpad2 ── current letter
      if (key === '2' || code === 'Numpad2') {
        e.preventDefault();
        const letters = wordTokens[currentWordIndex]?.rawWord.split('') ?? [];
        if (letters[currentLetterIndex]) speak(letters[currentLetterIndex]);
        return;
      }
      // ── 3 / Numpad3 ── next letter
      if (key === '3' || code === 'Numpad3') {
        e.preventDefault();
        const letters = wordTokens[currentWordIndex]?.rawWord.split('') ?? [];
        const next = Math.min(letters.length - 1, currentLetterIndex + 1);
        setCurrentLetterIndex(next);
        if (letters[next]) speak(letters[next]);
        return;
      }
      // ── 4 / Numpad4 ── previous word
      if (key === '4' || code === 'Numpad4') {
        e.preventDefault();
        if (currentWordIndex > 0) {
          goToWord(currentWordIndex - 1);
        } else if (currentParagraphIndex > 0) {
          goToParagraph(currentParagraphIndex - 1);
        }
        return;
      }
      // ── 5 / Numpad5 ── current word
      if (key === '5' || code === 'Numpad5') {
        e.preventDefault();
        const token = wordTokens[currentWordIndex];
        if (token) {
          const word = token.rawWord || token.text;
          speak(word);
          if (showPhonemeHints) {
            const hint = phonemeHints[word.toLowerCase()];
            if (hint) setTimeout(() => speak(`Native speakers say: ${hint.audioHint}. ${hint.tip}`), 950);
          }
        }
        return;
      }
      // ── 6 / Numpad6 ── next word
      if (key === '6' || code === 'Numpad6') {
        e.preventDefault();
        if (currentWordIndex < wordTokens.length - 1) {
          goToWord(currentWordIndex + 1);
        } else if (currentParagraphIndex < paragraphs.length - 1) {
          goToParagraph(currentParagraphIndex + 1, true);
        }
        return;
      }
      // ── 7 / Numpad7 ── previous line (paragraph)
      if (key === '7' || code === 'Numpad7') {
        e.preventDefault();
        goToParagraph(currentParagraphIndex - 1, true);
        return;
      }
      // ── 8 / Numpad8 ── current line (paragraph)
      if (key === '8' || code === 'Numpad8') {
        e.preventDefault();
        readCurrentParagraph();
        return;
      }
      // ── 9 / Numpad9 ── next line (paragraph)
      if (key === '9' || code === 'Numpad9') {
        e.preventDefault();
        goToParagraph(currentParagraphIndex + 1, true);
        return;
      }
      // ── 0 / Numpad0 ── add flashcard
      if (key === '0' || code === 'Numpad0') {
        e.preventDefault();
        openAddFlashcard();
        return;
      }
      // ── [ / PageUp ── previous chapter
      if (key === '[' || code === 'PageUp') {
        e.preventDefault();
        goToChapter(chapterNum - 1);
        return;
      }
      // ── ] / PageDown ── next chapter
      if (key === ']' || code === 'PageDown') {
        e.preventDefault();
        goToChapter(chapterNum + 1);
        return;
      }
      // ── f ── search
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        setSearchMode(true);
        setSearchQuery('');
        setSearchSelectedIndex(0);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      // ── g ── grammar analysis
      if (key === 'g' || key === 'G') {
        e.preventDefault();
        analyzeGrammar();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    addState, searchMode, searchMatches, clampedSearchIdx,
    currentWordIndex, currentLetterIndex, currentParagraphIndex, paragraphs,
    wordTokens, chapterNum, showPhonemeHints,
    readCurrentParagraph, goToWord, goToParagraph, goToChapter,
    openAddFlashcard, submitFlashcard, speak, speakChain, stop, analyzeGrammar,
  ]);

  const renderParagraph = (para: Paragraph, paraIdx: number) => {
    const isCurrent = paraIdx === currentParagraphIndex;
    const paraTokens = isCurrent ? tokens : tokenizeParagraph(para.text);

    return (
      <div
        key={para.id}
        ref={isCurrent ? currentParaRef : null}
        className={`px-4 py-3 rounded-lg mb-2 text-xl leading-relaxed transition-colors ${
          isCurrent
            ? 'bg-slate-800 border-l-4 border-amber-500'
            : 'bg-transparent hover:bg-slate-900 border-l-4 border-transparent'
        }`}
        onClick={() => {
          setCurrentParagraphIndex(paraIdx);
          setCurrentWordIndex(0);
          saveProgress(chapterNum, paraIdx, 0);
        }}
        aria-current={isCurrent ? 'true' : undefined}
      >
        {paraTokens.map((token, ti) => {
          if (token.type !== 'word') return <span key={ti}>{token.text}</span>;

          const isCurrentWord = isCurrent && token.wordIndex === currentWordIndex;
          let searchClass = '';
          if (searchMode && isCurrent && searchQuery) {
            const q = searchQuery.toLowerCase();
            if (token.rawWord.toLowerCase().startsWith(q)) {
              const matchIdx = searchMatches.findIndex(m => m.i === token.wordIndex);
              if (matchIdx === clampedSearchIdx) searchClass = 'word-search-selected';
              else searchClass = 'word-search-match';
            }
          }
          const hasHint = showPhonemeHints && !!phonemeHints[token.rawWord.toLowerCase()];

          return (
            <span
              key={ti}
              className={`word-token ${isCurrentWord ? 'word-current' : ''} ${searchClass} ${hasHint ? 'word-has-hint' : ''}`}
              onClick={e => {
                e.stopPropagation();
                if (isCurrent && token.wordIndex !== null) {
                  setCurrentWordIndex(token.wordIndex);
                } else {
                  setCurrentParagraphIndex(paraIdx);
                  setCurrentWordIndex(token.wordIndex ?? 0);
                  saveProgress(chapterNum, paraIdx, token.wordIndex ?? 0);
                }
              }}
              onDoubleClick={e => {
                e.stopPropagation();
                if (token.wordIndex !== null) openAddFlashcard(token.wordIndex);
              }}
              title={hasHint ? phonemeHints[token.rawWord.toLowerCase()]?.display : 'Double-click to add to flashcards'}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    );
  };

  const currentWordLetters = wordTokens[currentWordIndex]?.rawWord.split('') ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Chapter navigation bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <button
          onClick={() => goToChapter(chapterNum - 1)}
          disabled={chapterNum <= 0}
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
          aria-label="Previous chapter"
        >
          ← Prev
        </button>
        <div className="flex-1 text-center">
          <span className="text-amber-400 font-semibold text-sm">
            {currentChapter?.title || `Chapter ${chapterNum}`}
          </span>
          <span className="text-slate-500 text-xs ml-2">{chapterNum + 1} / {totalChapters}</span>
        </div>
        <button
          onClick={() => goToChapter(chapterNum + 1)}
          disabled={chapterNum >= totalChapters - 1}
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
          aria-label="Next chapter"
        >
          Next →
        </button>
      </div>

      {/* Progress indicator */}
      <div className="px-4 py-1.5 bg-slate-950 shrink-0 flex items-center gap-4 text-xs text-slate-500">
        <span>Para {currentParagraphIndex + 1}/{paragraphs.length}</span>
        <span>Word {currentWordIndex + 1}/{wordTokens.length || 1}</span>
        {currentWordLetters.length > 0 && (
          <span className="font-mono text-slate-600">
            {currentWordLetters.map((l, i) => (
              <span key={i} className={i === currentLetterIndex ? 'text-amber-400 font-bold' : ''}>{l}</span>
            ))}
          </span>
        )}
        {statusMsg && <span className="text-amber-400 font-medium ml-auto">{statusMsg}</span>}
      </div>

      {/* Phoneme hint panel */}
      {showPhonemeHints && currentHint && (
        <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-800/50 shrink-0 flex items-center gap-3 text-sm" role="status" aria-live="polite">
          <span className="text-amber-300 font-mono font-bold text-base">{currentHint.display}</span>
          <span className="text-amber-700 text-xs">|</span>
          <span className="text-amber-500/80 text-xs font-medium uppercase tracking-wide">{currentHint.category}</span>
          <span className="text-amber-700 text-xs">·</span>
          <span className="text-slate-300 text-xs">{currentHint.tip}</span>
        </div>
      )}

      {/* Grammar analysis panel */}
      {(grammarLoading || grammarTenses !== null) && (
        <div className="px-4 py-2.5 bg-indigo-950/50 border-b border-indigo-800/40 shrink-0" role="status" aria-live="polite">
          {grammarLoading ? (
            <p className="text-indigo-400 text-xs animate-pulse">Analysing grammar…</p>
          ) : grammarTenses && grammarTenses.length === 0 ? (
            <p className="text-indigo-600 text-xs">No recognisable tense constructions found.</p>
          ) : grammarTenses && (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest shrink-0">Tenses:</span>
                {grammarTenses.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedTense(st => st === t ? null : t)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      selectedTense === t
                        ? 'bg-indigo-500 text-white font-semibold'
                        : 'bg-indigo-900/60 text-indigo-300 hover:bg-indigo-800'
                    }`}
                  >
                    {t.replace(/\b\w/g, l => l.toUpperCase())}
                  </button>
                ))}
                <button
                  onClick={() => { setGrammarTenses(null); setSelectedTense(null); }}
                  className="ml-auto text-indigo-700 hover:text-indigo-400 text-xs leading-none"
                  aria-label="Close grammar panel"
                >✕</button>
              </div>
              {selectedTense && grammarRules[selectedTense] && (
                <div className="mt-2 space-y-1 text-xs border-t border-indigo-900 pt-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-indigo-300 font-bold">{grammarRules[selectedTense].name}</span>
                    <span className="text-indigo-700 font-mono">{grammarRules[selectedTense].formula}</span>
                  </div>
                  <ul className="text-slate-400 space-y-0.5">
                    {grammarRules[selectedTense].when.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                  {grammarRules[selectedTense].signal && (
                    <p className="text-indigo-800 pt-0.5">
                      Signal words: {grammarRules[selectedTense].signal!.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Search bar */}
      {searchMode && (
        <div className="px-4 py-2 bg-blue-950 border-b border-blue-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-blue-300 text-sm font-medium">Search:</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchSelectedIndex(0); }}
              placeholder="Type letters..."
              className="flex-1 bg-blue-900 border border-blue-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-400"
              aria-label="Search word in current paragraph"
            />
            <span className="text-blue-400 text-xs">{searchMatches.length} match{searchMatches.length !== 1 ? 'es' : ''}</span>
            <button onClick={() => { setSearchMode(false); setSearchQuery(''); }} className="text-blue-400 hover:text-blue-200 text-sm">Esc</button>
          </div>
          {searchMatches.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {searchMatches.slice(0, 8).map((m, i) => (
                <button
                  key={m.i}
                  onClick={() => { setCurrentWordIndex(m.i); setSearchMode(false); setSearchQuery(''); }}
                  className={`px-2 py-0.5 rounded text-xs ${i === clampedSearchIdx ? 'bg-blue-500 text-white' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'}`}
                >
                  {m.t.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Book content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="text-slate-500 text-center py-8">Loading...</div>
        ) : (
          paragraphs.map((para, idx) => renderParagraph(para, idx))
        )}
      </div>

      {/* Keyboard shortcut hint */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span><kbd className="bg-slate-700 px-1 rounded">1</kbd>/<kbd className="bg-slate-700 px-1 rounded">3</kbd> letter</span>
          <span><kbd className="bg-slate-700 px-1 rounded">2</kbd> this letter</span>
          <span><kbd className="bg-slate-700 px-1 rounded">4</kbd>/<kbd className="bg-slate-700 px-1 rounded">6</kbd> word</span>
          <span><kbd className="bg-slate-700 px-1 rounded">5</kbd> this word</span>
          <span><kbd className="bg-slate-700 px-1 rounded">7</kbd>/<kbd className="bg-slate-700 px-1 rounded">9</kbd> line</span>
          <span><kbd className="bg-slate-700 px-1 rounded">8</kbd> read line</span>
          <span><kbd className="bg-slate-700 px-1 rounded">0</kbd> add card</span>
          <span><kbd className="bg-slate-700 px-1 rounded">f</kbd> search</span>
          <span><kbd className="bg-slate-700 px-1 rounded">g</kbd> grammar</span>
          <span><kbd className="bg-slate-700 px-1 rounded">[</kbd>/<kbd className="bg-slate-700 px-1 rounded">]</kbd> chapter</span>
          <span><kbd className="bg-slate-700 px-1 rounded">Ctrl</kbd> stop</span>
        </div>
      </div>

      {/* Add flashcard modal */}
      {addState && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Add flashcard">
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-bold text-amber-400 mb-1">Add to Flashcards</h2>
            <p className="text-2xl text-white mb-1">"{addState.word}"</p>
            <p className="text-xs text-slate-400 mb-4 line-clamp-2 italic">{addState.context}</p>

            {addLoading ? (
              <div className="text-center py-4 text-slate-400 text-sm animate-pulse">Fetching translation…</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1" htmlFor="translation">{selectedLang.label} translation</label>
                  <input
                    id="translation"
                    ref={translationInputRef}
                    type="text"
                    value={addTranslation}
                    onChange={e => setAddTranslation(e.target.value)}
                    placeholder="Enter translation…"
                    className="w-full bg-slate-700 border border-slate-500 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); submitFlashcard(); }
                      if (e.key === 'Escape') { e.preventDefault(); setAddState(null); }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1" htmlFor="synonym">English synonym</label>
                  <input
                    id="synonym"
                    type="text"
                    value={addSynonym}
                    onChange={e => setAddSynonym(e.target.value)}
                    placeholder="e.g. ephemeral → transient"
                    className="w-full bg-slate-700 border border-slate-500 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); submitFlashcard(); }
                      if (e.key === 'Escape') { e.preventDefault(); setAddState(null); }
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={submitFlashcard}
                disabled={addLoading}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold py-2 rounded transition-colors"
              >
                Save (Enter)
              </button>
              <button
                onClick={() => setAddState(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
              >
                Cancel (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
