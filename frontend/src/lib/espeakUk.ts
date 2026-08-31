// Ukrainian TTS via backend proxy → Google Translate audio.
// The proxy adds the required User-Agent / Referer headers that browsers can't set.

import { BASE } from '../services/api';

let currentAudio: HTMLAudioElement | null = null;

export function stopUkrainian(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

export async function speakUkrainian(text: string, rate = 0.9): Promise<void> {
  if (!text.trim()) return;
  stopUkrainian();

  const ttsBase = BASE.replace(/\/api$/, '');
  const url = `${ttsBase}/api/tts?text=${encodeURIComponent(text)}&lang=uk`;
  const audio = new Audio(url);
  audio.playbackRate = rate;
  currentAudio = audio;

  return new Promise(resolve => {
    audio.onended = () => { currentAudio = null; resolve(); };
    audio.onerror = () => { currentAudio = null; resolve(); };
    audio.play().catch(() => resolve());
  });
}

export function preloadEspeakUk(): void {}
