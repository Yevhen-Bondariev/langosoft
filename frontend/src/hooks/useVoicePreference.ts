import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'langosoft-voice';

function pickDefaultVoice(voices: SpeechSynthesisVoice[]): string {
  const en = voices.filter(v => v.lang.startsWith('en'));
  // Prefer Microsoft David (Windows), then any male-sounding en-US voice
  const david = en.find(v => v.name.toLowerCase().includes('david'));
  if (david) return david.name;
  const male = en.find(v => /\b(david|mark|james|guy|reed|fred|ralph)\b/i.test(v.name));
  if (male) return male.name;
  // Fall back to first English voice
  return en[0]?.name ?? voices[0]?.name ?? '';
}

export function useVoicePreference() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? ''
  );

  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length === 0) return;
      setVoices(v);
      setSelectedVoiceName(prev => {
        if (prev && v.some(x => x.name === prev)) return prev;
        // No stored preference or stored voice not available — pick default
        const def = pickDefaultVoice(v);
        localStorage.setItem(STORAGE_KEY, def);
        return def;
      });
    };

    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const setVoice = useCallback((name: string) => {
    setSelectedVoiceName(name);
    localStorage.setItem(STORAGE_KEY, name);
  }, []);

  const selectedVoice = voices.find(v => v.name === selectedVoiceName) ?? null;
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));

  return { voices: englishVoices, selectedVoice, selectedVoiceName, setVoice };
}
