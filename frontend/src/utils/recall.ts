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

export function wordDiff(original: string, typed: string): DiffSegment[] {
  // Whitespace-split so punctuation is preserved as part of each token ("book." ≠ "book")
  const origTokens = original.trim().split(/\s+/).filter(Boolean);
  const typedTokens = typed.trim().split(/\s+/).filter(Boolean);
  const origNorm = origTokens.map(w => w.toLowerCase());
  const typedNorm = typedTokens.map(w => w.toLowerCase());

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
