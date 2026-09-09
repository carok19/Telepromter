// Conteo de palabras y estimación de duración a partir de PPM (palabras por
// minuto). El TeleprompterEngine (Fase 2) reutilizará estas mismas funciones
// combinándolas con la velocidad configurada en cada momento de la reproducción.
import { NOTE_MARKER_CLASS, PAUSE_MARKER_CLASS } from './markers'

export const DEFAULT_WPM = 130

// Elementos de bloque estándar de HTML. `textContent` concatena el texto de
// elementos hermanos sin insertar separador alguno (p. ej. "<div>a</div>
// <div>b</div>" da "ab", no "a b"), así que dos líneas/párrafos distintos
// terminan pegados en una sola palabra. Se usa esta lista (no solo `<div>`,
// para que el conteo sea correcto sin importar qué elemento de bloque haya
// generado el navegador) para insertar un separador antes y después de cada
// bloque — y también en cada `<br>` — durante el recorrido del árbol.
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIALOG',
  'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV',
  'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'UL',
])

// Recorre `childNodes` (nunca `.children`, para no perder texto suelto que
// esté directamente bajo la raíz o bajo un elemento en línea) y concatena el
// texto legible, insertando un separador en cada límite de bloque/`<br>` y
// excluyendo por completo los marcadores de pausa y las notas (ni su texto
// ni el hecho de removerlos debe pegar las palabras de alrededor).
function extractReadableText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const parts: string[] = []

  function walk(node: ChildNode) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (el.classList.contains(PAUSE_MARKER_CLASS) || el.classList.contains(NOTE_MARKER_CLASS)) {
      parts.push(' ')
      return
    }
    if (el.tagName === 'BR') {
      parts.push(' ')
      return
    }
    const isBlock = BLOCK_TAGS.has(el.tagName)
    if (isBlock) parts.push(' ')
    el.childNodes.forEach(walk)
    if (isBlock) parts.push(' ')
  }

  doc.body.childNodes.forEach(walk)
  return parts.join('')
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
