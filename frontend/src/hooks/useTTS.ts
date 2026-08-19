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

// Pick the best available voice for a language prefix.
// Prefers Google voices (highest quality, typically female for Romance languages)
// over system/offline voices which are often lower-quality male.
function pickVoice(langPrefix: string): SpeechSynthesisVoice | null {
  const matches = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(langPrefix));
  if (matches.length === 0) return null;
  return matches.find(v => v.name.includes('Google')) ?? matches[0];
}

export function useTTS(voice?: SpeechSynthesisVoice | null, rate = 0.9, defaultLang = 'en') {
  const speak = useCallback((text: string, options?: SpeakOptions) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = options?.rate ?? rate;
    u.pitch = options?.pitch ?? 1;

    const targetLang = options?.lang ?? defaultLang;
    const langPrefix = targetLang.split('-')[0];
    if (langPrefix === 'en' && voice) {
      u.voice = voice; u.lang = voice.lang;
    } else {
      const match = pickVoice(langPrefix);
      if (match) {
        u.voice = match; u.lang = match.lang;
      } else if (voice) {
        u.voice = voice; u.lang = voice.lang;
      } else {
        u.lang = targetLang;
      }
    }

    window.speechSynthesis.speak(u);
  }, [voice, rate, defaultLang]);

  // Speak multiple texts in sequence, waiting for each to finish before starting the next.
  const speakChain = useCallback((items: ChainItem[]) => {
    window.speechSynthesis.cancel();
    const go = (index: number) => {
      if (index >= items.length) return;
      const item = items[index];
      if (!item.text?.trim()) { go(index + 1); return; }
      const u = new SpeechSynthesisUtterance(item.text);
      u.rate = item.rate ?? rate;
      if (item.lang) {
        const langPrefix = item.lang.split('-')[0];
        if (langPrefix === 'en' && voice) {
          u.voice = voice; u.lang = voice.lang;
        } else {
          const match = pickVoice(langPrefix);
          if (match) { u.voice = match; u.lang = match.lang; }
          else u.lang = item.lang;
        }
      } else if (voice) {
        u.voice = voice; u.lang = voice.lang;
      } else {
        u.lang = 'en-GB';
      }
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
