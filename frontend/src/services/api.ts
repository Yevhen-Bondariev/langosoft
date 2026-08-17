import type { Book, Chapter, Flashcard, Paragraph, ReadingProgress } from '../types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || 'http://localhost:5000/api';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  books: {
    list: () => req<Book[]>('/books'),
    chapters: (bookId: number) => req<Chapter[]>(`/books/${bookId}/chapters`),
    paragraphs: (bookId: number, chapterNum: number) =>
      req<Paragraph[]>(`/books/${bookId}/chapters/${chapterNum}/paragraphs`),
    import: () => req<{ message: string }>('/books/import', { method: 'POST' }),
  },
  progress: {
    get: (bookId: number) =>
      fetch(`${BASE}/progress/${bookId}`, { headers: { 'Content-Type': 'application/json' } })
        .then(r => (r.ok ? r.json() as Promise<ReadingProgress> : null))
        .catch(() => null),
    save: (bookId: number, data: { chapterNumber: number; paragraphIndex: number; wordIndex: number }) =>
      req<ReadingProgress>(`/progress/${bookId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  flashcards: {
    list: () => req<Flashcard[]>('/flashcards'),
    due: () => req<Flashcard[]>('/flashcards/due'),
    create: (data: {
      word: string;
      context: string;
      translation?: string;
      synonym?: string;
      bookId: number;
      chapterNumber: number;
      paragraphIndex: number;
    }) => req<Flashcard>('/flashcards', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { translation?: string; synonym?: string }) =>
      req<Flashcard>(`/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => req<void>(`/flashcards/${id}`, { method: 'DELETE' }),
    review: (id: number, correct: boolean) =>
      req<Flashcard>(`/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ correct }) }),
  },
  words: {
    translate: (word: string, context: string, targetLanguage: string) =>
      req<{ translation: string; synonym: string }>('/words/translate', {
        method: 'POST',
        body: JSON.stringify({ word, context, targetLanguage }),
      }),
  },
  grammar: {
    analyze: (text: string) =>
      req<{ tenses: string[] }>('/grammar/analyze', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  },
};
