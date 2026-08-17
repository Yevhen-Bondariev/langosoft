import type { Chapter } from '../types';

interface Props {
  chapters: Chapter[];
  currentChapterNum: number;
  onSelect: (num: number) => void;
}

export default function ChapterList({ chapters, currentChapterNum, onSelect }: Props) {
  return (
    <div className="py-2">
      {chapters.map(ch => (
        <button
          key={ch.id}
          onClick={() => onSelect(ch.number)}
          className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
            ch.number === currentChapterNum
              ? 'bg-amber-500/20 text-amber-300 font-medium'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {ch.title || `Chapter ${ch.number}`}
        </button>
      ))}
    </div>
  );
}
