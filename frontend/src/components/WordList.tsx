import { useEffect, useState } from 'react';
import type { Category, ChapterStat, Flashcard } from '../types';
import { api } from '../services/api';
import WordsByChapterChart from './WordsByChapterChart';

interface Props {
  flashcards: Flashcard[];
  categories: Category[];
  onUpdate: () => void;
}

export default function WordList({ flashcards, categories, onUpdate }: Props) {
  const [selected, setSelected] = useState<Flashcard | null>(null);
  const [editTranslation, setEditTranslation] = useState('');
  const [editSynonym, setEditSynonym] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'none' | null>(null);
  const [stats, setStats] = useState<ChapterStat[]>([]);

  useEffect(() => {
    api.flashcards.stats().then(setStats).catch(() => {});
  }, [flashcards]);

  const filtered = flashcards.filter(f => {
    const matchText =
      f.word.toLowerCase().includes(filter.toLowerCase()) ||
      f.translation.toLowerCase().includes(filter.toLowerCase());
    const matchCat =
      categoryFilter === null
        ? true
        : categoryFilter === 'none'
        ? !f.categoryId
        : f.categoryId === categoryFilter;
    return matchText && matchCat;
  });

  const selectCard = (card: Flashcard) => {
    setSelected(card);
    setEditTranslation(card.translation);
    setEditSynonym(card.synonym);
    setEditCategoryId(card.categoryId ?? null);
  };

  const handleSave = async () => {
    if (!selected) return;
    await api.flashcards.update(selected.id, {
      translation: editTranslation,
      synonym: editSynonym,
      categoryId: editCategoryId ?? 0, // 0 means "remove category" on the backend
    });
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

  const catById = (id?: number | null) => categories.find(c => c.id === id);

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="w-72 border-r border-slate-800 flex flex-col bg-slate-950">
        <div className="p-3 border-b border-slate-800 space-y-2">
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter words…"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />

          {/* Category filter chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setCategoryFilter(null)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                  categoryFilter === null
                    ? 'bg-slate-600 border-slate-400 text-slate-100'
                    : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                all
              </button>
              <button
                onClick={() => setCategoryFilter(categoryFilter === 'none' ? null : 'none')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                  categoryFilter === 'none'
                    ? 'bg-slate-600 border-slate-400 text-slate-100'
                    : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                uncategorised
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
                  style={categoryFilter === cat.id ? { backgroundColor: cat.color + '33', borderColor: cat.color, color: cat.color } : {}}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                    categoryFilter === cat.id
                      ? ''
                      : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-600 px-1">{filtered.length} word{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(card => {
            const cat = catById(card.categoryId);
            return (
              <button
                key={card.id}
                onClick={() => selectCard(card)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-900 transition-colors ${
                  selected?.id === card.id
                    ? 'bg-slate-800 border-l-2 border-l-amber-500'
                    : 'hover:bg-slate-900 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {cat && (
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                      title={cat.name}
                    />
                  )}
                  <span className="text-slate-100 font-medium text-sm truncate">{card.word}</span>
                  {isDue(card) && (
                    <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">due</span>
                  )}
                </div>
                {card.translation && (
                  <span className="text-[11px] text-slate-500 block truncate">{card.translation}</span>
                )}
                <span className="text-[10px] text-slate-700 mt-0.5 block">×{card.repetitions} · {card.interval}d</span>
              </button>
            );
          })}

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
                  onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1.5">English synonym</label>
                <input
                  type="text"
                  value={editSynonym}
                  onChange={e => setEditSynonym(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
                />
              </div>

              {/* Category selector */}
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1.5">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setEditCategoryId(null)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      editCategoryId === null
                        ? 'bg-slate-600 border-slate-400 text-slate-100'
                        : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    none
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setEditCategoryId(editCategoryId === cat.id ? null : cat.id)}
                      style={editCategoryId === cat.id ? { backgroundColor: cat.color + '33', borderColor: cat.color, color: cat.color } : {}}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        editCategoryId === cat.id
                          ? ''
                          : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 mb-6 text-[11px] text-slate-600 space-y-1 font-mono">
              <p>Repetitions: {selected.repetitions} · Interval: {selected.interval}d · Ease: {selected.easeFactor.toFixed(2)}</p>
              <p>Next review: {new Date(selected.nextReview).toLocaleDateString()} · Added: {new Date(selected.addedAt).toLocaleDateString()}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void handleSave()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors text-sm"
              >
                Save
              </button>
              <button
                onClick={() => void handleDelete(selected.id)}
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
          <div className="max-w-2xl">
            {stats.length > 0 && (
              <div className="mb-8 bg-slate-900 rounded-xl p-5 border border-slate-800">
                <WordsByChapterChart stats={stats} />
              </div>
            )}
            <div className="flex flex-col items-center justify-center text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-4">
                <span className="text-2xl">📝</span>
              </div>
              <p className="text-slate-400 font-medium">Select a word to edit</p>
              <p className="text-slate-600 text-sm mt-1">Double-click words in the Reader to add them here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
