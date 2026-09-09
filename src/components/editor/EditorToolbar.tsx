import { useCallback, useEffect, useState, type MouseEvent, type RefObject } from 'react'
import type { EditorCanvasHandle } from './EditorCanvas'

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
    `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
    }`

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-6 py-2">
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('bold')}
        className={buttonClass(active.bold)}
        title="Negrita"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('italic')}
        className={buttonClass(active.italic)}
        title="Cursiva"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={toggleHeading}
        className={buttonClass(active.heading)}
        title="Título"
      >
        Título
      </button>

      <span className="mx-1 h-5 w-px bg-white/10" />

      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('justifyLeft')}
        className={buttonClass(active.align === 'left')}
        title="Alinear a la izquierda"
      >
        Izq.
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('justifyCenter')}
        className={buttonClass(active.align === 'center')}
        title="Centrar"
      >
        Centro
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => run('justifyRight')}
        className={buttonClass(active.align === 'right')}
        title="Alinear a la derecha"
      >
        Der.
      </button>

      <span className="mx-1 h-5 w-px bg-white/10" />

      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => canvasRef.current?.insertPauseMarker()}
        className="rounded px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/10"
        title="Insertar marcador de pausa"
      >
        Pausa
      </button>
      <button
        type="button"
        onMouseDown={preventFocusSteal}
        onClick={() => canvasRef.current?.insertNoteMarker()}
        className="rounded px-3 py-1.5 text-sm font-medium text-sky-400 hover:bg-sky-500/10"
        title="Insertar nota / indicación de escena"
      >
        Nota
      </button>
    </div>
  )
}
