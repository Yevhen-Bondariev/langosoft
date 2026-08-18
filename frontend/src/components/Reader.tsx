import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, Chapter, Paragraph } from '../types';
import { api } from '../services/api';
import { tokenizeParagraph, getWordTokens } from '../utils/tokenize';
import { useTTS } from '../hooks/useTTS';
import { phonemeHints, type PhonemeHint } from '../utils/phonemes';
import type { LanguageOption } from '../hooks/useLanguagePreference';
import { grammarRules } from '../utils/grammarRules';
import { lineAtWord, lineIndexAtWord, firstWordOfLine, wordDiff, recallScore, type DiffSegment } from '../utils/recall';

function stripMarkdown(text: string): string {
  return text
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .trim();
}

function playTone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch { /* ignore */ }
}
function playSuccess() {
  playTone(523, 0.08); setTimeout(() => playTone(659, 0.08), 90); setTimeout(() => playTone(784, 0.18), 180);
}
function playFailure() {
  playTone(220, 0.15, 'sawtooth', 0.2); setTimeout(() => playTone(196, 0.2, 'sawtooth', 0.15), 160);
}

function RecallResults({ diff, explanation, explainLoading, onRetry, onExplain, onHear, onHearTranslation, onClose }: {
  diff: DiffSegment[];
  explanation: string | null;
  explainLoading: boolean;
  onRetry: () => void;
  onExplain: () => void;
  onHear: () => void;
  onHearTranslation?: () => void;
  onClose: () => void;
}) {
  const { correct, total, missing } = recallScore(diff);
  return (
    <div className="space-y-3">
      <div
        className={`px-3 py-2 rounded-lg text-sm font-semibold ${correct === total ? 'bg-green-900/40 text-green-300' : 'bg-slate-700 text-slate-200'}`}
        role="status"
        aria-live="polite"
        aria-label={correct === total
          ? 'Perfect! All words correct.'
          : `Score: ${correct} out of ${total} words correct.${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}`}
      >
        {correct === total
          ? 'Perfect!'
          : `${correct} / ${total} words correct${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`}
      </div>

      <div className="bg-slate-900/60 rounded-lg px-4 py-3 text-base leading-loose">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Comparison</p>
        {diff.map((seg, idx) => (
          <span
            key={idx}
            className={
              seg.kind === 'match'   ? 'text-slate-200' :
              seg.kind === 'missing' ? 'text-red-400 line-through decoration-red-600 font-medium' :
                                       'text-amber-400 italic'
            }
            aria-label={
              seg.kind === 'match'   ? seg.text :
              seg.kind === 'missing' ? `${seg.text} (you missed this)` :
                                       `${seg.text} (extra word)`
            }
          >
            {seg.text}{' '}
          </span>
        ))}
      </div>

      <div className="flex gap-4 text-xs text-slate-500">
        <span><span className="text-slate-300">word</span> = correct</span>
        <span><span className="text-red-400 line-through">word</span> = missed</span>
        <span><span className="text-amber-400 italic">word</span> = extra</span>
      </div>

      {explanation ? (
        <div className="bg-indigo-950/50 border border-indigo-800/40 rounded-lg px-4 py-3" role="region" aria-label="Grammar explanation">
          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-2">Explanation</p>
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{explanation}</p>
        </div>
      ) : explainLoading ? (
        <p className="text-indigo-400 text-sm animate-pulse" aria-live="polite">Generating explanation…</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={onRetry}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors">
          Retry (r)
        </button>
        {!explanation && !explainLoading && (
          <button onClick={onExplain}
            className="px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 text-indigo-200 rounded text-xs font-medium transition-colors">
            Explain differences (e)
          </button>
        )}
        <button onClick={onHear}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors">
          Hear English (8)
        </button>
        {onHearTranslation && (
          <button onClick={onHearTranslation}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors">
            Hear translation (t)
          </button>
        )}
        <button onClick={onClose}
          className="ml-auto text-slate-600 hover:text-slate-400 text-xs transition-colors">
          Close (Esc)
        </button>
      </div>
    </div>
  );
}

interface Props {
  book: Book;
  chapters: Chapter[];
  chapterNum: number;
  onChapterChange: (num: number) => void;
  onFlashcardsChange: () => void;
  showPhonemeHints: boolean;
  selectedVoice?: SpeechSynthesisVoice | null;
  selectedLang: LanguageOption;
  ttsRate?: number;
  onRateToggle?: () => void;
}

interface AddFlashcardState {
  word: string;
  context: string;
  wordIndex: number;
  paragraphIndex: number;
  chapterNumber: number;
}

export default function Reader({ book, chapters, chapterNum, onChapterChange, onFlashcardsChange, showPhonemeHints, selectedVoice, selectedLang, ttsRate = 0.9, onRateToggle }: Props) {
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
  const [addTranslationError, setAddTranslationError] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [currentHint, setCurrentHint] = useState<PhonemeHint | null>(null);
  const [grammarTenses, setGrammarTenses] = useState<string[] | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [selectedTense, setSelectedTense] = useState<string | null>(null);
  const grammarCache = useRef<Map<number, string[]>>(new Map());

  const [recallMode, setRecallMode] = useState(false);
  const [recallSentence, setRecallSentence] = useState('');
  const [recallInput, setRecallInput] = useState('');
  const [recallDiff, setRecallDiff] = useState<DiffSegment[] | null>(null);
  const [recallExplanation, setRecallExplanation] = useState<string | null>(null);
  const [recallExplainLoading, setRecallExplainLoading] = useState(false);
  const recallTextareaRef = useRef<HTMLTextAreaElement>(null);
  const customQuestionRef = useRef<HTMLTextAreaElement>(null);
  const [customQuestionOpen, setCustomQuestionOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState<string | null>(null);
  const [customAnswerLoading, setCustomAnswerLoading] = useState(false);

  const lineLiteraryCache = useRef<Map<string, string>>(new Map());
  // Per-word translation cache: "${line}::${langName}" → Map<lowercase-word, translation>
  const glossWordCache = useRef<Map<string, Map<string, string>>>(new Map());

  // Recall-mode hint: translations of the specific line being recalled (not the full paragraph)
  const [recallHintLiterary, setRecallHintLiterary] = useState('');
  const [recallHintLiteral, setRecallHintLiteral] = useState('');
  const [recallHintLoading, setRecallHintLoading] = useState(false);
  const [nvdaAnnounce, setNvdaAnnounce] = useState('');
  // Pre-tokenize all paragraphs once when the chapter loads (not on every keystroke)
  const allTokens = useMemo(() => paragraphs.map(p => tokenizeParagraph(p.text)), [paragraphs]);
  const tokens = allTokens[currentParagraphIndex] ?? [];

  const searchInputRef = useRef<HTMLInputElement>(null);
  const translationInputRef = useRef<HTMLInputElement>(null);
  const currentParaRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { speak, speakChain, stop } = useTTS(selectedVoice, ttsRate, book.language);

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
    let cancelled = false;
    setIsLoading(true);
    api.books.paragraphs(book.id, chapterNum)
      .then(paras => { if (!cancelled) setParagraphs(paras); })
      .catch(() => { if (!cancelled) setParagraphs([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [book.id, chapterNum, progressLoaded]);

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

  // Pre-fetch English word-by-word gloss for the whole current stanza/paragraph
  // One Groq call per stanza covers all words in all three verse lines at once.
  useEffect(() => {
    if (book.language === 'en') return;
    const para = paragraphs[currentParagraphIndex];
    if (!para) return;
    const cacheKey = `${currentParagraphIndex}::en`;
    if (glossWordCache.current.has(cacheKey)) return;
    api.words.gloss(para.text, 'English', book.language)
      .then(r => {
        const map = new Map<string, string>();
        try {
          const obj = JSON.parse(r.gloss) as Record<string, string>;
          for (const [word, tr] of Object.entries(obj)) {
            if (typeof tr === 'string') map.set(word.toLowerCase(), tr);
          }
        } catch {
          // fallback: old "word — tr; ..." format
          r.gloss.split(';').forEach(entry => {
            const dash = entry.search(/\s[—–]\s/);
            if (dash > 0) map.set(entry.slice(0, dash).trim().toLowerCase(), entry.slice(dash + 3).trim());
          });
        }
        if (map.size > 0) glossWordCache.current.set(cacheKey, map);
      })
      .catch(() => {});
  }, [currentParagraphIndex, paragraphs, book.language]);

  const wordTokens = getWordTokens(tokens);
  const totalChapters = chapters.length;
  const currentChapter = chapters.find(c => c.number === chapterNum);

  // Announce text to NVDA via aria-live. Clear first so repeat presses re-fire.
  const announceToNvda = useCallback((text: string) => {
    setNvdaAnnounce('');
    setTimeout(() => setNvdaAnnounce(text), 50);
  }, []);

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
    const token = wordTokens[clamped];
    const word = token?.rawWord || token?.text || '';
    if (word) {
      const tr = glossWordCache.current.get(`${currentParagraphIndex}::en`)?.get(word.toLowerCase()) ?? '';
      speak(word);
      if (tr) {
        const delay = Math.max(700, Math.round(word.length * 110 / ttsRate));
        setTimeout(() => speak(tr, { lang: 'en' }), delay);
      }
      if (showPhonemeHints) {
        const hint = phonemeHints[word.toLowerCase()];
        setCurrentHint(hint ?? null);
        if (hint) setTimeout(() => speak(`Tip: native speakers say ${hint.audioHint}`), 950);
      } else {
        setCurrentHint(null);
      }
    }
    saveProgress(chapterNum, currentParagraphIndex, clamped);
  }, [wordTokens, speak, ttsRate, chapterNum, currentParagraphIndex, saveProgress, showPhonemeHints]);

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

  const submitCustomQuestion = useCallback(async () => {
    if (!customQuestion.trim()) return;
    setCustomAnswerLoading(true);
    try {
      const res = await api.words.customExplain(recallSentence, recallHintLiterary, recallHintLiteral, customQuestion);
      setCustomAnswer(stripMarkdown(res.answer || '') || '(no answer)');
    } catch {
      setCustomAnswer('(unavailable — check API key)');
    } finally {
      setCustomAnswerLoading(false);
    }
  }, [customQuestion, recallSentence, recallHintLiterary, recallHintLiteral]);

  const enterRecall = useCallback(() => {
    const para = paragraphs[currentParagraphIndex];
    if (!para) return;
    const sentence = lineAtWord(para.text, currentWordIndex);
    if (!sentence) return;
    setRecallSentence(sentence);
    setRecallInput('');
    setRecallDiff(null);
    setRecallExplanation(null);
    setCustomQuestionOpen(false);
    setCustomQuestion('');
    setCustomAnswer(null);
    setRecallHintLiterary('');
    setRecallHintLiteral('');
    setRecallMode(true);
    setTimeout(() => recallTextareaRef.current?.focus(), 50);
    setRecallHintLoading(true);
    const lineCacheKey = `${sentence}::${selectedLang.name}`;
    const cachedLiterary = lineLiteraryCache.current.get(lineCacheKey);
    Promise.all([
      cachedLiterary !== undefined
        ? Promise.resolve(cachedLiterary)
        : api.words.translateParagraph(sentence, selectedLang.name, book.language, false).then(r => r.translation),
      api.words.translateParagraph(sentence, selectedLang.name, book.language, true),
    ]).then(([literary, litrl]) => {
      lineLiteraryCache.current.set(lineCacheKey, literary);
      setRecallHintLiterary(literary);
      setRecallHintLiteral(litrl.translation);
    }).catch(() => {}).finally(() => setRecallHintLoading(false));
  }, [paragraphs, currentParagraphIndex, currentWordIndex, selectedLang.name, book.language]);

  const submitRecall = useCallback(() => {
    if (!recallInput.trim()) return;
    const diff = wordDiff(recallSentence, recallInput);
    setRecallDiff(diff);
    const { correct, total, missing } = recallScore(diff);
    const extra = diff.filter(s => s.kind === 'extra').map(s => s.text);
    if (correct === total) {
      playSuccess();
      setTimeout(() => speak('Correct!'), 350);
    } else {
      playFailure();
      const parts: string[] = [];
      if (missing.length) parts.push(`Missing: ${missing.join(', ')}.`);
      if (extra.length) parts.push(`Wrong: ${extra.join(', ')}.`);
      setTimeout(() => speak(parts.join(' ')), 400);
    }
  }, [recallSentence, recallInput, speak]);

  const retryRecall = useCallback(() => {
    setRecallDiff(null);
    setRecallExplanation(null);
    setRecallInput('');
    setTimeout(() => recallTextareaRef.current?.focus(), 50);
  }, []);

  const explainRecall = useCallback(async () => {
    if (recallExplanation || recallExplainLoading) return;
    setRecallExplainLoading(true);
    try {
      const res = await api.words.recallExplain(recallSentence, recallInput);
      setRecallExplanation(res.explanation || '(no explanation available)');
    } catch {
      setRecallExplanation('(explanation unavailable — check API key)');
    } finally {
      setRecallExplainLoading(false);
    }
  }, [recallExplanation, recallExplainLoading, recallSentence, recallInput]);

  const readCurrentLine = useCallback(() => {
    const para = paragraphs[currentParagraphIndex];
    if (!para) return;
    const line = lineAtWord(para.text, currentWordIndex);
    speak(line || para.text);
  }, [paragraphs, currentParagraphIndex, currentWordIndex, speak]);

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
    setAddTranslationError(false);

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
        if (translation || synonym) {
          speakChain([
            { text: word },
            { text: translation, lang: selectedLang.code },
            { text: synonym },
          ]);
        }
      })
      .catch(() => {
        setAddTranslationError(true);
      })
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

      // Input mode captures all keys
      if (recallMode) {
        // ← exits input mode (only when not typing in textarea)
        if (e.key === 'ArrowLeft' && !inInput) {
          setRecallMode(false); setRecallDiff(null); setRecallInput('');
          setCustomQuestionOpen(false); setCustomQuestion(''); setCustomAnswer(null);
          e.preventDefault(); return;
        }
        // 8 = hear literary translation of current line
        if ((e.key === '8' || e.code === 'Numpad8') && !inInput) {
          const t = recallHintLiterary || recallHintLiteral;
          if (t) { speak(t, { lang: selectedLang.code }); announceToNvda(t); }
          e.preventDefault(); return;
        }
        // 5 = hear literal translation of current line
        if ((e.key === '5' || e.code === 'Numpad5') && !inInput) {
          if (recallHintLiteral) { speak(recallHintLiteral, { lang: selectedLang.code }); announceToNvda(recallHintLiteral); }
          e.preventDefault(); return;
        }
        // 0 = toggle custom question panel
        if ((e.key === '0' || e.code === 'Numpad0') && !inInput) {
          setCustomQuestionOpen(open => {
            const next = !open;
            if (next) setTimeout(() => customQuestionRef.current?.focus(), 50);
            else setTimeout(() => recallTextareaRef.current?.focus(), 50);
            return next;
          });
          e.preventDefault(); return;
        }
        // 2 = hear custom answer (always English)
        if ((e.key === '2' || e.code === 'Numpad2') && !inInput) {
          if (customAnswer) speak(customAnswer, { lang: 'en' });
          e.preventDefault(); return;
        }
        // Enter / r after result = retry
        if ((e.key === 'Enter' || e.key === 'r' || e.key === 'R') && !inInput && recallDiff !== null) {
          retryRecall(); e.preventDefault(); return;
        }
        // e after result = explain
        if ((e.key === 'e' || e.key === 'E') && !inInput && recallDiff !== null) {
          explainRecall(); e.preventDefault(); return;
        }
        return;
      }

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
      // ── 5 / Numpad5 ── current word + translation
      if (key === '5' || code === 'Numpad5') {
        e.preventDefault();
        const token = wordTokens[currentWordIndex];
        if (token) {
          const word = token.rawWord || token.text;
          const tr5 = glossWordCache.current.get(`${currentParagraphIndex}::en`)?.get(word.toLowerCase()) ?? '';
          speak(word);
          if (tr5) {
            const delay5 = Math.max(700, Math.round(word.length * 110 / ttsRate));
            setTimeout(() => speak(tr5, { lang: 'en' }), delay5);
          }
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
      // ── 7 / Numpad7 ── previous verse line (poetry) / previous paragraph (prose)
      if (key === '7' || code === 'Numpad7') {
        e.preventDefault();
        const para7 = paragraphs[currentParagraphIndex];
        if (para7?.text.includes('\n')) {
          const { lineIndex } = lineIndexAtWord(para7.text, currentWordIndex);
          if (lineIndex > 0) {
            const newIdx = firstWordOfLine(para7.text, lineIndex - 1);
            setCurrentWordIndex(newIdx);
            saveProgress(chapterNum, currentParagraphIndex, newIdx);
            speak(lineAtWord(para7.text, newIdx));
          } else {
            const prevPara = paragraphs[currentParagraphIndex - 1];
            goToParagraph(currentParagraphIndex - 1, false);
            if (prevPara) speak(lineAtWord(prevPara.text, 0));
          }
        } else {
          goToParagraph(currentParagraphIndex - 1, true);
        }
        return;
      }
      // ── 8 / Numpad8 ── current sentence (line)
      if (key === '8' || code === 'Numpad8') {
        e.preventDefault();
        readCurrentLine();
        return;
      }
      // ── 9 / Numpad9 ── next verse line (poetry) / next paragraph (prose)
      if (key === '9' || code === 'Numpad9') {
        e.preventDefault();
        const para9 = paragraphs[currentParagraphIndex];
        if (para9?.text.includes('\n')) {
          const { lineIndex, totalLines } = lineIndexAtWord(para9.text, currentWordIndex);
          if (lineIndex < totalLines - 1) {
            const newIdx = firstWordOfLine(para9.text, lineIndex + 1);
            setCurrentWordIndex(newIdx);
            saveProgress(chapterNum, currentParagraphIndex, newIdx);
            speak(lineAtWord(para9.text, newIdx));
          } else {
            const nextPara = paragraphs[currentParagraphIndex + 1];
            goToParagraph(currentParagraphIndex + 1, false);
            if (nextPara) speak(lineAtWord(nextPara.text, 0));
          }
        } else {
          goToParagraph(currentParagraphIndex + 1, true);
        }
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
      // ── l ── literary translation of current line
      if (key === 'l' || key === 'L') {
        e.preventDefault();
        const para = paragraphs[currentParagraphIndex];
        if (!para) return;
        const line = lineAtWord(para.text, currentWordIndex);
        if (!line) return;
        const cacheKey = `${line}::${selectedLang.name}`;
        const cached = lineLiteraryCache.current.get(cacheKey);
        if (cached !== undefined) {
          speak(cached, { lang: selectedLang.code });
          announceToNvda(cached);
          return;
        }
        api.words.translateParagraph(line, selectedLang.name, book.language, false)
          .then(r => {
            lineLiteraryCache.current.set(cacheKey, r.translation);
            speak(r.translation, { lang: selectedLang.code });
            announceToNvda(r.translation);
          })
          .catch(() => speak('Translation unavailable', { lang: 'en' }));
        return;
      }
      // ── s ── toggle speed between 1.0× and 1.5×
      if (key === 's' || key === 'S') {
        e.preventDefault();
        const nextRate = ttsRate === 1.5 ? 1.0 : 1.5;
        onRateToggle?.();
        showStatus(`Speed: ${nextRate.toFixed(1)}×`);
        speak(`Speed ${nextRate.toFixed(1)}`, { lang: 'en' });
        return;
      }
      // ── → ── enter input mode
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        enterRecall();
        return;
      }
      // ── r / R ── enter input mode (alias)
      if (key === 'r' || key === 'R') {
        e.preventDefault();
        enterRecall();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    addState, searchMode, searchMatches, clampedSearchIdx,
    currentWordIndex, currentLetterIndex, currentParagraphIndex, paragraphs,
    wordTokens, chapterNum, showPhonemeHints,
    readCurrentLine, goToWord, goToParagraph, goToChapter,
    openAddFlashcard, submitFlashcard, speak, stop, analyzeGrammar,
    recallMode, recallDiff, recallHintLiterary, recallHintLiteral, selectedLang.code, selectedLang.name,
    retryRecall, explainRecall, enterRecall, announceToNvda,
    customQuestionOpen, customAnswer, submitCustomQuestion,
    saveProgress, book.language, ttsRate, onRateToggle, showStatus,
  ]);

  const renderParagraph = (para: Paragraph, paraIdx: number) => {
    const isCurrent = paraIdx === currentParagraphIndex;
    const paraTokens = allTokens[paraIdx] ?? [];

    return (
      <div
        key={para.id}
        ref={isCurrent ? currentParaRef : null}
        className={`px-4 py-3 rounded-lg mb-2 text-xl leading-relaxed transition-colors ${
          isCurrent
            ? 'bg-slate-800 border-l-4 border-amber-500'
            : 'bg-transparent hover:bg-slate-900 border-l-4 border-transparent'
        }`}
        style={para.text.includes('\n') ? { whiteSpace: 'pre-line' } : undefined}
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
      {/* NVDA aria-live region — visually hidden, read by screen readers */}
      <div
        aria-live="assertive"
        aria-atomic="true"
        lang={selectedLang.code}
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        {nvdaAnnounce}
      </div>

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
        {(() => {
          const para = paragraphs[currentParagraphIndex];
          if (para?.text.includes('\n')) {
            const { lineIndex, totalLines } = lineIndexAtWord(para.text, currentWordIndex);
            return <>
              <span>Stanza {currentParagraphIndex + 1}/{paragraphs.length}</span>
              <span className="text-slate-400">Line {lineIndex + 1}/{totalLines}</span>
            </>;
          }
          return <span>Para {currentParagraphIndex + 1}/{paragraphs.length}</span>;
        })()}
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
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {recallMode ? (
          /* Input mode — replaces the reading pane */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.25rem', gap: '1rem' }}>
            {/* Translation hints at top — literary + literal */}
            <div style={{ background: '#1e293b', borderRadius: '0.5rem', padding: '1rem', flexShrink: 0 }}>
              <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                {selectedLang.label} — press 8 to hear
              </p>
              {/* Literary */}
              <p style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Literary</p>
              {recallHintLoading ? (
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Translating…</p>
              ) : recallHintLiterary ? (
                <p style={{ color: '#e2e8f0', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '0.75rem' }} aria-live="polite">{recallHintLiterary}</p>
              ) : (
                <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Unavailable</p>
              )}
              {/* Literal */}
              <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
                <p style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Literal</p>
                {recallHintLoading ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Translating…</p>
                ) : recallHintLiteral ? (
                  <p style={{ color: '#cbd5e1', fontSize: '1.0rem', lineHeight: 1.65, fontStyle: 'italic' }}>{recallHintLiteral}</p>
                ) : (
                  <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem' }}>Unavailable</p>
                )}
              </div>
            </div>

            {/* Custom question panel */}
            {customQuestionOpen && (
              <div style={{ background: '#1e1b4b', border: '1px solid #3730a3', borderRadius: '0.5rem', padding: '1rem', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ color: '#818cf8', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Custom question — Enter to send · 8 literary · 5 literal · 2 hear answer · 0 close
                </p>
                <textarea
                  ref={customQuestionRef}
                  value={customQuestion}
                  onChange={e => setCustomQuestion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCustomQuestion(); }
                    if (e.key === 'Escape') { e.preventDefault(); setCustomQuestionOpen(false); setTimeout(() => recallTextareaRef.current?.focus(), 50); }
                    if (e.key === '8') { e.preventDefault(); const t = recallHintLiterary || recallHintLiteral; if (t) { speak(t, { lang: selectedLang.code }); announceToNvda(t); } }
                    if (e.key === '5') { e.preventDefault(); if (recallHintLiteral) { speak(recallHintLiteral, { lang: selectedLang.code }); announceToNvda(recallHintLiteral); } }
                    if (e.key === '2') { e.preventDefault(); if (customAnswer) speak(customAnswer, { lang: 'en' }); }
                  }}
                  rows={2}
                  placeholder="Ask anything about this sentence…"
                  style={{ background: '#1e1035', border: '1px solid #4338ca', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#e0e7ff', fontSize: '0.95rem', resize: 'none', outline: 'none' }}
                  aria-label="Custom question about this sentence"
                />
                {customAnswerLoading && (
                  <p style={{ color: '#818cf8', fontSize: '0.85rem' }} aria-live="polite">Thinking…</p>
                )}
                {customAnswer && !customAnswerLoading && (
                  <div style={{ background: '#1e1035', borderRadius: '0.375rem', padding: '0.75rem', borderLeft: '3px solid #6366f1' }}>
                    <p style={{ color: '#c7d2fe', fontSize: '0.95rem', lineHeight: 1.65, whiteSpace: 'pre-line' }} aria-live="polite">{customAnswer}</p>
                  </div>
                )}
              </div>
            )}

            {recallDiff === null ? (
              /* Typing area */
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.75rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }} htmlFor="recall-input">
                  Type the English text from memory
                </label>
                <textarea
                  id="recall-input"
                  ref={recallTextareaRef}
                  value={recallInput}
                  onChange={e => setRecallInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitRecall(); }
                    if (e.key === '8') { e.preventDefault(); const t = recallHintLiterary || recallHintLiteral; if (t) { speak(t, { lang: selectedLang.code }); announceToNvda(t); } }
                    if (e.key === '5') { e.preventDefault(); if (recallHintLiteral) { speak(recallHintLiteral, { lang: selectedLang.code }); announceToNvda(recallHintLiteral); } }
                    if (e.key === '2') { e.preventDefault(); if (customAnswer) speak(customAnswer, { lang: 'en' }); }
                    if (e.key === '0') { e.preventDefault(); setCustomQuestionOpen(open => { const next = !open; if (next) setTimeout(() => customQuestionRef.current?.focus(), 50); else setTimeout(() => recallTextareaRef.current?.focus(), 50); return next; }); }
                  }}
                  rows={5}
                  placeholder="Type from memory…"
                  style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', color: '#f1f5f9', fontSize: '1.1rem', lineHeight: 1.65, resize: 'none', outline: 'none', flex: 1 }}
                  aria-label="Type the sentence from memory. Press Enter to check, 8 to hear Ukrainian hint."
                />
                <p style={{ color: '#475569', fontSize: '0.75rem' }}>
                  Enter to check · 8 to hear {selectedLang.label} · ← to go back
                </p>
              </div>
            ) : (
              /* Result */
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <RecallResults
                  diff={recallDiff}
                  explanation={recallExplanation}
                  explainLoading={recallExplainLoading}
                  onRetry={retryRecall}
                  onExplain={explainRecall}
                  onHear={() => speak(recallSentence)}
                  onClose={() => { setRecallMode(false); setRecallDiff(null); setRecallInput(''); }}
                />
                <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.75rem' }}>
                  Enter to retry · ← to go back · 8 to hear {selectedLang.label}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Normal reading pane */
          <div style={{ padding: '1rem' }} lang={book.language}>
            {isLoading ? (
              <div className="text-slate-500 text-center py-8">Loading...</div>
            ) : (
              paragraphs.map((para, idx) => renderParagraph(para, idx))
            )}
          </div>
        )}
      </div>

      {/* Keyboard shortcut bar */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0">
        {recallMode ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="text-amber-500 font-semibold mr-1">Input:</span>
            <span><kbd className="bg-slate-700 px-1 rounded">8</kbd> literary</span>
            <span><kbd className="bg-slate-700 px-1 rounded">5</kbd> literal</span>
            <span><kbd className="bg-slate-700 px-1 rounded">Enter</kbd> check / retry</span>
            <span><kbd className="bg-slate-700 px-1 rounded">e</kbd> explain</span>
            <span><kbd className="bg-slate-700 px-1 rounded">0</kbd> question</span>
            <span><kbd className="bg-slate-700 px-1 rounded">2</kbd> hear answer</span>
            <span><kbd className="bg-slate-700 px-1 rounded">←</kbd> back to text</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span><kbd className="bg-slate-700 px-1 rounded">1</kbd>/<kbd className="bg-slate-700 px-1 rounded">2</kbd>/<kbd className="bg-slate-700 px-1 rounded">3</kbd> prev/this/next letter</span>
            <span><kbd className="bg-slate-700 px-1 rounded">4</kbd>/<kbd className="bg-slate-700 px-1 rounded">5</kbd>/<kbd className="bg-slate-700 px-1 rounded">6</kbd> prev/this/next word</span>
            <span><kbd className="bg-slate-700 px-1 rounded">7</kbd>/<kbd className="bg-slate-700 px-1 rounded">8</kbd>/<kbd className="bg-slate-700 px-1 rounded">9</kbd> prev/this/next line</span>
            <span><kbd className="bg-slate-700 px-1 rounded">l</kbd> translate · <kbd className="bg-slate-700 px-1 rounded">s</kbd> speed · <kbd className="bg-slate-700 px-1 rounded">0</kbd> flashcard · <kbd className="bg-slate-700 px-1 rounded">f</kbd> search · <kbd className="bg-slate-700 px-1 rounded">g</kbd> grammar</span>
            <span><kbd className="bg-slate-700 px-1 rounded">[</kbd>/<kbd className="bg-slate-700 px-1 rounded">]</kbd> prev/next chapter · <kbd className="bg-slate-700 px-1 rounded">→</kbd> input mode · <kbd className="bg-slate-700 px-1 rounded">Ctrl</kbd> stop</span>
          </div>
        )}
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
                {addTranslationError && (
                  <p className="text-xs text-red-400 bg-red-900/20 px-3 py-1.5 rounded">
                    Auto-translation unavailable — check the Groq API key or type manually.
                  </p>
                )}
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
