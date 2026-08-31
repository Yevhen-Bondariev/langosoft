import type { WordToken } from '../types';

// Apostrophe variants found in literary texts:
//   U+0027 straight apostrophe  '
//   U+2018 left  single quote   '
//   U+2019 right single quote   ' (used as apostrophe in most Project Gutenberg Italian texts)
const APOS = "'‘’";
const wordRe   = new RegExp(`([\\p{L}${APOS}\\-]+)|([^\\p{L}${APOS}\\-]+)`, 'gu');
const stripRe  = new RegExp(`^[${APOS}\\-]+|[${APOS}\\-]+$`, 'gu');

export function tokenizeParagraph(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  wordRe.lastIndex = 0;
  let wordIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = wordRe.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({
        type: 'word',
        text: match[1],
        wordIndex,
        rawWord: match[1].replace(stripRe, ''),
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

  // Attach trailing punctuation from each space token to the preceding word's display text.
  // rawWord is left clean for TTS / dictionary / flashcard lookups.
  // Example: ["vita", ",\n  ", "mi"] → [{text:"vita,", rawWord:"vita"}, space, {text:"mi"…}]
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const curr = tokens[i];
    if (prev.type === 'word' && curr.type === 'space') {
      const punct = curr.text.replace(/\s/g, '');
      if (punct) prev.text += punct;
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
