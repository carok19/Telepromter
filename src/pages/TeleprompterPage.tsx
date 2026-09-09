import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  buildCalibrationStyle,
  buildGhostLayerStyle,
  getEffectiveColors,
} from '../engine/calibrationEngine'
import { db, type ScriptRecord } from '../db/db'
import { countWords, DEFAULT_WPM } from '../engine/duration'
import { TeleprompterEngine } from '../engine/teleprompterEngine'
import { usePlayerStore } from '../stores/playerStore'
import { useProfilesStore } from '../stores/profilesStore'

// Recuerda el último perfil elegido para el teleprompter entre sesiones. Es
// una preferencia liviana de UI (un id), no datos del dominio — se guarda en
// localStorage a propósito, sin tocar el esquema de Dexie para esto.
const LAST_PROFILE_STORAGE_KEY = 'robress:teleprompterProfileId'

// El Ghost es un hijo del mismo elemento que el motor transforma (así se
// mueve en sincronía con el scroll sin que el motor tenga que saber nada de
// calibración). Pero eso significa que su copia del HTML también contendría
// marcadores de pausa reales, y `findPauseCheckpoints` los contaría dos
// veces (una por copia). Se remueven los marcadores solo de esta copia de
// exhibición — no afecta al contenido real ni al conteo de palabras, que ya
// se calculan sobre `script.content` sin pasar por aquí.
function stripPauseMarkersForGhost(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('.tp-marker-pause').forEach((el) => el.remove())
  return doc.body.innerHTML
}

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

  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.loadProfiles)
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)

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

  // Cargar los perfiles de calibración guardados (mismo store/tabla que
  // Glass Test, sin duplicar nada) y restaurar el último perfil elegido si
  // todavía existe. Si no hay ninguno guardado, o el guardado ya no existe,
  // selectedProfileId se queda en null = "Predeterminado".
  useEffect(() => {
    loadProfiles().then(() => {
      const stored = window.localStorage.getItem(LAST_PROFILE_STORAGE_KEY)
      if (!stored) return
      const storedId = Number(stored)
      const exists = useProfilesStore.getState().profiles.some((p) => p.id === storedId)
      if (exists) setSelectedProfileId(storedId)
    })
  }, [loadProfiles])

  function handleSelectProfile(value: string) {
    const nextId = value ? Number(value) : null
    setSelectedProfileId(nextId)
    if (nextId != null) {
      window.localStorage.setItem(LAST_PROFILE_STORAGE_KEY, String(nextId))
    } else {
      window.localStorage.removeItem(LAST_PROFILE_STORAGE_KEY)
    }
  }

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null

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

  // Cambiar de perfil (o volver a "Predeterminado") puede cambiar fontSize/
  // lineHeight/letterSpacing/maxWidth, lo que cambia cuánto mide el
  // contenido — hay que remedir. No toca `positionPx` salvo para acotarlo
  // si el nuevo total es más corto (mismo método ya usado para el resize),
  // así que la posición visual no salta y el motor sigue play/pausado según
  // ya estaba.
  useEffect(() => {
    engine.recalculateGeometry()
  }, [engine, selectedProfile])

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

  // Sin perfil ("Predeterminado"): no se aplica ningún estilo de
  // calibración — el teleprompter se ve exactamente como antes de esta
  // integración (mismas clases de siempre en el contenido). Con perfil:
  // se reutilizan tal cual las funciones de calibrationEngine (la misma
  // lógica ya validada en Glass Test), sin reimplementar nada del cálculo
  // de mirror/color/filtro aquí.
  const stageStyle = selectedProfile ? buildCalibrationStyle(selectedProfile) : undefined
  const ghostStyle = selectedProfile ? buildGhostLayerStyle(selectedProfile) : null
  const viewportBackground = selectedProfile ? getEffectiveColors(selectedProfile).background : undefined
  const ghostHtml = ghostStyle ? stripPauseMarkersForGhost(script.content) : null

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
          guion — totalPx quedaría en 0 y el motor nunca se movería.
          El color de fondo del perfil se aplica aquí (por encima de la
          clase bg-[#0b0c10] de siempre) para que el área completa detrás
          del vidrio coincida con lo calibrado en Glass Test. */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0c10]"
        style={{ backgroundColor: viewportBackground }}
      >
        {/* Este wrapper solo existe para aplicar mirror/offset/filtro/ancho
            del perfil (buildCalibrationStyle) sin tocar el elemento que el
            motor transforma. Sin perfil, stageStyle es `undefined` y este
            div queda sin ningún estilo — cero diferencia visual con el
            comportamiento de antes de esta integración. */}
        <div style={stageStyle}>
          <div
            ref={contentRef}
            // position: relative (siempre, con o sin perfil) para que los
            // marcadores de pausa y la capa Ghost midan su posición contra
            // ESTE elemento — el mismo que mueve el motor — y no terminen
            // usando por accidente al nuevo wrapper de arriba como
            // referencia de posicionamiento (offsetParent), lo que
            // rompería el cálculo de checkpoints del motor. No cambia nada
            // visible: no se fija ningún top/left.
            className={
              selectedProfile
                ? 'py-16 will-change-transform [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-4xl [&_h2]:font-semibold [&_p]:mb-4 [&_div]:mb-4'
                : 'mx-auto max-w-3xl px-6 py-16 text-3xl leading-relaxed text-gray-100 will-change-transform [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-4xl [&_h2]:font-semibold [&_p]:mb-4 [&_div]:mb-4'
            }
            style={{ position: 'relative' }}
          >
            {/* El contenido real (el que cuenta para el alto desplazable)
                se renderiza una sola vez y nunca cambia mientras se
                reproduce: el motor mueve `contentRef` con transform,
                nunca a través de un re-render de React. */}
            <div dangerouslySetInnerHTML={{ __html: script.content }} />
            {ghostHtml && (
              <div aria-hidden="true" style={ghostStyle ?? undefined} dangerouslySetInnerHTML={{ __html: ghostHtml }} />
            )}
          </div>
        </div>
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

        <label className="flex items-center gap-2 text-xs text-gray-500">
          Perfil
          <select
            value={selectedProfileId ?? ''}
            onChange={(e) => handleSelectProfile(e.target.value)}
            className="rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
          >
            <option value="">Predeterminado</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        <span className="text-xs text-gray-500">{statusLabel}</span>
      </footer>
    </div>
  )
}
