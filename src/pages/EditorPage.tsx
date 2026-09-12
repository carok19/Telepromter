import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditorCanvas, type EditorCanvasHandle } from '../components/editor/EditorCanvas'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { db, type ScriptRecord } from '../db/db'
import { DEFAULT_WPM, countWords, estimateDurationSeconds, formatDuration } from '../engine/duration'
import { useScriptsStore } from '../stores/scriptsStore'

const AUTOSAVE_DELAY_MS = 500

export function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const createScript = useScriptsStore((s) => s.createScript)
  const updateScript = useScriptsStore((s) => s.updateScript)
  const saveStatus = useScriptsStore((s) => s.saveStatus)
  const setSaveStatus = useScriptsStore((s) => s.setSaveStatus)

  const [script, setScript] = useState<ScriptRecord | null>(null)
  const [title, setTitle] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [wpm, setWpm] = useState(DEFAULT_WPM)

  const canvasRef = useRef<EditorCanvasHandle>(null)
  const saveTimeoutRef = useRef<number | undefined>(undefined)
  const pendingPatchRef = useRef<Partial<Pick<ScriptRecord, 'title' | 'content'>>>({})
  const scriptIdRef = useRef<number | null>(null)
  const hasCreatedRef = useRef(false)

  // Si se entra a /editor sin id, crear un guion nuevo y redirigir a /editor/:id.
  useEffect(() => {
    if (id || hasCreatedRef.current) return
    hasCreatedRef.current = true
    createScript().then((newId) => {
      navigate(`/editor/${newId}`, { replace: true })
    })
  }, [id, createScript, navigate])

  // Cargar el guion existente por id.
  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    let cancelled = false
    scriptIdRef.current = numericId
    db.scripts.get(numericId).then((record) => {
      if (cancelled || !record) return
      setScript(record)
      setTitle(record.title)
      setWordCount(countWords(record.content))
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Volcar el contenido cargado en el lienzo DESPUÉS de que "script" pase a
  // no-nulo y React haya montado EditorCanvas (solo entonces canvasRef.current
  // existe). Hacerlo dentro del .then() de arriba era demasiado pronto: en
  // ese instante el render seguía mostrando "Cargando guion..." y el ref aún
  // era null, así que el contenido se perdía visualmente pese a estar bien
  // guardado en IndexedDB.
  useEffect(() => {
    if (script) canvasRef.current?.setContent(script.content)
  }, [script])

  // Los cambios de título y de contenido comparten un único debounce, así que
  // se acumulan (merge) en pendingPatchRef en vez de reemplazarse entre sí;
  // de lo contrario, escribir el título y luego seguir tipeando contenido
  // antes de que venza el debounce descartaría el título sin guardarlo.
  const persist = useCallback(
    (patch: Partial<Pick<ScriptRecord, 'title' | 'content'>>) => {
      if (scriptIdRef.current == null) return
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch }
      setSaveStatus('saving')
      window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = window.setTimeout(async () => {
        const toSave = pendingPatchRef.current
        pendingPatchRef.current = {}
        await updateScript(scriptIdRef.current!, toSave)
        setSaveStatus('saved')
      }, AUTOSAVE_DELAY_MS)
    },
    [updateScript, setSaveStatus],
  )

  // Al desmontar (p. ej. al navegar a "Volver" antes de que venza el
  // debounce), volcar inmediatamente cualquier cambio pendiente en vez de
  // descartarlo. setSaveStatus acá es seguro aunque el componente ya se
  // haya desmontado: vive en scriptsStore (Zustand), no en un useState
  // local — a diferencia de antes, esto SÍ deja a usePwaUpdate.ts (F8.6)
  // ver que todavía hay un guardado en curso durante este volcado final.
  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimeoutRef.current)
      const pending = pendingPatchRef.current
      if (scriptIdRef.current != null && Object.keys(pending).length > 0) {
        pendingPatchRef.current = {}
        setSaveStatus('saving')
        updateScript(scriptIdRef.current, pending).then(() => setSaveStatus('saved'))
      }
    }
  }, [updateScript, setSaveStatus])

  function handleTitleChange(value: string) {
    setTitle(value)
    persist({ title: value })
  }

  function handleContentChange(html: string) {
    setWordCount(countWords(html))
    persist({ content: html })
  }

  if (!script) {
    return <div className="p-8 text-sm text-gray-500">Cargando guion...</div>
  }

  const durationLabel = formatDuration(estimateDurationSeconds(wordCount, wpm))

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <button type="button" onClick={() => navigate('/guiones')} className="text-sm text-gray-400 hover:text-gray-100">
          ← Volver
        </button>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Título del guion"
          className="flex-1 bg-transparent text-lg font-medium text-gray-100 placeholder:text-gray-600 focus:outline-none"
        />
        <span className="text-xs text-gray-500">{saveStatus === 'saving' ? 'Guardando…' : 'Guardado'}</span>
      </header>

      <EditorToolbar canvasRef={canvasRef} />

      <div className="flex-1 overflow-auto px-6 py-6">
        <EditorCanvas ref={canvasRef} onChange={handleContentChange} />
      </div>

      <footer className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-xs text-gray-500">
        <span>
          {wordCount} palabras · ~{durationLabel} min
        </span>
        <label className="flex items-center gap-2">
          Velocidad de referencia (PPM)
          <input
            type="number"
            min={60}
            max={220}
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value) || DEFAULT_WPM)}
            className="w-16 rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
          />
        </label>
      </footer>
    </div>
  )
}
