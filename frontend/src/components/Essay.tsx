import { useCallback, useEffect, useState } from 'react';
import type { Book, Chapter } from '../types';
import { api } from '../services/api';

interface CategoryFeedback {
  score: number;
  issues: string[];
  tip: string;
}

interface EssayFeedback {
  overallScore: number;
  categories: Record<string, CategoryFeedback>;
  strongPoints: string[];
  recommendations: string[];
}

interface Props {
  book: Book;
  chapters: Chapter[];
  currentChapterNum: number;
}

const ESSAY_PROMPTS = [
  "Summarise what happens in this chapter in your own words.",
  "Analyse the psychology and motivations of the main characters here.",
  "What themes does Wilde explore, and how do they connect to modern life?",
  "Write your personal reaction to the events of this chapter.",
  "Compare two characters — how are they different in values and behaviour?",
  "Describe the mood and atmosphere. What techniques does Wilde use to create it?",
];

const CATEGORY_LABELS: Record<string, string> = {
  spelling: "Spelling",
  grammar: "Grammar",
  punctuation: "Punctuation",
  coherence: "Coherence",
  vocabulary: "Vocabulary",
  relevance: "Relevance",
  style: "Style",
};

const CATEGORY_ORDER = ['spelling', 'grammar', 'punctuation', 'coherence', 'vocabulary', 'relevance', 'style'];

function ScoreBar({ score, size = 'normal' }: { score: number; size?: 'normal' | 'large' }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const h = size === 'large' ? 'h-3' : 'h-1.5';
  return (
    <div className={`w-full bg-slate-700 rounded-full ${h} overflow-hidden`}>
      <div className={`${color} ${h} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function Essay({ book, chapters, currentChapterNum }: Props) {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [essayText, setEssayText] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<EssayFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [contextText, setContextText] = useState('');

  const currentChapter = chapters.find(c => c.number === currentChapterNum);

  useEffect(() => {
    fetch('http://localhost:5000/api/essays/status')
      .then(r => r.json())
      .then(d => setIsConfigured(d.configured))
      .catch(() => setIsConfigured(false));
  }, []);

  useEffect(() => {
    if (book && currentChapterNum >= 0) {
      api.books.paragraphs(book.id, currentChapterNum).then(paras => {
        setContextText(paras.slice(0, 3).map(p => p.text).join(' '));
      }).catch(() => {});
    }
  }, [book, currentChapterNum]);

  const handleSubmit = useCallback(async () => {
    const trimmed = essayText.trim();
    if (trimmed.length < 50) {
      setError('Write at least 50 characters before checking.');
      return;
    }
    setIsChecking(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('http://localhost:5000/api/essays/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essayText: trimmed,
          chapterTitle: currentChapter?.title ?? `Chapter ${currentChapterNum}`,
          contextText: selectedPrompt ? `Prompt: ${selectedPrompt}\n\n${contextText}` : contextText,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Check failed');
      }
      setFeedback(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsChecking(false);
    }
  }, [essayText, currentChapter, currentChapterNum, selectedPrompt, contextText]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleSubmit]);

  if (isConfigured === null) {
    return <div className="flex-1 flex items-center justify-center text-slate-500">Checking configuration...</div>;
  }

  if (!isConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">🔑</div>
          <h2 className="text-xl font-bold text-amber-400 mb-3">Groq API Key Required</h2>
          <p className="text-slate-300 text-sm mb-4">Essay checking uses Groq (free, fast). Get a key at <span className="text-amber-300">console.groq.com</span> and restart the backend.</p>
          <div className="bg-slate-800 rounded-lg p-4 text-left font-mono text-sm mb-4 space-y-3">
            <div>
              <p className="text-slate-500 text-xs mb-1">Option 1 — environment variable:</p>
              <p className="text-green-300">GROQ_API_KEY=gsk_...</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Option 2 — backend/LangoSoft.Api/appsettings.json:</p>
              <p className="text-green-300">{'"Groq": { "ApiKey": "gsk_..." }'}</p>
            </div>
          </div>
          <p className="text-slate-500 text-xs">Then restart the backend server.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: writing area */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-700">
        {/* Chapter context */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Writing about</p>
          <p className="text-amber-400 font-semibold">{currentChapter?.title ?? `Chapter ${currentChapterNum}`}</p>
          {contextText && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 italic">
              "{contextText.slice(0, 130)}…"
            </p>
          )}
        </div>

        {/* Prompt chips */}
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 shrink-0">
          <p className="text-xs text-slate-500 mb-2">Optional prompt:</p>
          <div className="flex flex-wrap gap-1.5">
            {ESSAY_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => setSelectedPrompt(selectedPrompt === p ? '' : p)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  selectedPrompt === p
                    ? 'bg-amber-500/20 border-amber-600 text-amber-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {p.length > 48 ? p.slice(0, 48) + '…' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          {selectedPrompt && (
            <p className="text-sm text-slate-300 italic mb-2 pb-2 border-b border-slate-800">{selectedPrompt}</p>
          )}
          <textarea
            value={essayText}
            onChange={e => { setEssayText(e.target.value); setError(null); }}
            placeholder="Write your essay here… (Ctrl+Enter to check)"
            className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100 text-lg leading-relaxed resize-none focus:outline-none focus:border-amber-500 placeholder-slate-600"
            aria-label="Essay text"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-500">
              {essayText.length} chars · {essayText.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            <button
              onClick={handleSubmit}
              disabled={isChecking || essayText.trim().length < 50}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-lg transition-colors"
            >
              {isChecking ? 'Analysing…' : 'Check Essay (Ctrl+Enter)'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
      </div>

      {/* Right: feedback */}
      <div className="w-96 flex flex-col overflow-hidden bg-slate-950 shrink-0">
        {!feedback && !isChecking && (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <div className="text-4xl mb-3 opacity-30">📋</div>
              <p className="text-slate-500 text-sm">Write your essay and press<br />"Check Essay" to get feedback</p>
            </div>
          </div>
        )}

        {isChecking && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl mb-3 animate-pulse">🔍</div>
              <p className="text-slate-400">Analysing your essay…</p>
              <p className="text-slate-600 text-xs mt-1">This takes ~10 seconds</p>
            </div>
          </div>
        )}

        {feedback && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Overall score */}
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className={`text-6xl font-bold mb-1 ${
                feedback.overallScore >= 80 ? 'text-green-400' :
                feedback.overallScore >= 60 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {feedback.overallScore}
              </div>
              <div className="text-slate-500 text-xs mb-3">/ 100 overall</div>
              <ScoreBar score={feedback.overallScore} size="large" />
            </div>

            {/* Categories */}
            <div className="space-y-1.5">
              {CATEGORY_ORDER.filter(k => feedback.categories[k]).map(key => {
                const cat = feedback.categories[key];
                const open = expandedCategory === key;
                return (
                  <div key={key} className="bg-slate-800/60 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 transition-colors"
                      onClick={() => setExpandedCategory(open ? null : key)}
                      aria-expanded={open}
                    >
                      <span className="text-xs text-slate-400 w-20 text-left shrink-0">{CATEGORY_LABELS[key]}</span>
                      <div className="flex-1"><ScoreBar score={cat.score} /></div>
                      <span className={`text-sm font-bold w-8 text-right shrink-0 ${
                        cat.score >= 80 ? 'text-green-400' : cat.score >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}>{cat.score}</span>
                      <span className="text-slate-600 text-xs shrink-0">{open ? '▲' : '▼'}</span>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2 border-t border-slate-700/50 pt-2">
                        {cat.issues.length > 0 && (
                          <ul className="space-y-1">
                            {cat.issues.map((issue, i) => (
                              <li key={i} className="text-xs text-slate-300 bg-slate-900 rounded px-2 py-1.5">
                                {issue}
                              </li>
                            ))}
                          </ul>
                        )}
                        {cat.issues.length === 0 && (
                          <p className="text-xs text-green-400">No issues found.</p>
                        )}
                        <div className="bg-amber-950/50 border border-amber-800/40 rounded px-2 py-1.5">
                          <p className="text-xs text-amber-300">→ {cat.tip}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Strong points */}
            {feedback.strongPoints?.length > 0 && (
              <div>
                <p className="text-xs text-green-400 font-semibold uppercase tracking-wide mb-2">What you did well</p>
                <ul className="space-y-1">
                  {feedback.strongPoints.map((p, i) => (
                    <li key={i} className="text-xs text-slate-300 flex gap-2">
                      <span className="text-green-500 shrink-0">✓</span><span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {feedback.recommendations?.length > 0 && (
              <div>
                <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide mb-2">Top improvements</p>
                <ol className="space-y-2">
                  {feedback.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-slate-300 flex gap-2">
                      <span className="text-amber-500 shrink-0 font-bold">{i + 1}.</span><span>{r}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <button
              onClick={() => { setFeedback(null); setEssayText(''); setSelectedPrompt(''); }}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 border border-slate-700 rounded-lg transition-colors"
            >
              Start new essay
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
