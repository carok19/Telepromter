import { useCallback, useEffect, useState, type MouseEvent, type RefObject } from 'react'
import type { EditorCanvasHandle } from './EditorCanvas'
import { ACCENT_SOFT_BG, ACCENT_TEXT } from '../../styles/tokens'

interface EditorToolbarProps {
  canvasRef: RefObject<EditorCanvasHandle | null>
}

type Align = 'left' | 'center' | 'right'

interface ActiveState {
  bold: boolean
  italic: boolean
  heading: boolean
  align: Align
}

// Evita que el mousedown sobre un botón robe el foco/selección del lienzo
// (necesario para que execCommand se aplique sobre el texto seleccionado).
function preventFocusSteal(e: MouseEvent) {
  e.preventDefault()
}

export function EditorToolbar({ canvasRef }: EditorToolbarProps) {
  const [active, setActive] = useState<ActiveState>({
    bold: false,
    italic: false,
    heading: false,
    align: 'left',
  })

  const refresh = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setActive({
      bold: canvas.queryState('bold'),
      italic: canvas.queryState('italic'),
      heading: canvas.queryBlockType() === 'h2',
      align: canvas.queryState('justifyCenter') ? 'center' : canvas.queryState('justifyRight') ? 'right' : 'left',
    })
  }, [canvasRef])

  useEffect(() => {
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [refresh])

  function run(command: string, value?: string) {
    canvasRef.current?.exec(command, value)
    refresh()
  }

  function toggleHeading() {
    const canvas = canvasRef.current
    if (!canvas) return
    const isHeading = canvas.queryBlockType() === 'h2'
    run('formatBlock', isHeading ? '<p>' : '<h2>')
  }

  const buttonClass = (isActive: boolean) =>
    `flex h-11 items-center justify-center rounded-[14px] px-3.5 text-[15px] font-semibold transition-colors ${
      isActive ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}` : 'bg-white/[0.07] text-gray-200 hover:bg-white/[0.12]'
    }`

  // Handoff: la barra pasa de arriba (bajo el header) a ABAJO, pegada al
  // teclado — igual que en el mockup, donde vive justo encima del home
  // indicator. Ancho angosto (360px): 8 botones + 2 separadores nunca
  // entran parejos en una sola fila, y flex-wrap los partía en dos filas
  // DESPAREJAS (la cantidad que entra en la primera depende del ancho
  // exacto, así que quedaba una fila larga y una cortita). En vez de eso:
  // una sola fila que se desliza horizontal (overflow-x-auto +
  // flex-nowrap), con cada botón/separador shrink-0 para que ninguno se
  // achique — mismo patrón que un toolbar de editor de texto en celular
  // (Google Docs, Notion).
  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/[0.07] bg-white/[0.03] px-4 py-3 sm:px-6">
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('bold')}
        className={`shrink-0 ${buttonClass(active.bold)}`}
        title="Negrita"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('italic')}
        className={`shrink-0 ${buttonClass(active.italic)}`}
        title="Cursiva"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={toggleHeading}
        className={`shrink-0 whitespace-nowrap ${buttonClass(active.heading)}`}
        title="Título"
      >
        H2
      </button>

      <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" />

      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('justifyLeft')}
        className={`shrink-0 whitespace-nowrap ${buttonClass(active.align === 'left')}`}
        title="Alinear a la izquierda"
      >
        Izq.
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('justifyCenter')}
        className={`shrink-0 whitespace-nowrap ${buttonClass(active.align === 'center')}`}
        title="Centrar"
      >
        Centro
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('justifyRight')}
        className={`shrink-0 whitespace-nowrap ${buttonClass(active.align === 'right')}`}
        title="Alinear a la derecha"
      >
        Der.
      </button>

      <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" />

      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => canvasRef.current?.insertPauseMarker()}
        className={`shrink-0 flex h-11 items-center justify-center whitespace-nowrap rounded-[14px] px-3.5 text-[15px] font-semibold transition-colors ${ACCENT_SOFT_BG} ${ACCENT_TEXT} hover:bg-accent/25`}
        title="Insertar marcador de pausa"
      >
        Marcar pausa
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => canvasRef.current?.insertNoteMarker()}
        className="shrink-0 flex h-11 items-center justify-center whitespace-nowrap rounded-[14px] bg-sky-500/15 px-3.5 text-[15px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/25"
        title="Insertar nota / indicación de escena"
      >
        Nota
      </button>
    </div>
  )
}
