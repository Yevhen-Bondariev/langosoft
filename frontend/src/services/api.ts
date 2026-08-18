import type { Book, Category, Chapter, ChapterStat, Flashcard, Paragraph, ReadingProgress } from '../types';

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
    stats: () => req<ChapterStat[]>('/flashcards/stats'),
    create: (data: {
      word: string;
      context: string;
      translation?: string;
      synonym?: string;
      bookId: number;
      chapterNumber: number;
      paragraphIndex: number;
      categoryId?: number | null;
    }) => req<Flashcard>('/flashcards', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { translation?: string; synonym?: string; categoryId?: number | null }) =>
      req<Flashcard>(`/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => req<void>(`/flashcards/${id}`, { method: 'DELETE' }),
    review: (id: number, correct: boolean) =>
      req<Flashcard>(`/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ correct }) }),
  },
  categories: {
    list: () => req<Category[]>('/categories'),
    create: (name: string, color = '#6366f1') =>
      req<Category>('/categories', { method: 'POST', body: JSON.stringify({ name, color }) }),
    delete: (id: number) => req<void>(`/categories/${id}`, { method: 'DELETE' }),
  },
  words: {
    translate: (word: string, context: string, targetLanguage: string) =>
      req<{ translation: string; synonym: string }>('/words/translate', {
        method: 'POST',
        body: JSON.stringify({ word, context, targetLanguage }),
      }),
    recallExplain: (original: string, typed: string) =>
      req<{ explanation: string }>('/words/recall-explain', {
        method: 'POST',
        body: JSON.stringify({ original, typed }),
      }),
    customExplain: (original: string, literary: string, literal: string, question: string) =>
      req<{ answer: string }>('/words/custom-explain', {
        method: 'POST',
        body: JSON.stringify({ original, literary, literal, question }),
      }),
    evaluateTranslation: (original: string, userTranslation: string, sourceLanguageCode: string, targetLanguageName: string) =>
      req<{ feedback: string }>('/words/evaluate-translation', {
        method: 'POST',
        body: JSON.stringify({ original, userTranslation, sourceLanguageCode, targetLanguageName }),
      }),
    gloss: (text: string, targetLanguage: string, sourceLanguageCode: string) =>
      req<{ gloss: string }>('/words/gloss', {
        method: 'POST',
        body: JSON.stringify({ text, targetLanguage, sourceLanguageCode }),
      }),
    translateParagraph: (text: string, targetLanguage: string, sourceLanguageCode = 'en', literal = false) =>
      req<{ translation: string }>('/words/translate-paragraph', {
        method: 'POST',
        body: JSON.stringify({ text, targetLanguage, sourceLanguageCode, literal }),
      }),
  },
  grammar: {
    analyze: (text: string, languageCode = 'en') =>
      req<{ tenses: string[] }>('/grammar/analyze', {
        method: 'POST',
        body: JSON.stringify({ text, languageCode }),
      }),
  },
  paragraphs: {
    archaisms: (paragraphId: number) =>
      req<{ archaisms: string }>(`/paragraphs/${paragraphId}/archaisms`),
    gloss: (paragraphId: number, targetLanguage = 'English') =>
      req<{ gloss: string }>(`/paragraphs/${paragraphId}/gloss?targetLanguage=${encodeURIComponent(targetLanguage)}`),
  },
};
