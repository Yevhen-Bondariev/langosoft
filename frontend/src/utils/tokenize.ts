import type { WordToken } from '../types';

// Apostrophe variants found in literary texts:
//   U+0027 straight apostrophe  '
//   U+2018 left  single quote   ‘
//   U+2019 right single quote   ’ (used as apostrophe in most Project Gutenberg Italian texts)
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

  // Partition non-whitespace chars in each space token:
  //   opening punctuation (« ‹ “ ‘ ( [ {) -> prepend to the next word
  //   everything else (,.:;!? » › ) ] })             -> append to the previous word
  // Each character is classified independently so mixed cases like ':«' work correctly.
  const OPENING = new Set(['«', '‹', '“', '‘', '(', '[', '{']);

  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    if (curr.type !== 'space') continue;

    const nonws = curr.text.replace(/\s/g, '');
    if (!nonws) continue;

    let trailingPunct = '';
    let leadingPunct  = '';
    for (const ch of nonws) {
      if (OPENING.has(ch)) leadingPunct  += ch;
      else                  trailingPunct += ch;
    }

    if (trailingPunct && i > 0 && tokens[i - 1].type === 'word') {
      tokens[i - 1].text += trailingPunct;
    }
    if (leadingPunct) {
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'word') {
          tokens[j].text = leadingPunct + tokens[j].text;
          break;
        }
      }
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
