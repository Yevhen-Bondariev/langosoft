import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, Category, Chapter, Paragraph } from '../types';
import { api } from '../services/api';
import CategoryPicker from './CategoryPicker';
import { tokenizeParagraph, getWordTokens } from '../utils/tokenize';
import { useTTS } from '../hooks/useTTS';
import { phonemeHints, type PhonemeHint } from '../utils/phonemes';
import type { LanguageOption } from '../hooks/useLanguagePreference';
import { grammarRules } from '../utils/grammarRules';
import { lineAtWord, lineIndexAtWord, firstWordOfLine, wordDiff, recallScore, type DiffSegment } from '../utils/recall';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { useLongPress } from '../hooks/useLongPress';
import { MobileActionBar } from './MobileActionBar';

// Normalize a word for gloss cache lookup: lowercase + strip diacritics + strip apostrophes.
// Groq strips accents (più→piu, è→e) and apostrophes (v'intrai→vintrai, com'→com),
// so we apply the same transforms on both the cache key and the lookup word.
const normWord = (w: string) =>
  w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['''’`]/g, '');

const LANG_NAMES: Record<string, string> = {
  en: 'English', it: 'Italian', fr: 'French', de: 'German',
  es: 'Spanish', uk: 'Ukrainian', ru: 'Russian', pl: 'Polish',
  pt: 'Portuguese', la: 'Latin', el: 'Greek', nl: 'Dutch',
  ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  tr: 'Turkish', he: 'Hebrew',
};

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
  onExplain?: () => void;
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
        {!explanation && !explainLoading && onExplain && (
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
  categories: Category[];
  onCategoriesChange: (cats: Category[]) => void;
  showPhonemeHints: boolean;
  selectedVoice?: SpeechSynthesisVoice | null;
  selectedLang: LanguageOption;
  ttsRate?: number;
  onRateToggle?: () => void;
  onRateChange?: (delta: number) => void;
  isMobile?: boolean;
  onOpenSidebar?: () => void;
}

interface AddFlashcardState {
  word: string;
  context: string;
  wordIndex: number;
  paragraphIndex: number;
  chapterNumber: number;
}

export default function Reader({ book, chapters, chapterNum, onChapterChange, onFlashcardsChange, categories, onCategoriesChange, showPhonemeHints, selectedVoice, selectedLang, ttsRate = 0.9, onRateToggle, onRateChange, isMobile = false, onOpenSidebar }: Props) {
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
  const [addCategoryId, setAddCategoryId] = useState<number | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addTranslationError, setAddTranslationError] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [currentHint, setCurrentHint] = useState<PhonemeHint | null>(null);
  const [currentWordGloss, setCurrentWordGloss] = useState<string>('');
  const [, setGlossLoading] = useState(false);
  const [glossCacheVersion, setGlossCacheVersion] = useState(0);
  const glossFetchingRef = useRef<Set<string>>(new Set());
  const [grammarTenses, setGrammarTenses] = useState<string[] | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [selectedTense, setSelectedTense] = useState<string | null>(null);
  const grammarCache = useRef<Map<number, string[]>>(new Map());

  const [recallMode, setRecallMode] = useState(false);
  // true = see original, type translation (default); false = see translation hints, type original
  const [recallToTranslation, setRecallToTranslation] = useState(true);
  const [recallSentence, setRecallSentence] = useState('');
  const [recallInput, setRecallInput] = useState('');
  const [recallDiff, setRecallDiff] = useState<DiffSegment[] | null>(null);
  const [recallExplanation, setRecallExplanation] = useState<string | null>(null);
  const [recallExplainLoading, setRecallExplainLoading] = useState(false);
  // Translation mode: AI evaluator result (replaces wordDiff when recallToTranslation = true)
  const [translationFeedback, setTranslationFeedback] = useState<string | null>(null);
  const [translationFeedbackLoading, setTranslationFeedbackLoading] = useState(false);
  const recallTextareaRef = useRef<HTMLTextAreaElement>(null);
  const customQuestionRef = useRef<HTMLTextAreaElement>(null);
  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  const readingPaneRef = useRef<HTMLDivElement>(null);
  const currentTouchWordIdxRef = useRef<number | null>(null);
  const [customQuestionOpen, setCustomQuestionOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState<string | null>(null);
  const [customAnswerLoading, setCustomAnswerLoading] = useState(false);

  const [showFlowGuide, setShowFlowGuide] = useState(false);
  const [showKeyboardRef, setShowKeyboardRef] = useState(false);

  const lineLiteraryCache = useRef<Map<string, string>>(new Map());
  // Per-word translation cache: "${paraIdx}::en" → Map<normWord, translation> (filled by API/DB)
  const glossWordCache = useRef<Map<string, Map<string, string>>>(new Map());
  // Flat word dictionary loaded from public/gloss-{lang}.json: normWord → english (covers whole book)
  const staticGlossRef = useRef<Map<string, string> | null>(null);
  const [staticGlossLoaded, setStaticGlossLoaded] = useState(false);

  const [wordFreq, setWordFreq] = useState<Record<string, number>>({});
  const maxFreqRef = useRef(1);
  const [showFreqColors, setShowFreqColors] = useState(false);

  // Archaism cache: paragraphId → Map<lowercase-word, explanation>
  const [archaisms, setArchaisms] = useState<Map<string, string>>(new Map());
  const archaismMapRef = useRef<Map<string, string>>(new Map());
  const archaismCache = useRef<Map<number, Map<string, string>>>(new Map());

  const playLineBell = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660; // E5 — soft, unobtrusive
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.015);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = () => void ctx.close();
    } catch { /* AudioContext unavailable */ }
  }, []);

  const playArchaismTone = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880; // A5 — distinct from line bell (E5)
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
      osc.onended = () => void ctx.close();
    } catch { /* AudioContext unavailable */ }
  }, []);

  // Recall-mode hint: translations of the specific line being recalled (not the full paragraph)
  const [recallHintLiterary, setRecallHintLiterary] = useState('');
  const [recallHintLiteral, setRecallHintLiteral] = useState('');
  const [recallHintLoading, setRecallHintLoading] = useState(false);
  const [nvdaAnnounce, setNvdaAnnounce] = useState('');
  // Pre-tokenize all paragraphs once when the chapter loads (not on every keystroke)
  const allTokens = useMemo(() => paragraphs.map(p => tokenizeParagraph(p.text)), [paragraphs]);
  const tokens = allTokens[currentParagraphIndex] ?? [];
  const wordsPerParagraph = useMemo(() => allTokens.map(t => getWordTokens(t).length), [allTokens]);

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

  // Fetch word frequencies for the whole book once (used for heat-map coloring)
  useEffect(() => {
    api.books.wordFrequencies(book.id).then(freq => {
      maxFreqRef.current = Object.values(freq).reduce((a, b) => Math.max(a, b), 1);
      setWordFreq(freq);
    }).catch(() => {});
  }, [book.id]);

  // Load static flat word dictionary for non-English books (generated once, never changes).
  // File: public/gloss-{lang}.json — flat { normalizedWord: englishTranslation }
  useEffect(() => {
    if (book.language === 'en') return;
    staticGlossRef.current = null;
    setStaticGlossLoaded(false);
    fetch(`${import.meta.env.BASE_URL}gloss-${book.language}.json`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data) {
          staticGlossRef.current = new Map(Object.entries(data));
          setStaticGlossLoaded(true);
        }
      })
      .catch(() => {});
  }, [book.language]);

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

  // Pre-fetch English word-by-word gloss for current paragraph + next two (non-English books only)
  useEffect(() => {
    if (book.language === 'en') { setGlossLoading(false); return; }
    if (staticGlossLoaded) { setGlossLoading(false); return; } // static file covers everything

    const currentCacheKey = `${currentParagraphIndex}::en`;
    setGlossLoading(!glossWordCache.current.has(currentCacheKey));

    const fetchGloss = (idx: number) => {
      const para = paragraphs[idx];
      if (!para) return;
      const cacheKey = `${idx}::en`;
      if (glossWordCache.current.has(cacheKey)) return;
      if (glossFetchingRef.current.has(cacheKey)) return;

      glossFetchingRef.current.add(cacheKey);
      api.paragraphs.gloss(para.id, 'English')
        .then(r => {
          const map = new Map<string, string>();
          try {
            const obj = JSON.parse(r.gloss) as Record<string, string>;
            for (const [word, tr] of Object.entries(obj)) {
              if (typeof tr === 'string') map.set(normWord(word), tr);
            }
          } catch {
            r.gloss.split(';').forEach(entry => {
              const dash = entry.search(/\s[—–]\s/);
              if (dash > 0) map.set(normWord(entry.slice(0, dash).trim()), entry.slice(dash + 3).trim());
            });
          }
          if (map.size > 0) {
            glossWordCache.current.set(cacheKey, map);
            setGlossCacheVersion(v => v + 1);
          }
          if (cacheKey === currentCacheKey) setGlossLoading(false);
        })
        .catch(() => {
          if (cacheKey === currentCacheKey) setGlossLoading(false);
        })
        .finally(() => { glossFetchingRef.current.delete(cacheKey); });
    };

    fetchGloss(currentParagraphIndex);
    // Pre-fetch next two paragraphs with a small delay so the current one gets priority
    const t1 = setTimeout(() => fetchGloss(currentParagraphIndex + 1), 500);
    const t2 = setTimeout(() => fetchGloss(currentParagraphIndex + 2), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [currentParagraphIndex, paragraphs, book.language, staticGlossLoaded]);

  // Bulk pre-fetch gloss for all paragraphs in the current chapter (staggered to avoid rate limits)
  useEffect(() => {
    if (book.language === 'en' || paragraphs.length === 0) return;
    if (staticGlossLoaded) return; // static file covers everything — no Groq calls needed
    const timers: ReturnType<typeof setTimeout>[] = [];
    paragraphs.forEach((para, idx) => {
      const cacheKey = `${idx}::en`;
      if (glossWordCache.current.has(cacheKey)) return;
      const t = setTimeout(() => {
        if (glossFetchingRef.current.has(cacheKey) || glossWordCache.current.has(cacheKey)) return;
        glossFetchingRef.current.add(cacheKey);
        api.paragraphs.gloss(para.id, 'English')
          .then(r => {
            const map = new Map<string, string>();
            try {
              const obj = JSON.parse(r.gloss) as Record<string, string>;
              for (const [word, tr] of Object.entries(obj)) {
                if (typeof tr === 'string') map.set(normWord(word), tr);
              }
            } catch {
              r.gloss.split(';').forEach(entry => {
                const dash = entry.search(/\s[—–]\s/);
                if (dash > 0) map.set(normWord(entry.slice(0, dash).trim()), entry.slice(dash + 3).trim());
              });
            }
            if (map.size > 0) {
              glossWordCache.current.set(cacheKey, map);
              setGlossCacheVersion(v => v + 1);
            }
          })
          .catch(() => {})
          .finally(() => { glossFetchingRef.current.delete(cacheKey); });
      }, idx * 80); // stagger: 80ms between each
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [paragraphs, book.language, staticGlossLoaded]);

  // Reactively refresh displayed gloss when the cache populates (gloss arrives after navigation)
  useEffect(() => {
    if (book.language === 'en') { setCurrentWordGloss(''); return; }
    const tokens = allTokens[currentParagraphIndex] ?? [];
    const wTokens = getWordTokens(tokens);
    const token = wTokens[currentWordIndex];
    const word = token?.rawWord || token?.text || '';
    const norm = word ? normWord(word) : '';
    const fromCache = norm ? glossWordCache.current.get(`${currentParagraphIndex}::en`)?.get(norm) : undefined;
    const fromStatic = norm ? staticGlossRef.current?.get(norm) : undefined;
    setCurrentWordGloss(fromCache ?? fromStatic ?? '');
  }, [currentWordIndex, currentParagraphIndex, allTokens, book.language, glossCacheVersion, staticGlossLoaded]);

  // Fetch archaism annotations for the current paragraph (non-English books only, cached per paragraphId)
  useEffect(() => {
    if (book.language === 'en') return;
    const para = paragraphs[currentParagraphIndex];
    if (!para) return;
    const cached = archaismCache.current.get(para.id);
    if (cached !== undefined) {
      archaismMapRef.current = cached;
      setArchaisms(cached);
      return;
    }
    api.paragraphs.archaisms(para.id)
      .then(r => {
        const map = new Map<string, string>();
        try {
          const obj = JSON.parse(r.archaisms) as Record<string, string>;
          for (const [word, explanation] of Object.entries(obj)) {
            if (typeof explanation === 'string') map.set(word.toLowerCase(), explanation);
          }
        } catch {}
        archaismCache.current.set(para.id, map);
        archaismMapRef.current = map;
        setArchaisms(map);
      })
      .catch(() => {});
  }, [currentParagraphIndex, paragraphs, book.language]);

  const wordTokens = getWordTokens(tokens);
  const totalChapters = chapters.length;
  const currentChapter = chapters.find(c => c.number === chapterNum);
  const currentWordRaw = wordTokens[currentWordIndex]?.rawWord?.toLowerCase() ?? '';
  const currentArchaism = archaisms.get(currentWordRaw) ?? null;
  const bookLangName = LANG_NAMES[book.language] ?? book.language;

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
    setCurrentWordGloss('');
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
      const cacheMap = glossWordCache.current.get(`${currentParagraphIndex}::en`);
      const tr = cacheMap?.get(normWord(word)) ?? staticGlossRef.current?.get(normWord(word)) ?? '';
      setCurrentWordGloss(tr);
      if (archaismMapRef.current.has(word.toLowerCase())) playArchaismTone();
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
  }, [wordTokens, speak, ttsRate, chapterNum, currentParagraphIndex, saveProgress, showPhonemeHints, playArchaismTone]);

  const analyzeGrammar = useCallback(async () => {
    // Toggle off if already showing for this paragraph
    if (grammarTenses !== null) {
      setGrammarTenses(null);
      setSelectedTense(null);
      return;
    }
    const para = paragraphs[currentParagraphIndex];
    if (!para) return;

    // Use cache if available (only non-empty results are cached)
    const cached = grammarCache.current.get(currentParagraphIndex);
    if (cached) {
      setGrammarTenses(cached);
      setSelectedTense(cached[0] ?? null);
      return;
    }

    setGrammarLoading(true);
    try {
      const result = await api.grammar.analyze(para.text, book.language);
      const tenses = result.tenses;
      if (tenses.length > 0) grammarCache.current.set(currentParagraphIndex, tenses);
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
    setTranslationFeedback(null);
    setCustomQuestionOpen(false);
    setCustomQuestion('');
    setCustomAnswer(null);
    setRecallHintLiterary('');
    setRecallHintLiteral('');
    setRecallToTranslation(true);
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
    if (recallToTranslation) {
      // Translation mode: AI evaluates the meaning, not exact words
      if (!recallSentence) return;
      setTranslationFeedbackLoading(true);
      api.words.evaluateTranslation(recallSentence, recallInput, book.language, selectedLang.name)
        .then(r => {
          const feedback = r.feedback || 'Unable to evaluate — no AI response.';
          setTranslationFeedback(feedback);
          if (feedback.startsWith('Correct')) {
            playSuccess();
            setTimeout(() => speak('Correct!'), 350);
          } else {
            playFailure();
            setTimeout(() => speak(feedback, { lang: 'en' }), 400);
          }
        })
        .catch(() => {
          setTranslationFeedback('Evaluation failed — check your connection.');
          playFailure();
        })
        .finally(() => setTranslationFeedbackLoading(false));
    } else {
      // Recall mode: exact word-diff against the original Italian
      const target = recallSentence;
      if (!target) return;
      const diff = wordDiff(target, recallInput);
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
    }
  }, [recallSentence, recallInput, speak, recallToTranslation, book.language, selectedLang.name]);

  const retryRecall = useCallback(() => {
    setRecallDiff(null);
    setRecallExplanation(null);
    setTranslationFeedback(null);
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
    setAddCategoryId(null);
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

  // Long-press on word tokens → open flashcard (mobile)
  const longPressHandlers = useLongPress(() => {
    if (currentTouchWordIdxRef.current !== null) openAddFlashcard(currentTouchWordIdxRef.current);
  });

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
        categoryId: addCategoryId,
      });
      onFlashcardsChange();
      showStatus(`"${addState.word}" saved`);
      speak(`${addState.word} saved`);
    } catch {
      showStatus('Failed to save');
    }
    setAddState(null);
    setTimeout(() => currentWordRef.current?.focus(), 0);
  }, [addState, addTranslation, addSynonym, addCategoryId, book.id, onFlashcardsChange, showStatus, speak]);

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

      // h = keyboard reference (global — works from reading, recall, and flow guide)
      if ((e.key === 'h' || e.key === 'H') && !inInput) {
        e.preventDefault();
        setShowKeyboardRef(prev => !prev);
        return;
      }

      if (showKeyboardRef) {
        if (e.key === 'Escape') { setShowKeyboardRef(false); e.preventDefault(); setTimeout(() => currentWordRef.current?.focus(), 0); return; }
        if (e.key !== 'Tab') e.preventDefault();
        return;
      }

      // Flow guide popup — Escape closes it, Tab passes through, everything else blocked
      if (showFlowGuide) {
        if (e.key === 'Escape') { setShowFlowGuide(false); e.preventDefault(); setTimeout(() => currentWordRef.current?.focus(), 0); return; }
        if (e.key !== 'Tab') e.preventDefault();
        return;
      }

      // Input mode captures all keys
      if (recallMode) {
        // ← exits input mode (only when not typing in textarea)
        if (e.key === 'ArrowLeft' && !inInput) {
          setRecallMode(false); setRecallDiff(null); setRecallInput('');
          setTranslationFeedback(null);
          setCustomQuestionOpen(false); setCustomQuestion(''); setCustomAnswer(null);
          e.preventDefault(); return;
        }
        // 8 = in translation mode: hear original; in recall mode: hear literary hint
        if ((e.key === '8' || e.code === 'Numpad8') && !inInput) {
          if (recallToTranslation) {
            speak(recallSentence); announceToNvda(recallSentence);
          } else {
            const t = recallHintLiterary || recallHintLiteral;
            if (t) { speak(t, { lang: selectedLang.code }); announceToNvda(t); }
          }
          e.preventDefault(); return;
        }
        // 5 = in translation mode: hear literary (model answer); in recall mode: hear literal
        if ((e.key === '5' || e.code === 'Numpad5') && !inInput) {
          if (recallToTranslation) {
            if (recallHintLiterary) { speak(recallHintLiterary, { lang: selectedLang.code }); announceToNvda(recallHintLiterary); }
          } else {
            if (recallHintLiteral) { speak(recallHintLiteral, { lang: selectedLang.code }); announceToNvda(recallHintLiteral); }
          }
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
        if ((e.key === 'Enter' || e.key === 'r' || e.key === 'R') && !inInput && (recallDiff !== null || translationFeedback !== null)) {
          retryRecall(); e.preventDefault(); return;
        }
        // e after exact-diff result = explain (not available in translation mode)
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
      if (e.key === 'Control' && !e.altKey && !e.shiftKey && !e.metaKey) {
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
      // ── 5 / Numpad5 ── current word + translation (chain: Italian → English immediately after)
      if (key === '5' || code === 'Numpad5') {
        e.preventDefault();
        const token = wordTokens[currentWordIndex];
        if (token) {
          const word = token.rawWord || token.text;
          const tr5 = glossWordCache.current.get(`${currentParagraphIndex}::en`)?.get(normWord(word))
            ?? staticGlossRef.current?.get(normWord(word)) ?? '';
          if (tr5 && book.language !== 'en') {
            speakChain([{ text: word, lang: book.language }, { text: tr5, lang: 'en' }]);
          } else {
            speak(word);
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
          // Play a soft bell when landing on the last word of a verse line (poetry only)
          const para = paragraphs[currentParagraphIndex];
          if (para?.text.includes('\n')) {
            const { lineIndex: nxt } = lineIndexAtWord(para.text, currentWordIndex + 1);
            const { lineIndex: nxt2 } = lineIndexAtWord(para.text, currentWordIndex + 2);
            if (nxt2 > nxt) playLineBell();
          }
          goToWord(currentWordIndex + 1);
        } else if (currentParagraphIndex < paragraphs.length - 1) {
          const nextIdx = currentParagraphIndex + 1;
          const nextPara = paragraphs[nextIdx];
          goToParagraph(nextIdx, false);
          if (nextPara) {
            const m = nextPara.text.match(/[\p{L}''\-]+/u);
            if (m) {
              const word = m[0];
              const tr = staticGlossRef.current?.get(normWord(word)) ?? '';
              speak(word);
              if (tr && book.language !== 'en') {
                const delay = Math.max(700, Math.round(word.length * 110 / ttsRate));
                setTimeout(() => speak(tr, { lang: 'en' }), delay);
              }
            }
          }
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
      // ── a ── hear archaism explanation for current word
      if (key === 'a' || key === 'A') {
        e.preventDefault();
        if (currentArchaism) {
          speak(currentArchaism, { lang: 'en' });
          announceToNvda(currentArchaism);
        }
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
      // ── Delete ── speak Longfellow (literary) translation of current stanza
      if (key === 'Delete') {
        e.preventDefault();
        const para = paragraphs[currentParagraphIndex];
        if (para?.longfellowText) {
          speak(para.longfellowText, { lang: 'en' });
          announceToNvda(para.longfellowText);
        }
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
      // ── ↑ / ↓ ── fine-grained speed control
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onRateChange?.(0.1);
        const next = Math.round(Math.min(2.0, ttsRate + 0.1) * 10) / 10;
        showStatus(`Speed: ${next.toFixed(1)}×`);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onRateChange?.(-0.1);
        const next = Math.round(Math.max(0.3, ttsRate - 0.1) * 10) / 10;
        showStatus(`Speed: ${next.toFixed(1)}×`);
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
    recallMode, recallToTranslation, recallDiff, recallHintLiterary, recallHintLiteral, recallSentence, selectedLang.code, selectedLang.name,
    translationFeedback, retryRecall, explainRecall, enterRecall, announceToNvda,
    customQuestionOpen, customAnswer, submitCustomQuestion,
    saveProgress, book.language, ttsRate, onRateToggle, onRateChange, showStatus,
    showFlowGuide, showKeyboardRef, playLineBell, currentArchaism, playArchaismTone,
  ]);

  // Swipe gestures for mobile reading pane
  const swipeOptions = useMemo(() => ({
    onSwipeLeft: () => {
      if (currentWordIndex < wordTokens.length - 1) goToWord(currentWordIndex + 1);
      else if (currentParagraphIndex < paragraphs.length - 1) goToParagraph(currentParagraphIndex + 1, true);
    },
    onSwipeRight: () => {
      if (currentWordIndex > 0) goToWord(currentWordIndex - 1);
      else if (currentParagraphIndex > 0) goToParagraph(currentParagraphIndex - 1);
    },
    onSwipeUp: () => goToParagraph(currentParagraphIndex + 1, true),
    onSwipeDown: () => goToParagraph(currentParagraphIndex - 1),
    onDoubleTap: () => openAddFlashcard(),
  }), [currentWordIndex, wordTokens.length, currentParagraphIndex, paragraphs.length, goToWord, goToParagraph, openAddFlashcard]);

  useSwipeGesture(readingPaneRef, swipeOptions, !recallMode);

  const freqColor = (rawWord: string): string | undefined => {
    const max = maxFreqRef.current;
    if (!showFreqColors || max <= 1 || !Object.keys(wordFreq).length) return undefined;
    const count = wordFreq[normWord(rawWord)];
    if (!count) return undefined;
    const t = Math.log(count + 1) / Math.log(max + 1);
    const hue = Math.round(220 * (1 - t));
    return `hsl(${hue}, 70%, 65%)`;
  };

  const renderParagraph = (para: Paragraph, paraIdx: number) => {
    const isCurrent = paraIdx === currentParagraphIndex;
    const paraTokens = allTokens[paraIdx] ?? [];
    const isPoetryNonEn = para.text.includes('\n') && book.language !== 'en';

    const outerClass = `px-4 py-3 rounded-lg mb-2 transition-colors ${
      isCurrent
        ? 'bg-slate-800 border-l-4 border-amber-500'
        : 'bg-transparent hover:bg-slate-900 border-l-4 border-transparent'
    }`;
    const outerClick = () => {
      setCurrentParagraphIndex(paraIdx);
      setCurrentWordIndex(0);
      saveProgress(chapterNum, paraIdx, 0);
    };

    const renderWordSpan = (token: (typeof paraTokens)[number], origTi: number) => {
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
      const isArchaic = archaisms.has(token.rawWord.toLowerCase());
      return (
        <span
          key={origTi}
          ref={isCurrentWord ? currentWordRef : null}
          role="button"
          tabIndex={isCurrentWord ? 0 : -1}
          className={`word-token ${isCurrentWord ? 'word-current' : ''} ${searchClass} ${hasHint ? 'word-has-hint' : ''} ${isArchaic ? 'word-archaic' : ''}`}
          style={isCurrentWord ? undefined : { color: freqColor(token.rawWord) }}
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
          onTouchStart={e => {
            currentTouchWordIdxRef.current = token.wordIndex;
            longPressHandlers.onTouchStart(e);
          }}
          onTouchEnd={longPressHandlers.onTouchEnd}
          onTouchMove={longPressHandlers.onTouchMove}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (isCurrent && token.wordIndex !== null) {
                setCurrentWordIndex(token.wordIndex);
              } else {
                setCurrentParagraphIndex(paraIdx);
                setCurrentWordIndex(token.wordIndex ?? 0);
                saveProgress(chapterNum, paraIdx, token.wordIndex ?? 0);
              }
            } else if (e.key === ' ') {
              e.preventDefault();
              if (token.wordIndex !== null) openAddFlashcard(token.wordIndex);
            }
          }}
          title={hasHint ? phonemeHints[token.rawWord.toLowerCase()]?.display : 'Double-click or Space/long-press to add to flashcards'}
        >
          {token.text}
        </span>
      );
    };

    // Poetry (Dante) — per-line layout: [Italian] [literal] [Longfellow] for each verse line
    if (isPoetryNonEn) {
      // Word lookup: per-paragraph API cache first, then flat static dict
      const perParaMap = glossWordCache.current.get(`${paraIdx}::en`);
      const lookupEng = (word: string): string => {
        const norm = normWord(word);
        return perParaMap?.get(norm) ?? staticGlossRef.current?.get(norm) ?? '';
      };
      const hasGloss = !!(perParaMap || staticGlossRef.current);
      // Longfellow text is stored as a single stanza with \n separating lines
      const longfellowLines = para.longfellowText?.split('\n') ?? [];

      // Split tokens into verse lines at newline-bearing space tokens
      const lineGroups: Array<Array<{ token: (typeof paraTokens)[number]; origTi: number }>> = [];
      let currentGroup: Array<{ token: (typeof paraTokens)[number]; origTi: number }> = [];
      paraTokens.forEach((token, ti) => {
        if (token.type === 'space' && token.text.includes('\n')) {
          lineGroups.push(currentGroup);
          currentGroup = [];
        } else {
          currentGroup.push({ token, origTi: ti });
        }
      });
      if (currentGroup.length > 0) lineGroups.push(currentGroup);

      return (
        <div key={para.id} ref={isCurrent ? currentParaRef : null}
          className={outerClass} onClick={outerClick} aria-current={isCurrent ? 'true' : undefined}>
          {lineGroups.map((lineItems, li) => {
            const wordItems = lineItems.filter(({ token }) => token.type === 'word');
            const lfLine = longfellowLines[li]?.trim() ?? '';
            return (
              <div key={li} className={li > 0 ? 'mt-3' : ''}>
                {/* Each word paired with its translation in one column — guaranteed alignment */}
                <div className="flex flex-wrap gap-x-3 gap-y-0">
                  {wordItems.map(({ token, origTi }) => {
                    const eng = hasGloss ? lookupEng(token.rawWord) : '';
                    return (
                      <div key={origTi} className="inline-flex flex-col items-start">
                        {renderWordSpan(token, origTi)}
                        {hasGloss && (
                          <span className="text-sky-400 font-mono text-sm leading-tight">
                            {eng || '·'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Longfellow for this specific verse line */}
                {lfLine && (
                  <div className="font-mono text-base leading-snug text-slate-400 italic">
                    {lfLine}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Prose / English — original flat rendering
    return (
      <div key={para.id} ref={isCurrent ? currentParaRef : null}
        className={`${outerClass} text-xl leading-relaxed`}
        onClick={outerClick} aria-current={isCurrent ? 'true' : undefined}>
        {paraTokens.map((token, ti) => {
          if (token.type !== 'word') return <span key={ti}>{token.text}</span>;
          return renderWordSpan(token, ti);
        })}
        {book.language !== 'en' && (() => {
          const glossMap = glossWordCache.current.get(`${paraIdx}::en`);
          const staticMap = staticGlossRef.current;
          const wTokens = getWordTokens(paraTokens);
          const hasLiteral = (glossMap || staticMap) && wTokens.length > 0;
          if (!hasLiteral && !para.longfellowText) return null;
          return (
            <div className="mt-2 space-y-1">
              {hasLiteral && (
                <div className="flex flex-wrap gap-x-2 gap-y-0">
                  {paraTokens.map((token, ti) => {
                    if (token.type !== 'word') return null;
                    const eng = glossMap?.get(normWord(token.rawWord)) ?? staticMap?.get(normWord(token.rawWord)) ?? '';
                    const width = Math.max(token.rawWord.length, eng.length);
                    return (
                      <span key={ti} className="inline-flex items-baseline font-mono text-xs"
                        style={{ minWidth: `${width}ch` }}>
                        <span className="text-sky-400">{eng || '·'}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              {para.longfellowText && (
                <p className="text-slate-500 italic text-sm leading-snug">
                  {para.longfellowText}
                </p>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  const currentWordLetters = wordTokens[currentWordIndex]?.rawWord.split('') ?? [];

  return (
    <div className="flex flex-col h-full">
      <h1 className="sr-only">{book.title} — Chapter {chapterNum}</h1>
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
        {isMobile && (
          <button
            onClick={() => onOpenSidebar?.()}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            ☰
          </button>
        )}
        <button
          onClick={() => goToChapter(chapterNum - 1)}
          disabled={chapterNum <= 0}
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
          aria-label="Previous chapter"
          aria-keyshortcuts="["
        >
          ← Prev
        </button>
        <div className="flex-1 text-center">
          <span className="text-amber-400 font-semibold text-sm">
            {currentChapter?.title || `Chapter ${chapterNum}`}
          </span>
        </div>
        <button
          onClick={() => setShowFlowGuide(true)}
          aria-label="Show recommended reading flow"
          aria-keyshortcuts="?"
          title="How to read"
          className="text-slate-500 hover:text-amber-400 text-base leading-none transition-colors"
        >?</button>
        {Object.keys(wordFreq).length > 0 && (
          <button
            onClick={() => setShowFreqColors(v => !v)}
            title={showFreqColors ? 'Disable word frequency colors' : 'Enable word frequency colors'}
            aria-pressed={showFreqColors}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${showFreqColors ? 'border-sky-600 text-sky-400 bg-sky-900/30' : 'border-slate-600 text-slate-500'}`}
          >freq</button>
        )}
        <button
          onClick={() => goToChapter(chapterNum + 1)}
          disabled={chapterNum >= totalChapters - 1}
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
          aria-label="Next chapter"
          aria-keyshortcuts="]"
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
        {(() => {
          const totalChapterWords = wordsPerParagraph.reduce((a, b) => a + b, 0);
          const wordsBeforeCurrent = wordsPerParagraph.slice(0, currentParagraphIndex).reduce((a, b) => a + b, 0);
          const chapterPct = totalChapterWords > 0
            ? Math.round((wordsBeforeCurrent + currentWordIndex) / totalChapterWords * 100)
            : 0;
          const chapterFraction = totalChapterWords > 0
            ? (wordsBeforeCurrent + currentWordIndex) / totalChapterWords
            : 0;
          const bookPct = book.chapterCount > 0
            ? Math.round((chapterNum + chapterFraction) / book.chapterCount * 100)
            : 0;
          return <span className="text-slate-600">Chapter {chapterPct}% · Book {bookPct}%</span>;
        })()}
        {book.language !== 'en' && !statusMsg && currentWordGloss && (
          <span className="text-sky-400 text-sm ml-auto italic">{currentWordGloss}</span>
        )}
        {statusMsg && <span className="text-amber-400 font-medium ml-auto" aria-live="polite" aria-atomic="true">{statusMsg}</span>}
      </div>

      {/* Phoneme hint panel */}
      {showPhonemeHints && currentHint && (
        <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-800/50 shrink-0 flex items-center gap-3 text-sm" role="status" aria-live="polite">
          <span className="text-amber-300 font-mono font-bold text-base">{currentHint.display}</span>
          <span className="text-amber-700 text-xs" aria-hidden="true">|</span>
          <span className="text-amber-500/80 text-xs font-medium uppercase tracking-wide">{currentHint.category}</span>
          <span className="text-amber-700 text-xs" aria-hidden="true">·</span>
          <span className="text-slate-300 text-xs">{currentHint.tip}</span>
          {isMobile && (
            <button onClick={() => setCurrentHint(null)} className="ml-auto text-amber-700 hover:text-amber-400 text-base leading-none" aria-label="Dismiss phoneme hint">✕</button>
          )}
        </div>
      )}

      {/* Archaism explanation panel */}
      {currentArchaism && (
        <div className="px-4 py-2 bg-violet-950/40 border-b border-violet-800/50 shrink-0 flex items-center gap-3 text-sm" role="status" aria-live="polite">
          <span className="text-violet-400 text-[10px] font-bold uppercase tracking-widest shrink-0">Archaic</span>
          <span className="text-violet-700 text-xs" aria-hidden="true">·</span>
          <span className="text-slate-300 text-xs">{currentArchaism}</span>
          {isMobile ? (
            <button onClick={() => { speak(currentArchaism, { lang: 'en' }); }} className="ml-auto text-violet-400 text-xs px-2 py-0.5 rounded bg-violet-900/40" aria-label="Hear archaism explanation">🔊</button>
          ) : (
            <span className="ml-auto text-violet-700/60 text-[10px]">a = hear</span>
          )}
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
                    aria-pressed={selectedTense === t}
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
              style={{ fontSize: '16px' }}
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
      <div ref={readingPaneRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {recallMode ? (
          /* Input mode — replaces the reading pane */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.25rem', gap: '1rem' }}>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={() => { setRecallToTranslation(true); setRecallDiff(null); setRecallInput(''); setTimeout(() => recallTextareaRef.current?.focus(), 50); }}
                aria-pressed={recallToTranslation}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s',
                  background: recallToTranslation ? '#1d4ed8' : '#1e293b',
                  color: recallToTranslation ? '#bfdbfe' : '#64748b',
                  border: recallToTranslation ? '1px solid #3b82f6' : '1px solid #334155',
                }}
              >{bookLangName} → {selectedLang.label}</button>
              <button
                onClick={() => { setRecallToTranslation(false); setRecallDiff(null); setRecallInput(''); setTimeout(() => recallTextareaRef.current?.focus(), 50); }}
                aria-pressed={!recallToTranslation}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s',
                  background: !recallToTranslation ? '#1d4ed8' : '#1e293b',
                  color: !recallToTranslation ? '#bfdbfe' : '#64748b',
                  border: !recallToTranslation ? '1px solid #3b82f6' : '1px solid #334155',
                }}
              >{selectedLang.label} → {bookLangName}</button>
            </div>

            {/* Hint / prompt panel */}
            <div style={{ background: '#1e293b', borderRadius: '0.5rem', padding: '1rem', flexShrink: 0 }}>
              {recallToTranslation ? (
                /* Translation mode: show the original sentence as the prompt */
                <>
                  <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    {bookLangName} — press 8 to hear
                  </p>
                  <p style={{ color: '#fbbf24', fontSize: '1.1rem', lineHeight: 1.7 }} lang={book.language}>{recallSentence}</p>
                  {recallHintLoading && <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.5rem' }}>Loading hints…</p>}
                  {!recallHintLoading && recallHintLiterary && (
                    <p style={{ color: '#334155', fontSize: '0.7rem', marginTop: '0.5rem' }}>5 to hear the model {selectedLang.label} answer</p>
                  )}
                </>
              ) : (
                /* Recall mode: show Ukrainian translation hints */
                <>
                  <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                    {selectedLang.label} — press 8 to hear
                  </p>
                  <p style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Literary</p>
                  {recallHintLoading ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Translating…</p>
                  ) : recallHintLiterary ? (
                    <p style={{ color: '#e2e8f0', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '0.75rem' }} aria-live="polite">{recallHintLiterary}</p>
                  ) : (
                    <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Unavailable</p>
                  )}
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
                </>
              )}
            </div>

            {/* Custom question panel */}
            {customQuestionOpen && (
              <div style={{ background: '#1e1b4b', border: '1px solid #3730a3', borderRadius: '0.5rem', padding: '1rem', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ color: '#818cf8', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Custom question — Enter to send · 2 hear answer · 0 close
                </p>
                <textarea
                  ref={customQuestionRef}
                  value={customQuestion}
                  onChange={e => setCustomQuestion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCustomQuestion(); }
                    if (e.key === 'Escape') { e.preventDefault(); setCustomQuestionOpen(false); setTimeout(() => recallTextareaRef.current?.focus(), 50); }
                    if (e.key === '8') { e.preventDefault(); if (recallToTranslation) { speak(recallSentence); } else { const t = recallHintLiterary || recallHintLiteral; if (t) { speak(t, { lang: selectedLang.code }); } } }
                    if (e.key === '5') { e.preventDefault(); if (recallToTranslation) { if (recallHintLiterary) speak(recallHintLiterary, { lang: selectedLang.code }); } else { if (recallHintLiteral) speak(recallHintLiteral, { lang: selectedLang.code }); } }
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

            {translationFeedbackLoading ? (
              /* AI evaluating translation */
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#818cf8', fontSize: '0.95rem' }} aria-live="polite">Evaluating translation…</p>
              </div>
            ) : translationFeedback !== null ? (
              /* Translation evaluation result */
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div
                  style={{
                    background: translationFeedback.startsWith('Correct') ? 'rgba(22,101,52,0.35)' : 'rgba(30,27,75,0.6)',
                    border: `1px solid ${translationFeedback.startsWith('Correct') ? 'rgba(74,222,128,0.3)' : 'rgba(99,102,241,0.3)'}`,
                    borderRadius: '0.5rem', padding: '0.875rem',
                  }}
                  role="status" aria-live="polite"
                >
                  <p style={{ color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    AI evaluation
                  </p>
                  <p style={{
                    color: translationFeedback.startsWith('Correct') ? '#86efac' : '#c7d2fe',
                    fontSize: '0.95rem', lineHeight: 1.65, whiteSpace: 'pre-line',
                  }}>
                    {translationFeedback}
                  </p>
                </div>
                <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                  Your answer: <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{recallInput}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={retryRecall}
                    style={{ padding: '0.375rem 0.75rem', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  >Retry (r)</button>
                  <button
                    onClick={() => { speak(recallSentence, { lang: book.language }); announceToNvda(recallSentence); }}
                    style={{ padding: '0.375rem 0.75rem', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  >Hear {bookLangName} (8)</button>
                  <button
                    onClick={() => { setRecallMode(false); setTranslationFeedback(null); setRecallInput(''); }}
                    style={{ marginLeft: 'auto', padding: '0.375rem 0.75rem', background: 'transparent', color: '#475569', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}
                  >Close (←)</button>
                </div>
              </div>
            ) : recallDiff === null ? (
              /* Typing area */
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.75rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }} htmlFor="recall-input">
                  {recallToTranslation ? `Type the ${selectedLang.label} translation` : 'Type the original from memory'}
                </label>
                <textarea
                  id="recall-input"
                  ref={recallTextareaRef}
                  value={recallInput}
                  onChange={e => setRecallInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitRecall(); }
                    if (e.key === '8') { e.preventDefault(); if (recallToTranslation) { speak(recallSentence); announceToNvda(recallSentence); } else { const t = recallHintLiterary || recallHintLiteral; if (t) { speak(t, { lang: selectedLang.code }); announceToNvda(t); } } }
                    if (e.key === '5') { e.preventDefault(); if (recallToTranslation) { if (recallHintLiterary) { speak(recallHintLiterary, { lang: selectedLang.code }); announceToNvda(recallHintLiterary); } } else { if (recallHintLiteral) { speak(recallHintLiteral, { lang: selectedLang.code }); announceToNvda(recallHintLiteral); } } }
                    if (e.key === '2') { e.preventDefault(); if (customAnswer) speak(customAnswer, { lang: 'en' }); }
                    if (e.key === '0') { e.preventDefault(); setCustomQuestionOpen(open => { const next = !open; if (next) setTimeout(() => customQuestionRef.current?.focus(), 50); else setTimeout(() => recallTextareaRef.current?.focus(), 50); return next; }); }
                  }}
                  rows={5}
                  placeholder={recallToTranslation ? `Type the ${selectedLang.label} translation…` : 'Type from memory…'}
                  style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', color: '#f1f5f9', fontSize: '1.1rem', lineHeight: 1.65, resize: 'none', outline: 'none', flex: 1, minWidth: 0 }}
                  aria-label={recallToTranslation ? `Type the ${selectedLang.label} translation. Press Enter to check, 8 to hear original, 5 for model answer.` : 'Type the original from memory. Press Enter to check, 8 to hear the hint.'}
                />
                <p style={{ color: '#475569', fontSize: '0.75rem' }}>
                  {recallToTranslation
                    ? `Enter to check · 8 ${bookLangName} · 5 model ${selectedLang.label} · ← back`
                    : `Enter to check · 8 ${selectedLang.label} · 5 literal · ← back`}
                </p>
              </div>
            ) : (
              /* Recall mode exact diff result */
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
                  Enter to retry · ← back
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

      {/* Bottom bar — mobile action bar or desktop keyboard shortcut bar */}
      {isMobile ? (
        recallMode ? (
          <MobileActionBar
            mode="recall"
            onHearOriginal={() => { speak(recallSentence, { lang: book.language }); announceToNvda(recallSentence); }}
            onHearAnswer={() => { if (recallHintLiterary) { speak(recallHintLiterary, { lang: selectedLang.code }); announceToNvda(recallHintLiterary); } }}
            onCheck={() => submitRecall()}
            onRetry={() => retryRecall()}
            onBack={() => { setRecallMode(false); setRecallDiff(null); setTranslationFeedback(null); setRecallInput(''); }}
            hasResult={recallDiff !== null || translationFeedback !== null}
          />
        ) : (
          <MobileActionBar
            mode="reading"
            onStop={() => stop()}
            onPrevWord={() => { if (currentWordIndex > 0) goToWord(currentWordIndex - 1); else if (currentParagraphIndex > 0) goToParagraph(currentParagraphIndex - 1); }}
            onNextWord={() => { if (currentWordIndex < wordTokens.length - 1) goToWord(currentWordIndex + 1); else if (currentParagraphIndex < paragraphs.length - 1) goToParagraph(currentParagraphIndex + 1, true); }}
            onReadLine={() => readCurrentLine()}
            onTranslate={() => {
              const para = paragraphs[currentParagraphIndex];
              if (para) {
                const line = lineAtWord(para.text, currentWordIndex);
                if (line) api.words.translateParagraph(line, selectedLang.name, book.language, false).then(r => { speak(r.translation, { lang: selectedLang.code }); announceToNvda(r.translation); }).catch(() => {});
              }
            }}
            onRecall={() => enterRecall()}
            onAddFlashcard={() => openAddFlashcard()}
            onOpenMenu={() => onOpenSidebar?.()}
          />
        )
      ) : (
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0">
        {recallMode ? (
          <div role="toolbar" aria-label="Recall shortcuts" className="flex items-center gap-1 flex-wrap">
            <button
              aria-label="Hear original (8)"
              aria-keyshortcuts="8"
              onClick={() => { speak(recallSentence, { lang: book.language }); announceToNvda(recallSentence); }}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Hear original</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">8</kbd>
            </button>
            <button
              aria-label="Model answer (5)"
              aria-keyshortcuts="5"
              onClick={() => { if (recallHintLiterary) { speak(recallHintLiterary, { lang: selectedLang.code }); announceToNvda(recallHintLiterary); } }}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Model answer</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">5</kbd>
            </button>
            {recallDiff === null && translationFeedback === null && (
              <button
                aria-label="Check (Enter)"
                aria-keyshortcuts="Enter"
                onClick={() => submitRecall()}
                className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
              >
                <span className="text-[10px] leading-none mb-0.5">Check</span>
                <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">Enter</kbd>
              </button>
            )}
            {(recallDiff !== null || translationFeedback !== null) && (
              <button
                aria-label="Retry (r)"
                aria-keyshortcuts="r"
                onClick={() => retryRecall()}
                className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
              >
                <span className="text-[10px] leading-none mb-0.5">Retry</span>
                <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">r</kbd>
              </button>
            )}
            {!recallToTranslation && recallDiff !== null && (
              <button
                aria-label="Explain (e)"
                aria-keyshortcuts="e"
                onClick={() => explainRecall()}
                className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
              >
                <span className="text-[10px] leading-none mb-0.5">Explain</span>
                <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">e</kbd>
              </button>
            )}
            <button
              aria-label="Question (0)"
              aria-keyshortcuts="0"
              onClick={() => setCustomQuestionOpen(o => !o)}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Question</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">0</kbd>
            </button>
            <button
              aria-label="Back to reading (left arrow)"
              aria-keyshortcuts="ArrowLeft"
              onClick={() => { setRecallMode(false); setRecallDiff(null); setTranslationFeedback(null); setRecallInput(''); }}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Back</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">←</kbd>
            </button>
            <button
              aria-label="Keyboard reference (h)"
              aria-keyshortcuts="h"
              onClick={() => setShowKeyboardRef(true)}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Help</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">h</kbd>
            </button>
          </div>
        ) : (
          <div role="toolbar" aria-label="Reading shortcuts" className="flex items-center gap-1 flex-wrap">
            <button
              aria-label="Stop speech (Ctrl)"
              aria-keyshortcuts="Control"
              onClick={() => stop()}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Stop</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">Ctrl</kbd>
            </button>
            <button
              aria-label="Read current line (9)"
              aria-keyshortcuts="9"
              onClick={() => readCurrentLine()}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Read line</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">9</kbd>
            </button>
            <button
              aria-label={`Translate current line to ${selectedLang.label} (l)`}
              aria-keyshortcuts="l"
              onClick={() => {
                const para = paragraphs[currentParagraphIndex];
                if (para) {
                  const line = lineAtWord(para.text, currentWordIndex);
                  if (line) api.words.translateParagraph(line, selectedLang.name, book.language, false).then(r => { speak(r.translation, { lang: selectedLang.code }); announceToNvda(r.translation); }).catch(() => {});
                }
              }}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Translate</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">l</kbd>
            </button>
            <button
              aria-label="Enter recall mode (r)"
              aria-keyshortcuts="r"
              onClick={() => enterRecall()}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Recall</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">r</kbd>
            </button>
            <button
              aria-label="Add flashcard (0)"
              aria-keyshortcuts="0"
              onClick={() => openAddFlashcard()}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Flashcard</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">0</kbd>
            </button>
            <button
              aria-label="Grammar analysis (g)"
              aria-keyshortcuts="g"
              onClick={() => analyzeGrammar()}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Grammar</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">g</kbd>
            </button>
            <button
              aria-label="Keyboard reference (h)"
              aria-keyshortcuts="h"
              onClick={() => setShowKeyboardRef(true)}
              className="flex flex-col items-center px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <span className="text-[10px] leading-none mb-0.5">Help</span>
              <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-[10px] px-1 py-0.5 rounded font-mono">h</kbd>
            </button>
          </div>
        )}
      </div>
      )}

      {/* Recommended flow guide */}
      {showFlowGuide && (
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
          role="dialog" aria-modal="true" aria-label="Recommended reading flow"
          onClick={() => setShowFlowGuide(false)}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-amber-400">Recommended reading flow</h2>
              <button autoFocus onClick={() => { setShowFlowGuide(false); currentWordRef.current?.focus(); }} aria-label="Close flow guide" className="text-slate-500 hover:text-slate-200 text-lg leading-none">✕</button>
            </div>
            <ol className="space-y-2.5 text-sm text-slate-300">
              {([
                [<><kbd className="bg-slate-700 px-1 rounded">5</kbd> — hear the current word and its English translation.</>, false],
                [<><kbd className="bg-slate-700 px-1 rounded">6</kbd> — step through each word. A soft tone marks the end of the line.</>, false],
                [<><kbd className="bg-slate-700 px-1 rounded">8</kbd> — hear the full line read aloud, as many times as needed.</>, false],
                [<><kbd className="bg-slate-700 px-1 rounded">l</kbd> — hear the {selectedLang.label} literary translation of the line.</>, false],
                [<><kbd className="bg-slate-700 px-1 rounded">s</kbd> — toggle speed between 1.0× and 1.5×.</>, false],
                [<><kbd className="bg-slate-700 px-1 rounded">→</kbd> — enter recall mode to test yourself.</>, true],
                [<><kbd className="bg-slate-700 px-1 rounded">8</kbd> to hear the original again, <kbd className="bg-slate-700 px-1 rounded">5</kbd> for the model {selectedLang.label} answer.</>, true],
                [<>Type your {selectedLang.label} translation, then press <kbd className="bg-slate-700 px-1 rounded">Enter</kbd> to check.</>, true],
                [<><kbd className="bg-slate-700 px-1 rounded">r</kbd> to retry if there are mistakes.</>, true],
              ] as [React.ReactNode, boolean][]).map(([text, inRecall], i) => (
                <li key={i} className="flex gap-2.5 items-baseline">
                  <span className="text-amber-500 font-bold text-xs shrink-0 w-4 text-right">{i + 1}.</span>
                  <span className={inRecall ? 'text-slate-400' : ''}>{text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-slate-600">Steps 6–9 take place inside recall mode. Press <kbd className="bg-slate-700 px-1 rounded text-slate-500">Esc</kbd> to close.</p>
          </div>
        </div>
      )}

      {/* Keyboard reference dialog */}
      {showKeyboardRef && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard reference"
          onClick={() => { setShowKeyboardRef(false); currentWordRef.current?.focus(); }}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
              <h2 className="text-base font-bold text-amber-400">Keyboard Reference</h2>
              <button
                autoFocus
                onClick={() => { setShowKeyboardRef(false); currentWordRef.current?.focus(); }}
                aria-label="Close keyboard reference"
                className="text-slate-500 hover:text-slate-200 text-lg leading-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
              >✕</button>
            </div>
            <div className="overflow-y-auto px-6 py-5 space-y-6" role="region" aria-label="Shortcut list">
              {([
                {
                  title: 'Word & Letter Navigation',
                  rows: [
                    ['4', 'Previous word'],
                    ['5', 'Speak current word + English translation'],
                    ['6', 'Next word  (soft tone at verse-line boundary)'],
                    ['1', 'Previous letter within word'],
                    ['2', 'Next letter within word'],
                    ['3', 'Repeat current letter'],
                  ] as [string, string][],
                },
                {
                  title: 'Line & Paragraph',
                  rows: [
                    ['7', 'Previous line / paragraph'],
                    ['8', 'Read current line aloud'],
                    ['9', 'Next line / paragraph'],
                  ] as [string, string][],
                },
                {
                  title: 'Study Tools',
                  rows: [
                    ['→  or  r', 'Enter recall / input mode'],
                    ['0', 'Add current word to flashcards (double-click a word also works)'],
                    ['g', 'Grammar analysis of current line'],
                    ['a', `Hear archaism explanation — archaic words shown with violet underline`],
                    ['l', `Literary ${selectedLang.label} translation of current line`],
                    ['f', 'Search within paragraph'],
                  ] as [string, string][],
                },
                {
                  title: 'Speed & Speech',
                  rows: [
                    ['s', 'Snap speed between 1.0× and 1.5×'],
                    ['↑  /  ↓', 'Adjust speed by ±0.1× (current: ' + ttsRate.toFixed(1) + '×)'],
                    ['Ctrl', 'Stop speech immediately — works everywhere, even while typing'],
                  ] as [string, string][],
                },
                {
                  title: 'Chapter Navigation',
                  rows: [
                    ['[', 'Previous chapter'],
                    [']', 'Next chapter'],
                  ] as [string, string][],
                },
                {
                  title: 'In Recall / Input Mode',
                  rows: [
                    ['Enter', 'Submit answer for evaluation'],
                    ['8', 'Hear the original text again'],
                    ['5', `Hear model ${selectedLang.label} answer`],
                    ['e', 'Explain errors (recall-from-memory mode only)'],
                    ['0', 'Ask a custom question about this line'],
                    ['r  or  Enter', 'Retry after seeing the result'],
                    ['←', 'Exit recall mode, return to reading'],
                  ] as [string, string][],
                },
                {
                  title: 'Panels & Help',
                  rows: [
                    ['?', 'Recommended reading flow guide'],
                    ['h', 'This keyboard reference (works from anywhere)'],
                  ] as [string, string][],
                },
              ] as { title: string; rows: [string, string][] }[]).map(({ title, rows }) => (
                <section key={title}>
                  <h3 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">{title}</h3>
                  <dl className="space-y-2">
                    {rows.map(([key, desc]) => (
                      <div key={key} className="flex items-baseline gap-4">
                        <dt className="shrink-0 w-32 text-right">
                          <kbd className="bg-slate-700 border border-slate-600 text-amber-300 text-xs px-1.5 py-0.5 rounded font-mono whitespace-nowrap">{key}</kbd>
                        </dt>
                        <dd className="text-sm text-slate-300 leading-snug">{desc}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-slate-700 shrink-0 text-xs text-slate-600">
              Press <kbd className="bg-slate-700 px-1 rounded text-slate-500">Esc</kbd> or <kbd className="bg-slate-700 px-1 rounded text-slate-500">h</kbd> to close
            </div>
          </div>
        </div>
      )}

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

            {!addLoading && (
              <div className="mt-3">
                <CategoryPicker
                  categories={categories}
                  selectedId={addCategoryId}
                  onChange={setAddCategoryId}
                  onCategoryCreated={cat => onCategoriesChange([...categories, cat])}
                />
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
                onClick={() => { setAddState(null); currentWordRef.current?.focus(); }}
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
