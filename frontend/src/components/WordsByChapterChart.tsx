import { useMemo, useState } from 'react';
import type { ChapterStat } from '../types';

interface Props {
  stats: ChapterStat[];
}

export default function WordsByChapterChart({ stats }: Props) {
  const books = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of stats) map.set(s.bookId, s.bookTitle);
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [stats]);

  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  const activeBookId = selectedBookId ?? books[0]?.id ?? null;

  const barData = useMemo(() =>
    stats
      .filter(s => s.bookId === activeBookId)
      .sort((a, b) => a.chapterNumber - b.chapterNumber),
    [stats, activeBookId]
  );

  if (stats.length === 0) {
    return (
      <div className="p-6 text-center text-slate-600 text-sm">
        <p className="text-2xl mb-2">📈</p>
        <p>No data yet. Save words from chapters while reading —</p>
        <p className="text-slate-700 mt-1">the chart will show your progress here.</p>
      </div>
    );
  }

  const maxCount = Math.max(...barData.map(d => d.count), 1);
  const BAR_H = 80;
  const BAR_W = 32;
  const GAP = 8;
  const LABEL_H = 36;
  const SVG_H = BAR_H + LABEL_H + 16;
  const SVG_W = barData.length * (BAR_W + GAP);

  // Abbreviate chapter title to fit under bar
  const abbrev = (title: string) => {
    const m = title.match(/canto\s+(\d+)/i) ?? title.match(/act\s+(\d+)/i) ?? title.match(/ch(?:apter)?\s*(\d+)/i);
    if (m) return m[0].replace(/chapter/i, 'Ch').replace(/canto/i, '').replace(/act/i, 'Act').trim();
    const words = title.split(/\s+/);
    return words.length <= 2 ? title : words.slice(0, 2).join(' ') + '…';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Words saved per chapter</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Fewer bars as you progress = mastery in action</p>
        </div>
        {books.length > 1 && (
          <select
            value={activeBookId ?? ''}
            onChange={e => setSelectedBookId(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-amber-500"
          >
            {books.map(b => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        )}
      </div>

      {barData.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No words saved for this book yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            width={Math.max(SVG_W, 100)}
            height={SVG_H}
            aria-label="Words saved per chapter"
            role="img"
          >
            {barData.map((d, i) => {
              const barHeight = Math.max(4, Math.round((d.count / maxCount) * BAR_H));
              const x = i * (BAR_W + GAP);
              const y = BAR_H - barHeight;
              const label = abbrev(d.chapterTitle);
              return (
                <g key={d.chapterNumber}>
                  <title>{d.chapterTitle}: {d.count} word{d.count !== 1 ? 's' : ''}</title>
                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barHeight}
                    rx={3}
                    fill="#f59e0b"
                    opacity={0.7 + 0.3 * (d.count / maxCount)}
                  />
                  {/* Count label above bar */}
                  <text
                    x={x + BAR_W / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#94a3b8"
                  >
                    {d.count}
                  </text>
                  {/* Chapter label below */}
                  <text
                    x={x + BAR_W / 2}
                    y={BAR_H + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#64748b"
                    transform={`rotate(-35, ${x + BAR_W / 2}, ${BAR_H + 12})`}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
