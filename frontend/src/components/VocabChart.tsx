import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { tokenizeParagraph, getWordTokens } from '../utils/tokenize';

const normWord = (w: string) =>
  w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['''ʼ`]/g, '');

const W = 900, H = 380;
const PAD = { top: 24, right: 64, bottom: 40, left: 52 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

interface Props {
  bookId: number;
  chapterCount: number;
  totalVocab: number;
  currentChapterNum: number;
  onClose: () => void;
}

export function VocabChartModal({ bookId, chapterCount, totalVocab, currentChapterNum, onClose }: Props) {
  const [coverages, setCoverages] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (totalVocab === 0) return;
    const fetches = Array.from({ length: chapterCount }, (_, i) =>
      api.books.paragraphs(bookId, i)
    );
    let done = 0;
    fetches.forEach(p => p.then(() => { done++; setLoaded(done); }));
    Promise.all(fetches).then(chapters => {
      const seen = new Set<string>();
      const rawCounts: number[] = [];
      for (const paras of chapters) {
        for (const para of paras) {
          for (const tok of getWordTokens(tokenizeParagraph(para.text))) {
            const key = normWord(tok?.rawWord || tok?.text || '');
            if (key) seen.add(key);
          }
        }
        rawCounts.push(seen.size);
      }
      const trueTotal = seen.size;
      setCoverages(rawCounts.map(c => trueTotal > 0 ? c / trueTotal * 100 : 0));
    }).catch(() => {});
  }, [bookId, chapterCount, totalVocab]);

  const deltas = coverages.map((v, i) => i === 0 ? v : v - coverages[i - 1]);

  const loading = coverages.length === 0;
  const maxY = 100;
  // Round maxDelta up to nearest 0.5
  const maxDelta = deltas.length > 0
    ? Math.ceil(Math.max(...deltas) * 2) / 2
    : 4;

  // x: canto number (0=origin, 1..chapterCount = data points)
  const px = (canto: number) => PAD.left + (canto / Math.max(chapterCount, 1)) * CW;
  // y for cumulative coverage (left axis, 0-100%)
  const py = (v: number) => PAD.top + CH - (v / maxY) * CH;
  // y for per-canto delta (right axis, 0-maxDelta%)
  const pyR = (v: number) => PAD.top + CH - Math.min(1, v / maxDelta) * CH;

  const origin = `${px(0)},${PAD.top + CH}`; // (0, 0%) — bottom-left corner
  const coveragePoints = `${origin} ${coverages.map((v, i) => `${px(i + 1)},${py(v)}`).join(' ')}`;
  const areaPoints = coverages.length > 0
    ? `${origin} ${coverages.map((v, i) => `${px(i + 1)},${py(v)}`).join(' ')} ${px(chapterCount)},${PAD.top + CH}`
    : '';
  const deltaPoints = `${origin} ${deltas.map((v, i) => `${px(i + 1)},${pyR(v)}`).join(' ')}`;

  const yGridLines = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const yRightLabels = Array.from(
    { length: Math.round(maxDelta / 0.5) + 1 },
    (_, i) => i * 0.5
  );
  const xLabels = [0, ...Array.from(
    { length: Math.ceil(chapterCount / 5) },
    (_, i) => (i + 1) * 5
  ).filter(n => n <= chapterCount)];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || coverages.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const canto = Math.max(1, Math.min(chapterCount, Math.round((svgX - PAD.left) / CW * chapterCount)));
    setHoverIdx(canto - 1);
  };

  const hi = hoverIdx;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[960px] max-w-[98vw] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-slate-200 text-sm font-semibold">Vocabulary coverage by canto</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#38bdf8" strokeWidth="2"/></svg>
              Cumulative %
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#fb923c" strokeWidth="2"/></svg>
              New words per canto %
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none ml-2" aria-label="Close">✕</button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Loading {loaded}/{chapterCount} cantos…
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Horizontal grid lines (left scale) */}
              {yGridLines.map(v => (
                <line key={v}
                  x1={PAD.left} y1={py(v)} x2={PAD.left + CW} y2={py(v)}
                  stroke="#1e293b" strokeWidth="1"
                />
              ))}

              {/* Area fill under cumulative line */}
              {areaPoints && <polygon points={areaPoints} fill="rgba(56,189,248,0.08)" />}

              {/* Delta line */}
              {deltaPoints && (
                <polyline points={deltaPoints} fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinejoin="round" />
              )}

              {/* Cumulative coverage line */}
              {coveragePoints && (
                <polyline points={coveragePoints} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" />
              )}

              {/* Current canto marker */}
              {coverages[currentChapterNum] !== undefined && (
                <line
                  x1={px(currentChapterNum + 1)} y1={PAD.top}
                  x2={px(currentChapterNum + 1)} y2={PAD.top + CH}
                  stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3"
                />
              )}

              {/* Hover crosshair + dots */}
              {hi !== null && coverages[hi] !== undefined && (
                <>
                  <line x1={px(hi + 1)} y1={PAD.top} x2={px(hi + 1)} y2={PAD.top + CH} stroke="#475569" strokeWidth="1" />
                  <circle cx={px(hi + 1)} cy={py(coverages[hi])} r="3.5" fill="#38bdf8" />
                  {deltas[hi] !== undefined && (
                    <circle cx={px(hi + 1)} cy={pyR(deltas[hi])} r="3.5" fill="#fb923c" />
                  )}
                </>
              )}

              {/* Left Y axis labels */}
              {yGridLines.map(v => (
                <text key={v}
                  x={PAD.left - 6} y={py(v)}
                  textAnchor="end" dominantBaseline="middle"
                  fontSize="11" fill="#64748b"
                >{v}%</text>
              ))}

              {/* Right Y axis labels */}
              {yRightLabels.map(v => (
                <text key={v}
                  x={PAD.left + CW + 6} y={pyR(v)}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize="11" fill="#9a5a3a"
                >{v}%</text>
              ))}

              {/* X axis labels */}
              {xLabels.map(n => (
                <text key={n}
                  x={px(n)} y={PAD.top + CH + 16}
                  textAnchor="middle" fontSize="11" fill="#64748b"
                >{n}</text>
              ))}

              {/* Axes */}
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} stroke="#334155" strokeWidth="1" />
              <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH} stroke="#334155" strokeWidth="1" />
              <line x1={PAD.left + CW} y1={PAD.top} x2={PAD.left + CW} y2={PAD.top + CH} stroke="#334155" strokeWidth="1" />
            </svg>

            <div className="text-xs text-slate-500 text-center mt-1 h-4">
              {hi !== null && coverages[hi] !== undefined
                ? `Canto ${hi + 1} · cumulative ${coverages[hi].toFixed(2)}% · new words ${deltas[hi]?.toFixed(2) ?? ''}%`
                : coverages[currentChapterNum] !== undefined
                  ? `You are at Canto ${currentChapterNum + 1} · ${coverages[currentChapterNum].toFixed(2)}% cumulative · ${deltas[currentChapterNum]?.toFixed(2) ?? ''}% new this canto`
                  : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
