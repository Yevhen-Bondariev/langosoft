import { useState } from 'react';
import type { Category } from '../types';
import { api } from '../services/api';

const PRESET_COLORS = [
  '#f472b6', '#a855f7', '#f59e0b', '#3b82f6', '#14b8a6', '#22c55e', '#ef4444',
];

interface Props {
  categories: Category[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
  onCategoryCreated: (cat: Category) => void;
}

export default function CategoryPicker({ categories, selectedId, onChange, onCategoryCreated }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[3]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const cat = await api.categories.create(newName.trim(), newColor);
      onCategoryCreated(cat);
      onChange(cat.id);
      setCreating(false);
      setNewName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-sm text-slate-300 mb-2">Category (optional)</label>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {/* No-category chip */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            selectedId === null
              ? 'bg-slate-600 border-slate-400 text-slate-100'
              : 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300'
          }`}
        >
          none
        </button>

        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(selectedId === cat.id ? null : cat.id)}
            style={selectedId === cat.id ? { backgroundColor: cat.color + '33', borderColor: cat.color, color: cat.color } : {}}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              selectedId === cat.id
                ? ''
                : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </button>
        ))}

        {/* Add new */}
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-slate-600 text-slate-500 hover:border-amber-500 hover:text-amber-400 transition-colors"
          >
            + New
          </button>
        )}
      </div>

      {creating && (
        <div className="flex gap-1.5 items-center mt-1">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Category name…"
            className="flex-1 bg-slate-700 border border-slate-500 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void handleCreate(); }
              if (e.key === 'Escape') { e.preventDefault(); setCreating(false); }
            }}
          />
          <div className="flex gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !newName.trim()}
            className="px-2 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold rounded transition-colors"
          >
            {saving ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(''); }}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 text-xs rounded transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
