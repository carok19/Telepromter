import { forwardRef, useImperativeHandle, useRef, type ClipboardEvent, type MouseEvent } from 'react'
import { sanitizeContentHtml } from '../../engine/contentSanitizer'
import {
  AUTO_PAUSE_ATTR,
  PAUSE_MARKER_CLASS,
  buildNoteMarkerHtml,
  buildPauseMarkerHtml,
  escapeHtml,
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

  // F8.5: guiones reales se pegan desde Word/ChatGPT/WhatsApp, no se
  // escriben a mano — y el navegador, al pegar HTML, conserva estilos
  // inline (`font-size`, a veces `font-family`/`color`) por cada bloque
  // pegado. Sin este manejador, ese HTML rico entraba tal cual (el
  // contentEditable no tenía ningún filtro propio) y esos estilos le
  // ganaban para siempre a cualquier calibración posterior — el mismo
  // problema que ya existía con `text-align` antes de sanearlo.
  // sanitizeContentHtml (lista blanca: solo `text-align` sobrevive) es la
  // MISMA función que usa TeleprompterPage para limpiar en el render los
  // guiones pegados ANTES de este arreglo — un solo lugar con la regla.
  //
  // Si el origen no trae HTML (algunos celulares al copiar texto plano),
  // se arma un HTML equivalente separando líneas con <br> — nunca se deja
  // pasar `text/plain` tal cual porque perdería los saltos de línea.
  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const plainText = e.clipboardData.getData('text/plain')
    const raw = html || plainText.split(/\r\n|\r|\n/).map(escapeHtml).join('<br>')
    const sanitized = sanitizeContentHtml(raw)
    document.execCommand('insertHTML', false, sanitized)
    emitChange()
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest(`.${PAUSE_MARKER_CLASS}`) as HTMLElement | null
    if (!target) return
    const isAuto = target.getAttribute(AUTO_PAUSE_ATTR) === 'true'
    const nextAuto = !isAuto
    target.setAttribute(AUTO_PAUSE_ATTR, String(nextAuto))
    target.textContent = nextAuto ? '⏸ PAUSA' : '[PAUSA]'
    target.className = getPauseMarkerClassName(nextAuto)

    // Reemplazar el textContent del marcador invalida cualquier Selection que
    // el navegador hubiera anclado dentro de ese nodo de texto: el contenedor
    // sigue con foco, pero el caret queda en un estado inválido y el usuario
    // no puede seguir escribiendo. Se restaura un caret válido justo después
    // del marcador.
    elRef.current?.focus()
    const range = document.createRange()
    range.setStartAfter(target)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    emitChange()
  }

  return (
    <div
      ref={elRef}
      contentEditable
      suppressContentEditableWarning
      onInput={emitChange}
      onClick={handleClick}
      onPaste={handlePaste}
      data-placeholder="Escribe tu guion aquí..."
      className="tp-editor-canvas min-h-[400px] max-w-3xl rounded-lg border border-white/10 bg-[#0f1117] p-6 text-base leading-relaxed text-gray-100 empty:before:text-gray-600 empty:before:content-[attr(data-placeholder)] focus:border-accent/50 focus:outline-none [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3 [&_div]:mb-3"
    />
  )
})
