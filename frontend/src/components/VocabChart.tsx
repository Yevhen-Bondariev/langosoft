import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { tokenizeParagraph, getWordTokens } from '../utils/tokenize';

const normWord = (w: string) =>
  w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’ʼ`]/g, '');

const W = 900, H = 380;
const PAD = { top: 24, right: 32, bottom: 40, left: 52 };
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
    // Track arrival for progress counter without affecting order
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
      // Use the final seen.size as denominator — same normalization as numerator, so max is exactly 100%
      const trueTotal = seen.size;
      setCoverages(rawCounts.map(c => trueTotal > 0 ? c / trueTotal * 100 : 0));
    }).catch(() => {});
  }, [bookId, chapterCount, totalVocab]);

  const loading = coverages.length === 0;
  const maxY = coverages.length > 0 ? Math.min(100, Math.ceil(Math.max(...coverages) / 10 + 1) * 10) : 100;

  const px = (i: number) => PAD.left + (i / Math.max(chapterCount - 1, 1)) * CW;
  const py = (v: number) => PAD.top + CH - Math.min(1, v / maxY) * CH;

  const linePoints = coverages.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const areaPoints = coverages.length > 0
    ? `${px(0)},${PAD.top + CH} ${linePoints} ${px(coverages.length - 1)},${PAD.top + CH}`
    : '';

  const yGridLines = Array.from({ length: Math.floor(maxY / 10) + 1 }, (_, i) => i * 10);
  const xLabels = [0, ...Array.from({ length: Math.ceil(chapterCount / 5) }, (_, i) => (i + 1) * 5).filter(n => n <= chapterCount)];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || coverages.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.max(0, Math.min(chapterCount - 1,
      Math.round((svgX - PAD.left) / CW * (chapterCount - 1))
    ));
    setHoverIdx(idx);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[960px] max-w-[98vw] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-slate-200 text-sm font-semibold">Vocabulary coverage by canto</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-lg leading-none"
            aria-label="Close"
          >✕</button>
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
              {/* Grid lines */}
              {yGridLines.map(v => (
                <line key={v}
                  x1={PAD.left} y1={py(v)} x2={PAD.left + CW} y2={py(v)}
                  stroke="#1e293b" strokeWidth="1"
                />
              ))}

              {/* Area fill */}
              <polygon points={areaPoints} fill="rgba(56,189,248,0.10)" />

              {/* Coverage line */}
              <polyline points={linePoints} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" />

              {/* Current canto marker */}
              {coverages[currentChapterNum] !== undefined && (
                <line
                  x1={px(currentChapterNum)} y1={PAD.top}
                  x2={px(currentChapterNum)} y2={PAD.top + CH}
                  stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3"
                />
              )}

              {/* Hover crosshair + dot */}
              {hoverIdx !== null && coverages[hoverIdx] !== undefined && (
                <>
                  <line
                    x1={px(hoverIdx)} y1={PAD.top}
                    x2={px(hoverIdx)} y2={PAD.top + CH}
                    stroke="#475569" strokeWidth="1"
                  />
                  <circle cx={px(hoverIdx)} cy={py(coverages[hoverIdx])} r="3.5" fill="#38bdf8" />
                </>
              )}

              {/* Y axis labels */}
              {yGridLines.map(v => (
                <text key={v}
                  x={PAD.left - 6} y={py(v)}
                  textAnchor="end" dominantBaseline="middle"
                  fontSize="11" fill="#64748b"
                >{v}%</text>
              ))}

              {/* X axis labels */}
              {xLabels.map(n => (
                <text key={n}
                  x={px(n - 1)} y={PAD.top + CH + 14}
                  textAnchor="middle" fontSize="11" fill="#64748b"
                >{n}</text>
              ))}

              {/* Axes */}
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} stroke="#334155" strokeWidth="1" />
              <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH} stroke="#334155" strokeWidth="1" />
            </svg>

            <div className="text-xs text-slate-500 text-center mt-1 h-4">
              {hoverIdx !== null && coverages[hoverIdx] !== undefined
                ? `Canto ${hoverIdx + 1} · ${coverages[hoverIdx].toFixed(2)}%`
                : coverages[currentChapterNum] !== undefined
                  ? `You are at Canto ${currentChapterNum + 1} · ${coverages[currentChapterNum].toFixed(2)}% · ${totalVocab.toLocaleString()} unique words in the book`
                  : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
