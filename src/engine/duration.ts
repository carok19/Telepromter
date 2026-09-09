// Conteo de palabras y estimación de duración a partir de PPM (palabras por
// minuto). El TeleprompterEngine (Fase 2) reutilizará estas mismas funciones
// combinándolas con la velocidad configurada en cada momento de la reproducción.
import { NOTE_MARKER_CLASS, PAUSE_MARKER_CLASS } from './markers'

export const DEFAULT_WPM = 130

function extractReadableText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll(`.${PAUSE_MARKER_CLASS}, .${NOTE_MARKER_CLASS}`).forEach((el) => el.remove())
  return doc.body.textContent ?? ''
}

export function countWords(html: string): number {
  const text = extractReadableText(html).trim()
  if (!text) return 0
  return text.split(/\s+/).length
}

export function estimateDurationSeconds(wordCount: number, wpm: number = DEFAULT_WPM): number {
  if (wpm <= 0) return 0
  return Math.round((wordCount / wpm) * 60)
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
