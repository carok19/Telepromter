import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type ScriptRecord } from '../db/db'
import { countWords, DEFAULT_WPM } from '../engine/duration'
import { TeleprompterEngine } from '../engine/teleprompterEngine'
import { usePlayerStore } from '../stores/playerStore'

export function TeleprompterPage() {
  const { id } = useParams()

  if (!id) {
    return (
      <div className="p-8 text-sm text-gray-500">Selecciona un guion desde la biblioteca para reproducirlo.</div>
    )
  }

  // key={id} fuerza un montaje nuevo (refs, motor y store limpios) cada vez
  // que se abre un guion distinto, en vez de reutilizar la instancia previa.
  return <TeleprompterSession key={id} id={id} />
}

function TeleprompterSession({ id }: { id: string }) {
  const navigate = useNavigate()
  const [script, setScript] = useState<ScriptRecord | null | undefined>(undefined)

  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [engine] = useState(() => new TeleprompterEngine())

  const status = usePlayerStore((s) => s.status)
  const progress = usePlayerStore((s) => s.progress)
  const wpm = usePlayerStore((s) => s.wpm)
  const pausedByMarker = usePlayerStore((s) => s.pausedByMarker)
  const attachEngine = usePlayerStore((s) => s.attachEngine)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const resetPlayback = usePlayerStore((s) => s.reset)
  const setSpeed = usePlayerStore((s) => s.setSpeed)

  // Cargar el guion.
  useEffect(() => {
    let cancelled = false
    db.scripts.get(Number(id)).then((record) => {
      if (!cancelled) setScript(record ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Conectar el motor al store en cuanto existe esta sesión.
  useEffect(() => {
    const detachStore = attachEngine(engine)
    return () => {
      detachStore()
      engine.detach()
    }
  }, [attachEngine, engine])

  // Una vez que el guion cargó y el DOM del lienzo existe, medirlo y
  // preparar el motor (alto desplazable, velocidad, marcadores).
  useEffect(() => {
    if (!script || !viewportRef.current || !contentRef.current) return
    const wordCount = countWords(script.content)
    engine.attach(viewportRef.current, contentRef.current, wordCount)
  }, [script, engine])

  // Recalcular geometría ante un cambio de tamaño de la ventana (p. ej. al
  // rotar el celular): el reflujo del texto puede mover dónde cae cada
  // marcador verticalmente.
  useEffect(() => {
    function handleResize() {
      engine.recalculateGeometry()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [engine])

  if (script === undefined) {
    return <div className="p-8 text-sm text-gray-500">Cargando guion...</div>
  }

  if (script === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-gray-500">No se encontró este guion.</p>
        <button
          type="button"
          onClick={() => navigate('/guiones')}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Volver a Mis guiones
        </button>
      </div>
    )
  }

  const playLabel = status === 'playing' ? 'Pausa' : status === 'finished' ? 'Reproducir de nuevo' : 'Play'
  const statusLabel =
    status === 'finished'
      ? 'Finalizado'
      : status === 'paused'
        ? 'Pausado'
        : status === 'playing'
          ? 'Reproduciendo'
          : 'Listo'

  return (
    // h-screen (no h-full): el contenedor de Layout solo define min-h-screen,
    // así que su altura real es "auto" según el contenido. Si esta página
    // usara h-full (100% del padre), un guion muy largo haría crecer TODA
    // la página (sidebar incluido) para acomodarlo, y el viewport interno
    // nunca quedaría acotado para medir correctamente cuánto hay que
    // desplazar. h-screen fija esta página al alto real del viewport del
    // navegador, sin depender de cómo termine midiéndose el resto del layout.
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <button
          type="button"
          onClick={() => navigate('/guiones')}
          className="text-sm text-gray-400 hover:text-gray-100"
        >
          ← Volver
        </button>
        <h1 className="flex-1 truncate text-lg font-medium text-gray-100">{script.title || 'Sin título'}</h1>
        <span className="text-xs text-gray-500">{Math.round(progress * 100)}%</span>
      </header>

      {pausedByMarker && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-center text-sm text-amber-300">
          ⏸ Pausado automáticamente en un marcador de pausa. Presiona Play para continuar.
        </div>
      )}

      {/* min-h-0 es necesario: un hijo flex dentro de flex-col no se
          encoge por debajo de la altura de su contenido por defecto
          (min-height: auto), así que sin esto "flex-1 overflow-hidden" no
          recorta nada y el viewport crece para igualar el alto total del
          guion — totalPx quedaría en 0 y el motor nunca se movería. */}
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0c10]">
        <div
          ref={contentRef}
          className="mx-auto max-w-3xl px-6 py-16 text-3xl leading-relaxed text-gray-100 will-change-transform [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-4xl [&_h2]:font-semibold [&_p]:mb-4 [&_div]:mb-4"
          // El contenido se renderiza una sola vez (no cambia mientras se
          // reproduce): el motor mueve este elemento con transform, nunca a
          // través de un re-render de React.
          dangerouslySetInnerHTML={{ __html: script.content }}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {playLabel}
          </button>
          <button
            type="button"
            onClick={resetPlayback}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
          >
            Reiniciar
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-500">
          Velocidad (PPM)
          <input
            type="number"
            min={40}
            max={300}
            value={wpm}
            onChange={(e) => setSpeed(Number(e.target.value) || DEFAULT_WPM)}
            className="w-16 rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
          />
        </label>

        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        <span className="text-xs text-gray-500">{statusLabel}</span>
      </footer>
    </div>
  )
}
