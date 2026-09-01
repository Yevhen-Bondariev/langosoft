import { useEffect } from 'react';

interface Props {
  cantoTitle: string;
  newWords: number;
  onClose: () => void;
}

export function CantoComplete({ cantoTitle, newWords, onClose }: Props) {
  useEffect(() => {
    const id = setTimeout(onClose, 4000);
    return () => clearTimeout(id);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
    >
      <div
        className="pointer-events-auto bg-slate-900/95 border border-amber-500/40 rounded-2xl shadow-2xl px-10 py-8 text-center max-w-sm mx-4 animate-[fadeInUp_0.4s_ease-out]"
        onClick={onClose}
      >
        <div className="text-4xl mb-3">🎉</div>
        <div className="text-amber-400 font-bold text-lg mb-1">{cantoTitle} complete!</div>
        {newWords > 0 && (
          <div className="text-slate-400 text-sm">
            {newWords} new Italian word{newWords !== 1 ? 's' : ''} today
          </div>
        )}
        <div className="text-slate-600 text-xs mt-3">click to dismiss</div>
      </div>
    </div>
  );
}
