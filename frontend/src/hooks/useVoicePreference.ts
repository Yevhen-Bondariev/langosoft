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
        // Always prefer David if available — overrides any stored name drift
        const best = pickDefaultVoice(v);
        if (prev['en'] === best) return prev;
        const updated = { ...prev, en: best };
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
      // Exact match
      const found = voices.find(v => v.name === storedName);
      if (found) return found;
      // Partial match: "Microsoft David Desktop" ↔ "Microsoft David" (browser name drift)
      const key = storedName.split(' ').slice(0, 3).join(' ');
      const partial = voices.find(v => v.name.startsWith(key));
      if (partial) return partial;
    }
    const matches = voices.filter(v => v.lang.startsWith(prefix));
    if (prefix === 'en') {
      // For English prefer David/male over Google (Google US English is typically female)
      const david = matches.find(v => v.name.toLowerCase().includes('david'));
      if (david) return david;
      const male = matches.find(v => /\b(mark|james|guy|reed|fred|ralph)\b/i.test(v.name));
      if (male) return male;
    }
    return matches.find(v => v.name.includes('Google')) ?? matches[0] ?? null;
  }, [voices, langVoiceNames]);

  // All voices available for a language prefix
  const getVoicesForLang = useCallback((lang: string): SpeechSynthesisVoice[] => {
    return voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
  }, [voices]);

  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const selectedVoiceName = langVoiceNames['en'] ?? '';
  // Exact match first; if stored name has "david" accept any David voice (handles name drift)
  const selectedVoice = voices.find(v => v.name === selectedVoiceName)
    ?? (selectedVoiceName.toLowerCase().includes('david')
        ? voices.find(v => v.name.toLowerCase().includes('david')) ?? null
        : null);

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
