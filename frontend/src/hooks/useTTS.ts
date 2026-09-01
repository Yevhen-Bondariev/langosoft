import { useCallback } from 'react';
import { speakUkrainian, stopUkrainian } from '../lib/espeakUk';

interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
  onend?: () => void;
}

interface ChainItem {
  text: string;
  lang?: string;
  rate?: number;
}

type VoiceResolver = (lang: string) => SpeechSynthesisVoice | null;

// Fallback auto-picker used when no resolver is provided.
function pickVoice(langPrefix: string): SpeechSynthesisVoice | null {
  const matches = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(langPrefix));
  if (matches.length === 0) return null;
  return matches.find(v => v.name.includes('Google')) ?? matches[0];
}

export function useTTS(
  voice?: SpeechSynthesisVoice | null,
  langRates: Record<string, number> = {},
  defaultLang = 'en',
  getVoiceForLang?: VoiceResolver,
) {
  const resolveVoice = useCallback((langPrefix: string): SpeechSynthesisVoice | null => {
    // For English: try explicit selectedVoice first, fall back to getVoiceForLang
    // (handles name-mismatch where selectedVoice is null but getVoiceForLang auto-picks David)
    if (langPrefix === 'en') {
      if (voice) return voice;
      return getVoiceForLang ? getVoiceForLang('en') : pickVoice('en');
    }
    return getVoiceForLang ? getVoiceForLang(langPrefix) : pickVoice(langPrefix);
  }, [voice, getVoiceForLang]);

  const getRate = useCallback((langPrefix: string): number => {
    return langRates[langPrefix] ?? langRates['en'] ?? 0.9;
  }, [langRates]);

  const speak = useCallback((text: string, options?: SpeakOptions) => {
    window.speechSynthesis.cancel();
    stopUkrainian();

    const targetLang = options?.lang ?? defaultLang;
    const langPrefix = targetLang.split('-')[0];

    // Always use eSpeak-NG WASM for Ukrainian — Windows native voices are absent or incorrect.
    if (langPrefix === 'uk') {
      void speakUkrainian(text, options?.rate ?? getRate('uk'));
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.rate = options?.rate ?? getRate(langPrefix);
    u.pitch = options?.pitch ?? 1;

    const match = resolveVoice(langPrefix);
    if (match) {
      u.voice = match; u.lang = match.lang;
    } else {
      u.lang = targetLang;
    }

    if (options?.onend) u.onend = () => options.onend!();
    window.speechSynthesis.speak(u);
  }, [resolveVoice, getRate, voice, defaultLang]);

  // Speak multiple texts in sequence, waiting for each to finish before starting the next.
  const speakChain = useCallback((items: ChainItem[]) => {
    window.speechSynthesis.cancel();
    const go = (index: number) => {
      if (index >= items.length) return;
      const item = items[index];
      if (!item.text?.trim()) { go(index + 1); return; }
      const u = new SpeechSynthesisUtterance(item.text);
      if (item.lang) {
        const langPrefix = item.lang.split('-')[0];
        u.rate = item.rate ?? getRate(langPrefix);
        const match = resolveVoice(langPrefix);
        if (match) { u.voice = match; u.lang = match.lang; }
        else u.lang = item.lang;
      } else {
        u.rate = item.rate ?? getRate('en');
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        else u.lang = 'en-GB';
      }
      u.onend = () => go(index + 1);
      u.onerror = () => go(index + 1);
      window.speechSynthesis.speak(u);
    };
    go(0);
  }, [resolveVoice, getRate, voice]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    stopUkrainian();
  }, []);

  const isSpeaking = useCallback(() => window.speechSynthesis.speaking, []);

  return { speak, speakChain, stop, isSpeaking };
}
