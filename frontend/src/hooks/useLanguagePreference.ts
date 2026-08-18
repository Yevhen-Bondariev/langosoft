import { useCallback, useState } from 'react';

export interface LanguageOption {
  code: string;   // BCP 47 tag used for Web Speech API
  label: string;  // Native name shown in the UI
  name: string;   // English name sent to the translation API
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'uk', label: 'Українська', name: 'Ukrainian' },
  { code: 'en', label: 'English', name: 'English' },
  { code: 'es', label: 'Español', name: 'Spanish' },
  { code: 'de', label: 'Deutsch', name: 'German' },
  { code: 'fr', label: 'Français', name: 'French' },
  { code: 'pl', label: 'Polski', name: 'Polish' },
  { code: 'pt', label: 'Português', name: 'Portuguese' },
  { code: 'it', label: 'Italiano', name: 'Italian' },
  { code: 'ru', label: 'Русский', name: 'Russian' },
  { code: 'ar', label: 'العربية', name: 'Arabic' },
  { code: 'zh', label: '中文', name: 'Chinese' },
  { code: 'ja', label: '日本語', name: 'Japanese' },
  { code: 'ko', label: '한국어', name: 'Korean' },
  { code: 'tr', label: 'Türkçe', name: 'Turkish' },
  { code: 'nl', label: 'Nederlands', name: 'Dutch' },
  { code: 'he', label: 'עברית', name: 'Hebrew' },
];

const STORAGE_KEY = 'langosoft-language';

export function useLanguagePreference() {
  const [selectedLang, setSelectedLang] = useState<LanguageOption>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.find(l => l.code === saved) ?? LANGUAGES[0];
  });

  const setLanguage = useCallback((code: string) => {
    const lang = LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0];
    setSelectedLang(lang);
    localStorage.setItem(STORAGE_KEY, code);
  }, []);

  return { languages: LANGUAGES, selectedLang, setLanguage };
}
