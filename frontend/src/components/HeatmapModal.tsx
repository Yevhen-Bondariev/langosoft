import { useMemo, useState } from 'react';
import type { DailyEntry } from '../hooks/useReadingStats';

interface Props {
  dailyLog: Record<string, DailyEntry>;
  goalMinutes: number;
  onGoalChange: (goal: number) => void;
  onClose: () => void;
}

function dayColor(minutes: number): string {
  if (minutes === 0) return 'bg-slate-800';
  if (minutes < 6)  return 'bg-emerald-900';
  if (minutes < 15) return 'bg-emerald-700';
  if (minutes < 30) return 'bg-emerald-500';
  return 'bg-emerald-400';
}

export function HeatmapModal({ dailyLog, goalMinutes, onGoalChange, onClose }: Props) {
  const [tooltip, setTooltip] = useState<{ date: string; entry: DailyEntry } | null>(null);

  // Build 52-week × 7-day grid ending today
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start on the Monday 51 full weeks ago
    const start = new Date(today);
    start.setDate(start.getDate() - (364 + ((today.getDay() + 6) % 7)));

    const grid: Array<Array<{ date: string; minutes: number; newWords: number; isFuture: boolean }>> = [];
    const cur = new Date(start);
    for (let w = 0; w < 53; w++) {
      const week: typeof grid[0] = [];
      for (let d = 0; d < 7; d++) {
        const iso = cur.toISOString().slice(0, 10);
        const entry = dailyLog[iso] ?? { minutes: 0, newWords: 0 };
        week.push({ date: iso, minutes: entry.minutes, newWords: entry.newWords, isFuture: cur > today });
        cur.setDate(cur.getDate() + 1);
      }
      grid.push(week);
    }
    return grid;
  }, [dailyLog]);

  // Month labels: find which week each month starts in
  const monthLabels = useMemo(() => {
    const labels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const d = new Date(week[0].date + 'T00:00:00');
      if (d.getMonth() !== lastMonth) {
        labels.push({ col: wi, label: d.toLocaleString('en', { month: 'short' }) });
        lastMonth = d.getMonth();
      }
    });
    return labels;
  }, [weeks]);

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 mx-4 max-w-3xl w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-amber-400">Reading Heatmap</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg">✕</button>
        </div>

        {/* Daily goal */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-400">Daily goal</span>
          <button onClick={() => onGoalChange(goalMinutes - 5)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-base leading-none transition-colors">−</button>
          <input
            type="number"
            min={5} max={120} step={5}
            value={goalMinutes}
            onChange={e => onGoalChange(Number(e.target.value))}
            className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-sm font-semibold text-slate-200 text-center focus:outline-none focus:border-amber-500"
          />
          <span className="text-xs text-slate-500">min</span>
          <button onClick={() => onGoalChange(goalMinutes + 5)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-base leading-none transition-colors">+</button>
        </div>

        <div className="overflow-x-auto">
          <div className="inline-flex flex-col gap-0" style={{ minWidth: 'max-content' }}>
            {/* Month row */}
            <div className="flex ml-7 mb-1" style={{ gap: 2 }}>
              {weeks.map((_, wi) => {
                const lbl = monthLabels.find(m => m.col === wi);
                return (
                  <div key={wi} style={{ width: 10 }} className="text-[9px] text-slate-500">
                    {lbl?.label ?? ''}
                  </div>
                );
              })}
            </div>

            {/* Day rows */}
            {[0,1,2,3,4,5,6].map(di => (
              <div key={di} className="flex items-center" style={{ gap: 2, marginBottom: 2 }}>
                <div className="text-[9px] text-slate-600 w-6 text-right pr-1 select-none">
                  {dayLabels[di]}
                </div>
                {weeks.map((week, wi) => {
                  const day = week[di];
                  if (day.isFuture) return <div key={wi} style={{ width: 10, height: 10, borderRadius: 2 }} className="bg-slate-900" />;
                  return (
                    <div
                      key={wi}
                      style={{ width: 10, height: 10, borderRadius: 2 }}
                      className={`${dayColor(day.minutes)} cursor-pointer hover:ring-1 hover:ring-amber-400`}
                      onMouseEnter={() => setTooltip({ date: day.date, entry: { minutes: day.minutes, newWords: day.newWords } })}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip — always rendered to prevent layout shift; updates on hover, stays on last cell */}
        <div className="mt-3 text-xs text-slate-400 h-4">
          {tooltip && <>
            <span className="text-slate-200">{tooltip.date}</span>
            {' — '}
            {tooltip.entry.minutes > 0
              ? <>{tooltip.entry.minutes} min · {tooltip.entry.newWords} new words</>
              : 'no reading'}
          </>}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-4 text-[10px] text-slate-500">
          <span>Less</span>
          {['bg-slate-800','bg-emerald-900','bg-emerald-700','bg-emerald-500','bg-emerald-400'].map(c => (
            <div key={c} className={`${c} rounded`} style={{ width: 10, height: 10 }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
