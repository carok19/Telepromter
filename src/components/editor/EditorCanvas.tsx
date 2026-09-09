import { forwardRef, useImperativeHandle, useRef, type MouseEvent } from 'react'
import {
  AUTO_PAUSE_ATTR,
  PAUSE_MARKER_CLASS,
  buildNoteMarkerHtml,
  buildPauseMarkerHtml,
  getPauseMarkerClassName,
} from '../../engine/markers'

export interface EditorCanvasHandle {
  setContent: (html: string) => void
  focus: () => void
  exec: (command: string, value?: string) => void
  insertPauseMarker: () => void
  insertNoteMarker: () => void
  queryState: (command: string) => boolean
  queryBlockType: () => string
}

interface EditorCanvasProps {
  onChange: (html: string) => void
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { onChange },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null)

  const emitChange = () => {
    if (elRef.current) onChange(elRef.current.innerHTML)
  }

  useImperativeHandle(ref, () => ({
    setContent(html: string) {
      if (elRef.current) elRef.current.innerHTML = html
    },
    focus() {
      elRef.current?.focus()
    },
    exec(command: string, value?: string) {
      elRef.current?.focus()
      document.execCommand(command, false, value)
      emitChange()
    },
    insertPauseMarker() {
      elRef.current?.focus()
      document.execCommand('insertHTML', false, buildPauseMarkerHtml(false))
      emitChange()
    },
    insertNoteMarker() {
      const el = elRef.current
      if (!el) return
      el.focus()
      const selectionText = window.getSelection()?.toString() ?? ''
      const tempId = `tp-note-${Date.now()}`
      document.execCommand('insertHTML', false, buildNoteMarkerHtml(selectionText || 'Nota: ', tempId))

      const inserted = el.querySelector(`[data-temp-id="${tempId}"]`)
      if (inserted) {
        inserted.removeAttribute('data-temp-id')
        const range = document.createRange()
        range.selectNodeContents(inserted)
        range.collapse(false)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
      emitChange()
    },
    queryState(command: string) {
      try {
        return document.queryCommandState(command)
      } catch {
        return false
      }
    },
    queryBlockType() {
      try {
        return document.queryCommandValue('formatBlock').toLowerCase()
      } catch {
        return ''
      }
    },
  }))

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest(`.${PAUSE_MARKER_CLASS}`) as HTMLElement | null
    if (!target) return
    const isAuto = target.getAttribute(AUTO_PAUSE_ATTR) === 'true'
    const nextAuto = !isAuto
    target.setAttribute(AUTO_PAUSE_ATTR, String(nextAuto))
    target.textContent = nextAuto ? '⏸ PAUSA' : '[PAUSA]'
    target.className = getPauseMarkerClassName(nextAuto)
    emitChange()
  }

  return (
    <div
      ref={elRef}
      contentEditable
      suppressContentEditableWarning
      onInput={emitChange}
      onClick={handleClick}
      data-placeholder="Escribe tu guion aquí..."
      className="tp-editor-canvas min-h-[400px] max-w-3xl rounded-lg border border-white/10 bg-[#0f1117] p-6 text-base leading-relaxed text-gray-100 empty:before:text-gray-600 empty:before:content-[attr(data-placeholder)] focus:border-blue-500/50 focus:outline-none [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3"
    />
  )
})
