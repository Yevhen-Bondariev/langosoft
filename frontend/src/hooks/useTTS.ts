import { useCallback } from 'react';
import { speakUkrainian, stopUkrainian } from '../lib/espeakUk';

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

// Per-language calibration: the Google Italian voice speaks significantly faster
// than English/Ukrainian at the same rate value, so scale it down to match.
const LANG_RATE_SCALE: Partial<Record<string, number>> = {
  it: 0.75,
  uk: 1.25,
};

type VoiceResolver = (lang: string) => SpeechSynthesisVoice | null;

// Fallback auto-picker used when no resolver is provided.
function pickVoice(langPrefix: string): SpeechSynthesisVoice | null {
  const matches = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(langPrefix));
  if (matches.length === 0) return null;
  return matches.find(v => v.name.includes('Google')) ?? matches[0];
}

export function useTTS(
  voice?: SpeechSynthesisVoice | null,
  rate = 0.9,
  defaultLang = 'en',
  getVoiceForLang?: VoiceResolver,
) {
  const resolveVoice = useCallback((langPrefix: string): SpeechSynthesisVoice | null => {
    if (langPrefix === 'en') return voice ?? null;
    return getVoiceForLang ? getVoiceForLang(langPrefix) : pickVoice(langPrefix);
  }, [voice, getVoiceForLang]);

  const speak = useCallback((text: string, options?: SpeakOptions) => {
    window.speechSynthesis.cancel();
    stopUkrainian();

    const targetLang = options?.lang ?? defaultLang;
    const langPrefix = targetLang.split('-')[0];

    // Always use eSpeak-NG WASM for Ukrainian — Windows native voices are absent or incorrect.
    if (langPrefix === 'uk') {
      void speakUkrainian(text, (options?.rate ?? rate) * (LANG_RATE_SCALE['uk'] ?? 1));
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.rate = (options?.rate ?? rate) * (LANG_RATE_SCALE[langPrefix] ?? 1);
    u.pitch = options?.pitch ?? 1;

    const match = resolveVoice(langPrefix);
    if (match) {
      u.voice = match; u.lang = match.lang;
    } else {
      u.lang = targetLang;
    }

    window.speechSynthesis.speak(u);
  }, [resolveVoice, voice, rate, defaultLang]);

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
        u.rate = (item.rate ?? rate) * (LANG_RATE_SCALE[langPrefix] ?? 1);
        const match = resolveVoice(langPrefix);
        if (match) { u.voice = match; u.lang = match.lang; }
        else u.lang = item.lang;
      } else {
        u.rate = item.rate ?? rate;
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        else u.lang = 'en-GB';
      }
      u.onend = () => go(index + 1);
      u.onerror = () => go(index + 1);
      window.speechSynthesis.speak(u);
    };
    go(0);
  }, [resolveVoice, voice, rate]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    stopUkrainian();
  }, []);

  const isSpeaking = useCallback(() => window.speechSynthesis.speaking, []);

  return { speak, speakChain, stop, isSpeaking };
}
