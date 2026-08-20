import { tokenizeParagraph, getWordTokens } from './tokenize';

export type DiffSegment =
  | { kind: 'match'; text: string }
  | { kind: 'missing'; text: string }
  | { kind: 'extra'; text: string };

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let remaining = text.trim();
  const re = /^([^.!?]*[.!?]+['")\]]*)\s*/;
  while (remaining.length > 0) {
    const m = remaining.match(re);
    if (m) {
      const s = m[1].trim();
      if (s) sentences.push(s);
      remaining = remaining.slice(m[0].length);
    } else {
      if (remaining.trim()) sentences.push(remaining.trim());
      break;
    }
  }
  // Merge very-short fragments (abbreviations like "Mr.") with the next sentence
  const result: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const wc = getWordTokens(tokenizeParagraph(sentences[i])).length;
    if (wc < 2 && i + 1 < sentences.length) {
      sentences[i + 1] = sentences[i] + ' ' + sentences[i + 1];
    } else {
      result.push(sentences[i]);
    }
  }
  return result.length > 0 ? result : [text.trim()];
}

// Returns which verse line (0-based) contains wordIndex, and how many lines exist.
// For prose (no \n): lineIndex 0, totalLines 1.
export function lineIndexAtWord(paragraphText: string, wordIndex: number): { lineIndex: number; totalLines: number } {
  if (!paragraphText.includes('\n')) return { lineIndex: 0, totalLines: 1 };
  const lines = paragraphText.split('\n').filter(l => l.trim().length > 0);
  let cum = 0;
  for (let i = 0; i < lines.length; i++) {
    const count = getWordTokens(tokenizeParagraph(lines[i])).length;
    if (wordIndex < cum + count) return { lineIndex: i, totalLines: lines.length };
    cum += count;
  }
  return { lineIndex: lines.length - 1, totalLines: lines.length };
}

// Returns the word index of the first word on verse line `lineIndex`.
export function firstWordOfLine(paragraphText: string, lineIndex: number): number {
  if (!paragraphText.includes('\n')) return 0;
  const lines = paragraphText.split('\n').filter(l => l.trim().length > 0);
  let cum = 0;
  for (let i = 0; i < lineIndex && i < lines.length; i++) {
    cum += getWordTokens(tokenizeParagraph(lines[i])).length;
  }
  return cum;
}

// For poetry (text contains \n): return the verse line that contains wordIndex.
// For prose: fall back to sentence-level extraction.
export function lineAtWord(paragraphText: string, wordIndex: number): string {
  if (!paragraphText.includes('\n')) return sentenceAtWord(paragraphText, wordIndex);
  const lines = paragraphText.split('\n').filter(l => l.trim().length > 0);
  let cum = 0;
  for (const line of lines) {
    const count = getWordTokens(tokenizeParagraph(line)).length;
    if (wordIndex < cum + count) return line.trim();
    cum += count;
  }
  return lines.at(-1)?.trim() ?? paragraphText;
}

export function sentenceAtWord(paragraphText: string, wordIndex: number): string {
  const sentences = splitSentences(paragraphText);
  let cum = 0;
  for (const s of sentences) {
    const count = getWordTokens(tokenizeParagraph(s)).length;
    if (wordIndex < cum + count) return s;
    cum += count;
  }
  return sentences.at(-1) ?? paragraphText;
}

// Normalize a word for diff comparison: lowercase + unify apostrophe variants + strip diacritics
const normForDiff = (w: string) =>
  w.toLowerCase()
   .replace(/['''ʼʹ`]/g, "'")
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9']/g, '');

export function wordDiff(original: string, typed: string): DiffSegment[] {
  // Whitespace-split so punctuation is preserved as part of each token ("book." ≠ "book")
  const origTokens = original.trim().split(/\s+/).filter(Boolean);
  const typedTokens = typed.trim().split(/\s+/).filter(Boolean);
  const origNorm = origTokens.map(normForDiff);
  const typedNorm = typedTokens.map(normForDiff);

  const m = origNorm.length, n = typedNorm.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = origNorm[i - 1] === typedNorm[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const ops: Array<['match' | 'orig' | 'typed', string]> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origNorm[i - 1] === typedNorm[j - 1]) {
      ops.unshift(['match', origTokens[i - 1]]);
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift(['typed', typedTokens[j - 1]]);
      j--;
    } else {
      ops.unshift(['orig', origTokens[i - 1]]);
      i--;
    }
  }

  return ops.map(([kind, word]) =>
    kind === 'match' ? { kind: 'match', text: word } :
    kind === 'orig'  ? { kind: 'missing', text: word } :
                       { kind: 'extra', text: word }
  );
}

export function recallScore(diff: DiffSegment[]): { correct: number; total: number; missing: string[] } {
  const correct = diff.filter(d => d.kind === 'match').length;
  const total = diff.filter(d => d.kind !== 'extra').length;
  const missing = diff.filter(d => d.kind === 'missing').map(d => d.text);
  return { correct, total, missing };
}
