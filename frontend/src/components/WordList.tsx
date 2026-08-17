import { useState } from 'react';
import type { Flashcard } from '../types';
import { api } from '../services/api';

interface Props {
  flashcards: Flashcard[];
  onUpdate: () => void;
}

export default function WordList({ flashcards, onUpdate }: Props) {
  const [selected, setSelected] = useState<Flashcard | null>(null);
  const [editTranslation, setEditTranslation] = useState('');
  const [editSynonym, setEditSynonym] = useState('');
  const [filter, setFilter] = useState('');

  const filtered = flashcards.filter(f =>
    f.word.toLowerCase().includes(filter.toLowerCase()) ||
    f.translation.toLowerCase().includes(filter.toLowerCase())
  );

  const selectCard = (card: Flashcard) => {
    setSelected(card);
    setEditTranslation(card.translation);
    setEditSynonym(card.synonym);
  };

  const handleSave = async () => {
    if (!selected) return;
    await api.flashcards.update(selected.id, { translation: editTranslation, synonym: editSynonym });
    onUpdate();
    setSelected(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this flashcard?')) return;
    await api.flashcards.delete(id);
    onUpdate();
    setSelected(null);
  };

  const isDue = (card: Flashcard) => new Date(card.nextReview) <= new Date();

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="w-72 border-r border-slate-800 flex flex-col bg-slate-950">
        <div className="p-3 border-b border-slate-800">
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter words…"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
          <p className="text-[11px] text-slate-600 mt-1.5 px-1">{filtered.length} word{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(card => (
            <button
              key={card.id}
              onClick={() => selectCard(card)}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-900 transition-colors ${
                selected?.id === card.id
                  ? 'bg-slate-800 border-l-2 border-l-amber-500'
                  : 'hover:bg-slate-900 border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-slate-100 font-medium text-sm">{card.word}</span>
                {isDue(card) && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-medium">due</span>
                )}
              </div>
              {card.translation && (
                <span className="text-[11px] text-slate-500 block truncate">{card.translation}</span>
              )}
              <span className="text-[10px] text-slate-700 mt-0.5 block">×{card.repetitions} · {card.interval}d</span>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-slate-600 text-sm">
                {flashcards.length === 0 ? 'No words yet' : 'No matches'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 p-8 overflow-y-auto">
        {selected ? (
          <div className="max-w-lg">
            <div className="mb-6">
              <h2 className="text-4xl font-bold text-slate-100 mb-1">{selected.word}</h2>
              <p className="text-sm text-slate-500 italic line-clamp-3 leading-relaxed">{selected.context}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1.5">Ukrainian translation</label>
                <input
                  type="text"
                  value={editTranslation}
                  onChange={e => setEditTranslation(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1.5">English synonym</label>
                <input
                  type="text"
                  value={editSynonym}
                  onChange={e => setEditSynonym(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
              </div>
            </div>

            <div className="mt-5 mb-6 text-[11px] text-slate-600 space-y-1 font-mono">
              <p>Repetitions: {selected.repetitions} · Interval: {selected.interval}d · Ease: {selected.easeFactor.toFixed(2)}</p>
              <p>Next review: {new Date(selected.nextReview).toLocaleDateString()} · Added: {new Date(selected.addedAt).toLocaleDateString()}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors text-sm"
              >
                Save
              </button>
              <button
                onClick={() => handleDelete(selected.id)}
                className="px-5 py-2 bg-red-950 hover:bg-red-900 text-red-300 ring-1 ring-red-800 rounded-lg transition-colors text-sm"
              >
                Delete
              </button>
              <button
                onClick={() => setSelected(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-4">
              <span className="text-2xl">📝</span>
            </div>
            <p className="text-slate-400 font-medium">Select a word to edit</p>
            <p className="text-slate-600 text-sm mt-1">Double-click words in the Reader to add them here</p>
          </div>
        )}
      </div>
    </div>
  );
}
