import { useCallback, useEffect, useRef, useState } from 'react';

const STATS_KEY = 'reading-stats-v2';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function prevDayStr(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface DailyEntry {
  minutes: number;
  newWords: number;
}

interface StoredStats {
  streak: number;
  longestStreak: number;
  lastReadDate: string;
  totalMinutes: number;
  goalMinutes: number;
  dailyLog: Record<string, DailyEntry>;
  seenWords: Record<number, string[]>; // bookId → normalized word list
}

const DEFAULT: StoredStats = {
  streak: 0, longestStreak: 0, lastReadDate: '',
  totalMinutes: 0, goalMinutes: 15,
  dailyLog: {}, seenWords: {},
};

function loadStats(): StoredStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) as Partial<StoredStats> };
  } catch { /* ignore */ }
  return { ...DEFAULT };
}

function saveStats(s: StoredStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

export function useReadingStats() {
  const [stats, setStats] = useState<StoredStats>(loadStats);
  // Ref-based sets for fast O(1) lookup without re-renders
  const seenSetsRef = useRef<Map<number, Set<string>>>(new Map());

  // Initialise seen-word sets from stored arrays on mount
  useEffect(() => {
    const s = loadStats();
    for (const [id, words] of Object.entries(s.seenWords)) {
      seenSetsRef.current.set(Number(id), new Set(words));
    }
  }, []);

  // Update streak once on mount (mark today as read)
  useEffect(() => {
    const t = todayStr();
    setStats(prev => {
      if (prev.lastReadDate === t) return prev;
      const streak =
        prev.lastReadDate === prevDayStr(t) ? prev.streak + 1 : 1;
      const updated: StoredStats = {
        ...prev,
        streak,
        longestStreak: Math.max(prev.longestStreak, streak),
        lastReadDate: t,
      };
      saveStats(updated);
      return updated;
    });
  }, []);

  // Track last time TTS fired — only count minutes when the user was listening.
  const lastSpeakRef = useRef(0);
  const onSpeak = useCallback(() => { lastSpeakRef.current = Date.now(); }, []);

  // Minute tick — only increments if TTS was active within the past 5 s.
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastSpeakRef.current > 5_000) return;
      const t = todayStr();
      setStats(prev => {
        const daily = { ...prev.dailyLog };
        const entry = daily[t] ?? { minutes: 0, newWords: 0 };
        daily[t] = { ...entry, minutes: entry.minutes + 1 };
        const updated: StoredStats = {
          ...prev, totalMinutes: prev.totalMinutes + 1, dailyLog: daily,
        };
        saveStats(updated);
        return updated;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const setGoalMinutes = useCallback((goal: number) => {
    setStats(prev => {
      const updated = { ...prev, goalMinutes: Math.max(5, Math.min(120, goal)) };
      saveStats(updated);
      return updated;
    });
  }, []);

  /** Call when the user navigates to a word. Returns true if it's a new word (never seen before). */
  const trackWord = useCallback((bookId: number, word: string): boolean => {
    if (!word) return false;
    const norm = word.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (!norm || norm.length < 2) return false;

    let set = seenSetsRef.current.get(bookId);
    if (!set) { set = new Set(); seenSetsRef.current.set(bookId, set); }
    if (set.has(norm)) return false;

    set.add(norm);
    const t = todayStr();
    setStats(prev => {
      const daily = { ...prev.dailyLog };
      const entry = daily[t] ?? { minutes: 0, newWords: 0 };
      daily[t] = { ...entry, newWords: entry.newWords + 1 };
      const updated: StoredStats = {
        ...prev,
        seenWords: { ...prev.seenWords, [bookId]: Array.from(set!) },
        dailyLog: daily,
      };
      saveStats(updated);
      return updated;
    });
    return true;
  }, []);

  const t = todayStr();
  const todayEntry = stats.dailyLog[t] ?? { minutes: 0, newWords: 0 };

  return {
    streak: stats.streak,
    longestStreak: stats.longestStreak,
    todayMinutes: todayEntry.minutes,
    totalMinutes: stats.totalMinutes,
    goalMinutes: stats.goalMinutes,
    todayNewWords: todayEntry.newWords,
    dailyLog: stats.dailyLog,
    trackWord,
    setGoalMinutes,
    onSpeak,
  };
}
