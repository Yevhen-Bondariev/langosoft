import { useCallback } from 'react';

interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
}

interface ChainItem {
  text: string;
  lang?: string;
  rate?: number;
}

export function useTTS(voice?: SpeechSynthesisVoice | null) {
  const speak = useCallback((text: string, options?: SpeakOptions) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = options?.lang ?? 'en-GB';
    u.rate = options?.rate ?? 0.9;
    u.pitch = options?.pitch ?? 1;
    if (voice && !options?.lang) u.voice = voice;
    window.speechSynthesis.speak(u);
  }, [voice]);

  // Speak multiple texts in sequence, waiting for each to finish before starting the next.
  // Pass lang:'uk' for Ukrainian items so the browser picks the right voice.
  const speakChain = useCallback((items: ChainItem[]) => {
    window.speechSynthesis.cancel();
    const go = (index: number) => {
      if (index >= items.length) return;
      const item = items[index];
      if (!item.text?.trim()) { go(index + 1); return; }
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = item.lang ?? 'en-GB';
      u.rate = item.rate ?? 0.85;
      if (voice && !item.lang) u.voice = voice;
      u.onend = () => go(index + 1);
      u.onerror = () => go(index + 1);
      window.speechSynthesis.speak(u);
    };
    go(0);
  }, [voice]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  const isSpeaking = useCallback(() => window.speechSynthesis.speaking, []);

  return { speak, speakChain, stop, isSpeaking };
}
