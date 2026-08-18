interface ReadingProps {
  mode: 'reading';
  onPrevWord: () => void;
  onNextWord: () => void;
  onReadLine: () => void;
  onTranslate: () => void;
  onRecall: () => void;
  onAddFlashcard: () => void;
  onOpenMenu: () => void;
  onStop: () => void;
}

interface RecallProps {
  mode: 'recall';
  onHearOriginal: () => void;
  onHearAnswer: () => void;
  onCheck: () => void;
  onRetry: () => void;
  onBack: () => void;
  hasResult: boolean;
}

type Props = ReadingProps | RecallProps;

const BTN = 'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg active:bg-slate-700 transition-colors text-slate-300 active:text-white min-h-[52px]';
const ICON = 'text-lg leading-none';
const LABEL = 'text-[10px] leading-none text-slate-500';

export function MobileActionBar(props: Props) {
  if (props.mode === 'reading') {
    const { onPrevWord, onNextWord, onReadLine, onTranslate, onRecall, onAddFlashcard, onOpenMenu, onStop } = props;
    return (
      <div className="mobile-action-bar bg-slate-900 border-t border-slate-800 shrink-0 px-1" role="toolbar" aria-label="Reading controls">
        <div className="flex items-stretch gap-0.5">
          <button className={BTN} onClick={onStop} aria-label="Stop speech">
            <span className={ICON}>⏹</span>
            <span className={LABEL}>Stop</span>
          </button>
          <button className={BTN} onClick={onPrevWord} aria-label="Previous word">
            <span className={ICON}>◀</span>
            <span className={LABEL}>Prev</span>
          </button>
          <button className={BTN} onClick={onNextWord} aria-label="Next word">
            <span className={ICON}>▶</span>
            <span className={LABEL}>Next</span>
          </button>
          <button className={BTN} onClick={onReadLine} aria-label="Read current line aloud">
            <span className={ICON}>🔊</span>
            <span className={LABEL}>Read</span>
          </button>
          <button className={BTN} onClick={onTranslate} aria-label="Translate current line">
            <span className={ICON}>🌐</span>
            <span className={LABEL}>Translate</span>
          </button>
          <button className={BTN} onClick={onAddFlashcard} aria-label="Add current word to flashcards">
            <span className={ICON}>＋</span>
            <span className={LABEL}>Save</span>
          </button>
          <button className={BTN} onClick={onRecall} aria-label="Enter recall practice mode">
            <span className={ICON}>✍</span>
            <span className={LABEL}>Recall</span>
          </button>
          <button className={BTN} onClick={onOpenMenu} aria-label="Open navigation menu">
            <span className={ICON}>☰</span>
            <span className={LABEL}>Menu</span>
          </button>
        </div>
      </div>
    );
  }

  const { onHearOriginal, onHearAnswer, onCheck, onRetry, onBack, hasResult } = props;
  return (
    <div className="mobile-action-bar bg-slate-900 border-t border-slate-800 shrink-0 px-1" role="toolbar" aria-label="Recall controls">
      <div className="flex items-stretch gap-0.5">
        <button className={BTN} onClick={onBack} aria-label="Exit recall mode">
          <span className={ICON}>✕</span>
          <span className={LABEL}>Back</span>
        </button>
        <button className={BTN} onClick={onHearOriginal} aria-label="Hear original sentence">
          <span className={ICON}>🔊</span>
          <span className={LABEL}>Original</span>
        </button>
        <button className={BTN} onClick={onHearAnswer} aria-label="Hear model answer">
          <span className={ICON}>💡</span>
          <span className={LABEL}>Answer</span>
        </button>
        {hasResult ? (
          <button className={BTN} onClick={onRetry} aria-label="Retry this sentence">
            <span className={ICON}>↺</span>
            <span className={LABEL}>Retry</span>
          </button>
        ) : (
          <button className={BTN} onClick={onCheck} aria-label="Check your answer">
            <span className={ICON}>✓</span>
            <span className={LABEL}>Check</span>
          </button>
        )}
      </div>
    </div>
  );
}
