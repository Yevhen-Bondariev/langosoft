import { useCallback, useEffect, useState } from 'react';

const EN_KEY    = 'langosoft-voice';   // legacy key for English
const MULTI_KEY = 'langosoft-voices';  // new key: { en: "...", it: "...", de: "..." }

function pickDefaultVoice(voices: SpeechSynthesisVoice[]): string {
  const en = voices.filter(v => v.lang.startsWith('en'));
  const david = en.find(v => v.name.toLowerCase().includes('david'));
  if (david) return david.name;
  const male = en.find(v => /\b(david|mark|james|guy|reed|fred|ralph)\b/i.test(v.name));
  if (male) return male.name;
  return en[0]?.name ?? voices[0]?.name ?? '';
}

function loadStoredMap(): Record<string, string> {
  try {
    const multi = localStorage.getItem(MULTI_KEY);
    if (multi) return JSON.parse(multi) as Record<string, string>;
    // Migrate legacy single-voice key
    const legacy = localStorage.getItem(EN_KEY);
    if (legacy) return { en: legacy };
  } catch { /* ignore */ }
  return {};
}

export function useVoicePreference() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [langVoiceNames, setLangVoiceNames] = useState<Record<string, string>>(loadStoredMap);

  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length === 0) return;
      setVoices(v);
      setLangVoiceNames(prev => {
        if (prev['en'] && v.some(x => x.name === prev['en'])) return prev;
        const def = pickDefaultVoice(v);
        const updated = { ...prev, en: def };
        localStorage.setItem(MULTI_KEY, JSON.stringify(updated));
        return updated;
      });
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const setVoiceForLang = useCallback((lang: string, name: string) => {
    setLangVoiceNames(prev => {
      const updated = { ...prev, [lang]: name };
      localStorage.setItem(MULTI_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Legacy setter for English (used by existing callers)
  const setVoice = useCallback((name: string) => setVoiceForLang('en', name), [setVoiceForLang]);

  const getVoiceForLang = useCallback((lang: string): SpeechSynthesisVoice | null => {
    const prefix = lang.split('-')[0];
    const storedName = langVoiceNames[prefix];
    if (storedName) {
      const found = voices.find(v => v.name === storedName);
      if (found) return found;
    }
    // Auto-pick: prefer Google voice, then first match
    const matches = voices.filter(v => v.lang.startsWith(prefix));
    return matches.find(v => v.name.includes('Google')) ?? matches[0] ?? null;
  }, [voices, langVoiceNames]);

  // All voices available for a language prefix
  const getVoicesForLang = useCallback((lang: string): SpeechSynthesisVoice[] => {
    return voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
  }, [voices]);

  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const selectedVoice = voices.find(v => v.name === langVoiceNames['en']) ?? null;
  const selectedVoiceName = langVoiceNames['en'] ?? '';

  return {
    // Legacy API (unchanged)
    voices: englishVoices,
    selectedVoice,
    selectedVoiceName,
    setVoice,
    // Per-language API
    allVoices: voices,
    langVoiceNames,
    getVoiceForLang,
    getVoicesForLang,
    setVoiceForLang,
  };
}
