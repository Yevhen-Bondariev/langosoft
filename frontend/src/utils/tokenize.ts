import type { WordToken } from '../types';

export function tokenizeParagraph(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const regex = /([\p{L}''\-]+)|([^\p{L}''\-]+)/gu;
  let wordIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({
        type: 'word',
        text: match[1],
        wordIndex,
        rawWord: match[1].replace(/^[''\-]+|[''\-]+$/gu, ''),
      });
      wordIndex++;
    } else {
      tokens.push({
        type: 'space',
        text: match[2],
        wordIndex: null,
        rawWord: '',
      });
    }
  }

  return tokens;
}

export function getWordTokens(tokens: WordToken[]): WordToken[] {
  return tokens.filter(t => t.type === 'word');
}

export function clampWordIndex(index: number, tokens: WordToken[]): number {
  const wordCount = tokens.filter(t => t.type === 'word').length;
  if (wordCount === 0) return 0;
  return Math.max(0, Math.min(index, wordCount - 1));
}
