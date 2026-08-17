import { useCallback, useEffect, useState } from 'react';
import type { Flashcard, FlashcardMode } from '../types';
import { api } from '../services/api';
import { useTTS } from '../hooks/useTTS';

interface Props {
  flashcards: Flashcard[];
  onUpdate: () => void;
  selectedLangCode?: string;
}

export default function Flashcards({ flashcards, onUpdate, selectedLangCode = 'uk' }: Props) {
  const [mode, setMode] = useState<FlashcardMode>('translation');
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { speakChain, stop } = useTTS();

  const loadDue = useCallback(async () => {
    setIsLoading(true);
    const cards = await api.flashcards.due();
    setDueCards(cards);
    setCurrentIndex(0);
    setFlipped(false);
    setSessionDone(cards.length === 0);
    setCorrect(0);
    setTotal(0);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadDue(); }, [loadDue]);

  const currentCard = dueCards[currentIndex];

  const handleFlip = useCallback(() => {
    setFlipped(f => {
      const nowFlipped = !f;
      if (nowFlipped && currentCard) {
        // Read: word → translation (target lang) → English synonym
        speakChain([
          { text: currentCard.word },
          { text: currentCard.translation, lang: selectedLangCode },
          { text: currentCard.synonym },
        ]);
      } else {
        stop();
      }
      return nowFlipped;
    });
  }, [currentCard, speakChain, stop, selectedLangCode]);

  const handleAnswer = useCallback(async (isCorrect: boolean) => {
    if (!currentCard) return;
    await api.flashcards.review(currentCard.id, isCorrect);
    onUpdate();
    setTotal(t => t + 1);
    if (isCorrect) setCorrect(c => c + 1);
    setFlipped(false);
    const next = currentIndex + 1;
    if (next >= dueCards.length) setSessionDone(true);
    else setCurrentIndex(next);
  }, [currentCard, currentIndex, dueCards.length, onUpdate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === '5' || e.code === 'Numpad5') {
        e.preventDefault();
        if (!flipped) handleFlip();
      }
      if (flipped) {
        if (e.key === '1' || e.code === 'Numpad1' || e.key === '4' || e.code === 'Numpad4') { e.preventDefault(); handleAnswer(false); }
        if (e.key === '5' || e.code === 'Numpad5' || e.key === '6' || e.code === 'Numpad6' || e.key === 'y' || e.key === 'Y') { e.preventDefault(); handleAnswer(true); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flipped, handleFlip, handleAnswer]);

  const getBack = (card: Flashcard) =>
    mode === 'translation' ? card.translation || '(no translation added)' : card.synonym || '(no synonym added)';

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <p>Loading cards…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-6 py-4">

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-5 shrink-0">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide mr-1">Mode</span>
        {(['translation', 'synonym'] as FlashcardMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === m
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {m === 'translation' ? 'Translation (UA)' : 'Synonym (EN)'}
          </button>
        ))}
        {total > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-slate-500">{correct}/{total}</span>
            <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${accuracy >= 70 ? 'bg-green-500' : accuracy >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${accuracy}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {sessionDone ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {dueCards.length === 0 && total === 0 ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <span className="text-3xl text-green-400">✓</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-100 mb-1">All caught up!</h2>
              <p className="text-slate-500 mb-1">No cards due for review right now.</p>
              <p className="text-slate-600 text-sm">{flashcards.length} total cards — check back later.</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
                <span className="text-3xl">🎉</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-100 mb-1">Session complete</h2>
              <p className="text-slate-300 mb-0.5">
                <span className="text-amber-400 font-bold">{correct}</span>
                <span className="text-slate-500"> of </span>
                <span className="font-semibold">{total}</span>
                <span className="text-slate-500"> correct</span>
              </p>
              <p className="text-slate-500 text-sm">{accuracy}% accuracy</p>
            </>
          )}
          <button
            onClick={loadDue}
            className="mt-6 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-colors shadow-sm"
          >
            Review again
          </button>
        </div>

      ) : currentCard ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-xs text-slate-600 mb-5 font-medium">
            {currentIndex + 1} <span className="text-slate-700">/ {dueCards.length}</span> due
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-lg h-0.5 bg-slate-800 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-amber-500/50 rounded-full transition-all"
              style={{ width: `${(currentIndex / dueCards.length) * 100}%` }}
            />
          </div>

          {/* Card */}
          <div
            className={`w-full max-w-lg rounded-2xl cursor-pointer transition-all duration-200 p-8 text-center select-none ${
              flipped
                ? 'bg-slate-800 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/5'
                : 'bg-slate-800/60 ring-1 ring-slate-700 hover:ring-slate-600'
            }`}
            style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            onClick={handleFlip}
            role="button"
            aria-label={flipped ? 'Card flipped — answer shown' : 'Click or press Space to flip'}
            tabIndex={0}
          >
            {!flipped ? (
              <>
                <p className="text-3xl font-bold text-slate-100 mb-3">{currentCard.word}</p>
                {currentCard.context && (
                  <p className="text-xs text-slate-500 italic line-clamp-2 max-w-sm leading-relaxed">{currentCard.context}</p>
                )}
                <p className="text-slate-600 text-xs mt-4">Space · 5 to reveal</p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
                  {mode === 'translation' ? 'Ukrainian' : 'Synonym'}
                </p>
                <p className="text-2xl font-bold text-amber-300">{getBack(currentCard)}</p>
                <p className="text-slate-600 text-xs mt-4">
                  <span className="text-slate-500">Word: </span>{currentCard.word}
                </p>
              </>
            )}
          </div>

          {/* Answer buttons */}
          {flipped && (
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAnswer(false)}
                className="px-8 py-3 bg-red-950 hover:bg-red-900 ring-1 ring-red-800 rounded-xl text-red-300 font-semibold transition-all"
                aria-label="Incorrect"
              >
                ✗ Wrong <span className="text-xs opacity-50">(4)</span>
              </button>
              <button
                onClick={() => handleAnswer(true)}
                className="px-8 py-3 bg-green-950 hover:bg-green-900 ring-1 ring-green-800 rounded-xl text-green-300 font-semibold transition-all"
                aria-label="Correct"
              >
                ✓ Correct <span className="text-xs opacity-50">(6)</span>
              </button>
            </div>
          )}

          <p className="mt-4 text-[11px] text-slate-700">
            Next interval: {currentCard.interval} day{currentCard.interval !== 1 ? 's' : ''} if correct
          </p>
        </div>
      ) : null}

      {/* Keyboard hints */}
      <div className="mt-4 shrink-0 text-[11px] text-slate-700 text-center">
        <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px]">Space</kbd>
        {' '}flip{'  ·  '}
        <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px]">6</kbd>
        {' '}correct{'  ·  '}
        <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px]">4</kbd>
        {' '}wrong
      </div>
    </div>
  );
}
