// Vocabulario de marcadores embebidos en el HTML del guion.
// El TeleprompterEngine (Fase 2) leerá estas mismas clases/atributos para
// decidir si un marcador de pausa debe detener el autoscroll. En Fase 1
// solo se prepara la estructura del contenido; no hay reproducción todavía.

export const PAUSE_MARKER_CLASS = 'tp-marker-pause'
export const NOTE_MARKER_CLASS = 'tp-note'
export const AUTO_PAUSE_ATTR = 'data-auto-pause'

const PAUSE_VISUAL_STYLE = 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
const PAUSE_AUTO_STYLE = 'bg-amber-500/25 text-amber-200 border border-amber-400'

export function getPauseMarkerClassName(autoPause: boolean): string {
  return `${PAUSE_MARKER_CLASS} rounded px-1.5 py-0.5 text-xs font-semibold align-middle ${
    autoPause ? PAUSE_AUTO_STYLE : PAUSE_VISUAL_STYLE
  }`
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildPauseMarkerHtml(autoPause = false): string {
  const label = autoPause ? '⏸ PAUSA' : '[PAUSA]'
  return `<span class="${getPauseMarkerClassName(autoPause)}" contenteditable="false" ${AUTO_PAUSE_ATTR}="${autoPause}" data-marker="pause" title="Clic para alternar entre pausa visual y pausa automática (se usará en Fase 2)">${label}</span>&nbsp;`
}

export function buildNoteMarkerHtml(text = 'Nota: ', tempId?: string): string {
  const idAttr = tempId ? ` data-temp-id="${tempId}"` : ''
  return `<span class="${NOTE_MARKER_CLASS} italic text-sky-300/90"${idAttr} data-marker="note">${escapeHtml(text)}</span>`
}
