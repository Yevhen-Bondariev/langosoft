export interface Book {
  id: number;
  title: string;
  author: string;
  language: string; // BCP-47 code of the book's own language, e.g. "en", "it"
  chapterCount: number;
}

export interface Chapter {
  id: number;
  bookId: number;
  number: number;
  title: string;
  paragraphCount: number;
}

export interface Paragraph {
  id: number;
  chapterId: number;
  index: number;
  text: string;
  longfellowText?: string;
}

export interface Category {
  id: number;
  name: string;
  isDefault: boolean;
  color: string;
}

export interface ChapterStat {
  bookId: number;
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  count: number;
}

export interface Flashcard {
  id: number;
  word: string;
  context: string;
  translation: string;
  synonym: string;
  bookId: number;
  chapterNumber: number;
  paragraphIndex: number;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: string;
  addedAt: string;
  categoryId?: number | null;
  categoryName?: string | null;
  categoryColor?: string | null;
}

export interface ReadingProgress {
  bookId: number;
  chapterNumber: number;
  paragraphIndex: number;
  wordIndex: number;
  lastRead: string;
}

export type ReaderMode = 'reading' | 'search' | 'add-flashcard';
export type FlashcardMode = 'translation' | 'synonym';
export type AppView = 'reader' | 'flashcards' | 'words' | 'essay';

export interface WordToken {
  type: 'word' | 'space' | 'punct';
  text: string;
  wordIndex: number | null; // null for non-word tokens
  rawWord: string; // cleaned word without punctuation
}
