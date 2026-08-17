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

export function useTTS(voice?: SpeechSynthesisVoice | null, rate = 0.9) {
  const speak = useCallback((text: string, options?: SpeakOptions) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = options?.rate ?? rate;
    u.pitch = options?.pitch ?? 1;

    if (options?.lang) {
      // Try to find a voice for the requested language; fall back to the user's
      // selected English voice so something is always audible.
      const langPrefix = options.lang.split('-')[0];
      const match = window.speechSynthesis.getVoices().find(v => v.lang.startsWith(langPrefix));
      if (match) { u.voice = match; u.lang = match.lang; }
      else        { if (voice) u.voice = voice; u.lang = 'en-GB'; }
    } else {
      u.lang = 'en-GB';
      if (voice) u.voice = voice;
    }

    window.speechSynthesis.speak(u);
  }, [voice, rate]);

  // Speak multiple texts in sequence, waiting for each to finish before starting the next.
  const speakChain = useCallback((items: ChainItem[]) => {
    window.speechSynthesis.cancel();
    const go = (index: number) => {
      if (index >= items.length) return;
      const item = items[index];
      if (!item.text?.trim()) { go(index + 1); return; }
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = item.lang ?? 'en-GB';
      u.rate = item.rate ?? rate;
      if (voice && !item.lang) u.voice = voice;
      u.onend = () => go(index + 1);
      u.onerror = () => go(index + 1);
      window.speechSynthesis.speak(u);
    };
    go(0);
  }, [voice, rate]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  const isSpeaking = useCallback(() => window.speechSynthesis.speaking, []);

  return { speak, speakChain, stop, isSpeaking };
}
