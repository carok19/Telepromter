import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { EditorCanvas, type EditorCanvasHandle } from '../components/editor/EditorCanvas'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { FolderPickerDialog } from '../components/shared/FolderPickerDialog'
import { db, type ScriptRecord } from '../db/db'
import { DEFAULT_WPM, countWords, estimateDurationSeconds, formatDuration } from '../engine/duration'
import { useScriptsStore } from '../stores/scriptsStore'
import { BTN_PRIMARY, FONT_DISPLAY } from '../styles/tokens'

const AUTOSAVE_DELAY_MS = 500

// Guardado explícito (tipo Word): title/content SOLO llegan a la tabla
// `scripts` cuando el usuario aprieta "Guardar" (acá o en el aviso de
// salir) — mientras se edita, el autoguardado sigue escribiendo cada
// AUTOSAVE_DELAY_MS, pero en la tabla `drafts` (ver commitSave/saveDraft
// en scriptsStore.ts), nunca en el guion real. Esto permite "Descartar
// cambios" de verdad (volver exactamente a lo último guardado, sin haber
// tocado esa versión en ningún momento) sin perder la protección contra
// cerrar la app/quedarse sin batería a mitad de una edición: lo último
// tipeado sigue vivo en `drafts` pase lo que pase.
export function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const createScript = useScriptsStore((s) => s.createScript)
  const saveDraft = useScriptsStore((s) => s.saveDraft)
  const commitSave = useScriptsStore((s) => s.commitSave)
  const discardDraft = useScriptsStore((s) => s.discardDraft)
  const setSaveStatus = useScriptsStore((s) => s.setSaveStatus)
  const folders = useScriptsStore((s) => s.folders)
  const loadScripts = useScriptsStore((s) => s.loadScripts)

  const [script, setScript] = useState<ScriptRecord | null>(null)
  const [title, setTitle] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [wpm, setWpm] = useState(DEFAULT_WPM)
  // "Hay cambios sin guardar" — arranca en true si al abrir el guion ya
  // había un borrador recuperado (ver el efecto de carga más abajo), y en
  // false para un guion recién creado (todavía no se escribió nada) o uno
  // guardado tal cual estaba. Es estado de React (no solo un ref) porque
  // maneja directamente el botón Guardar, el indicador visual y
  // useBlocker — todos necesitan re-renderizar cuando cambia.
  const [isDirty, setIsDirty] = useState(false)
  // Parte 3: selector de carpeta al guardar. Se abre desde DOS lugares (el
  // botón Guardar del header y el "Guardar" del aviso de salir) — en vez
  // de dos diálogos separados, uno solo con un ref que recuerda si hay que
  // completar la navegación pendiente (blocker.proceed()) después de
  // elegir carpeta.
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const pendingProceedRef = useRef(false)

  const canvasRef = useRef<EditorCanvasHandle>(null)
  const saveTimeoutRef = useRef<number | undefined>(undefined)
  const scriptIdRef = useRef<number | null>(null)
  const hasCreatedRef = useRef(false)
  // Espejan title/content/wordCount MÁS RECIENTES en refs (no solo el
  // estado de React) para que handleSave/el autoguardado siempre lean el
  // valor actual sin depender de en qué momento se re-renderizó el
  // componente — mismo motivo que ya justificaba titleRef/wordCountRef
  // antes de esta fase.
  const titleRef = useRef('')
  const contentRef = useRef('')
  const wordCountRef = useRef(0)

  // Carpetas para el selector de la Parte 3 (FolderPickerDialog) — si se
  // entra directo a /editor/:id sin haber pasado antes por la Biblioteca,
  // el store todavía no las cargó.
  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  // Si se entra a /editor sin id, crear un guion nuevo (nace como
  // 'draft' — ver createScript en scriptsStore.ts) y redirigir a
  // /editor/:id.
  useEffect(() => {
    if (id || hasCreatedRef.current) return
    hasCreatedRef.current = true
    createScript().then((newId) => {
      navigate(`/editor/${newId}`, { replace: true })
    })
  }, [id, createScript, navigate])

  // Cargar el guion existente por id — Y su borrador pendiente, si quedó
  // alguno de una sesión anterior que se cerró sin pasar por "Guardar" ni
  // "Descartar" (cerrar la pestaña de golpe, quedarse sin batería). Si
  // hay un borrador, se carga ESE contenido en el editor (no el guardado)
  // y se marca isDirty de entrada — el usuario lo ve tal como lo dejó, con
  // el botón Guardar ya activo, listo para confirmarlo o descartarlo.
  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    let cancelled = false
    scriptIdRef.current = numericId
    Promise.all([db.scripts.get(numericId), db.drafts.get(numericId)]).then(([record, draft]) => {
      if (cancelled || !record) return
      setScript(record)
      const initialTitle = draft ? draft.title : record.title
      const initialContent = draft ? draft.content : record.content
      setTitle(initialTitle)
      titleRef.current = initialTitle
      contentRef.current = initialContent
      const words = countWords(initialContent)
      setWordCount(words)
      wordCountRef.current = words
      if (draft) {
        setIsDirty(true)
        setSaveStatus('saving')
      }
    })
    return () => {
      cancelled = true
    }
  }, [id, setSaveStatus])

  // Volcar el contenido cargado (el del borrador recuperado, si había uno
  // — ver el efecto de arriba — o si no el guardado tal cual) en el
  // lienzo DESPUÉS de que "script" pase a no-nulo y React haya montado
  // EditorCanvas (solo entonces canvasRef.current existe). Hacerlo dentro
  // del .then() de arriba era demasiado pronto: en ese instante el render
  // seguía mostrando "Cargando guion..." y el ref aún era null.
  useEffect(() => {
    if (script) canvasRef.current?.setContent(contentRef.current)
  }, [script])

  const markDirty = useCallback(() => {
    setIsDirty(true)
    setSaveStatus('saving')
  }, [setSaveStatus])

  // Autoguardado: escribe en `drafts` (nunca en el guion guardado). Un
  // único debounce para título y contenido — cada tick manda el par
  // completo leído de los refs (siempre al día), no un patch parcial: a
  // diferencia del guardado directo de antes, acá no hace falta acumular
  // cambios porque `saveDraft` reemplaza el borrador entero cada vez.
  const persist = useCallback(() => {
    if (scriptIdRef.current == null) return
    window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      saveDraft(scriptIdRef.current!, { title: titleRef.current, content: contentRef.current })
    }, AUTOSAVE_DELAY_MS)
  }, [saveDraft])

  function handleTitleChange(value: string) {
    setTitle(value)
    titleRef.current = value
    markDirty()
    persist()
  }

  function handleContentChange(html: string) {
    contentRef.current = html
    const words = countWords(html)
    setWordCount(words)
    wordCountRef.current = words
    markDirty()
    persist()
  }

  const canSave = isDirty && (title.trim() !== '' || wordCount > 0)

  // Parte 3: el selector de carpeta aparece SOLO la primera vez que se
  // guarda un guion (status:'draft' todavía — nunca pasó por Guardar) Y
  // solo si no tiene carpeta por contexto (folderId ausente: se creó desde
  // la Biblioteca Nivel 1, o desde el FAB de "Sin carpeta"). Si se creó
  // desde el FAB de una carpeta real (Nivel 2), folderId ya viene puesto
  // — se guarda ahí directo, sin preguntar. Guardados posteriores tampoco
  // preguntan nunca: para entonces status ya es 'saved'.
  const scriptNeedsFolderPicker = script?.status === 'draft' && script?.folderId == null

  // El guardado de verdad — separado de handleSave para que el mismo
  // código sirva tanto al flujo directo (sin preguntar carpeta) como al
  // que vuelve acá después de elegir una en FolderPickerDialog.
  // folderId === undefined (parámetro omitido): no toca la carpeta que el
  // guion ya tenía.
  const finalizeSave = useCallback(
    async (folderId?: number | null) => {
      if (scriptIdRef.current == null) return
      window.clearTimeout(saveTimeoutRef.current)
      await commitSave(scriptIdRef.current, titleRef.current, contentRef.current, folderId)
      setIsDirty(false)
      setSaveStatus('saved')
      setScript((prev) =>
        prev ? { ...prev, status: 'saved', ...(folderId !== undefined ? { folderId: folderId ?? undefined } : {}) } : prev,
      )
    },
    [commitSave, setSaveStatus],
  )

  const handleSave = useCallback(async () => {
    if (scriptIdRef.current == null) return
    if (titleRef.current.trim() === '' && wordCountRef.current === 0) return
    if (scriptNeedsFolderPicker) {
      pendingProceedRef.current = false
      setFolderPickerOpen(true)
      return
    }
    await finalizeSave()
  }, [scriptNeedsFolderPicker, finalizeSave])

  const handleDiscard = useCallback(async () => {
    if (scriptIdRef.current == null) return
    window.clearTimeout(saveTimeoutRef.current)
    await discardDraft(scriptIdRef.current)
    setIsDirty(false)
    setSaveStatus('saved')
  }, [discardDraft, setSaveStatus])

  // Intercepta CUALQUIER navegación dentro de la SPA (botón Volver, un
  // link del sidebar, el gesto/botón atrás del navegador — useBlocker de
  // React Router cubre los tres, porque el router maneja el historial
  // completo) mientras haya cambios sin guardar. El diálogo (ver el JSX
  // más abajo) decide entre Guardar/Descartar/Seguir editando.
  const blocker = useBlocker(isDirty)

  // Cerrar la pestaña o recargar: el navegador NO permite un diálogo
  // propio acá por razones de seguridad (evita que un sitio spamee un
  // "confirm" fingido) — se usa el mecanismo nativo `beforeunload`, que
  // muestra el aviso genérico del navegador ("¿Salir del sitio? Los
  // cambios no guardados se perderán"), no personalizable. Es la única
  // excepción real a "nada de diálogos nativos" en la app: una
  // restricción de la plataforma, no una decisión de diseño. El texto
  // real que puedan mostrar los navegadores modernos ignora
  // `returnValue`; se setea igual porque algunos navegadores viejos lo
  // usan y no hace daño.
  useEffect(() => {
    if (!isDirty) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  if (!script) {
    return <div className="p-8 text-sm text-gray-500">Cargando guion...</div>
  }

  const durationLabel = formatDuration(estimateDurationSeconds(wordCount, wpm))

  return (
    <div className="flex h-full flex-col">
      {/* Ancho angosto (360px): "← Volver" y "Guardar" van SIEMPRE en su
          propia fila con shrink-0 (nunca se achican ni se cortan) y el
          indicador de cambios sin guardar, en el medio, es lo único que
          cede espacio (min-w-0 + truncate) — así nunca empuja a Guardar
          fuera de la pantalla. El título va en una segunda fila completa,
          con su propio min-w-0 (un <input> flex, a diferencia de un <span>,
          no se achica solo — sin esto imponía un ancho mínimo propio que
          por sí solo ya desbordaba el header). */}
      <header className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/guiones')}
            className="shrink-0 text-sm text-gray-400 hover:text-gray-100"
          >
            ← Volver
          </button>
          {isDirty && (
            <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-xs text-amber-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span className="truncate">Cambios sin guardar</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`shrink-0 ${BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Guardar
          </button>
        </div>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Sin título"
          className={`w-full min-w-0 bg-transparent text-lg font-medium text-gray-100 placeholder:text-gray-600 focus:outline-none ${FONT_DISPLAY}`}
        />
      </header>

      <EditorToolbar canvasRef={canvasRef} />

      <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
        <EditorCanvas ref={canvasRef} onChange={handleContentChange} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-white/10 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          {wordCount} palabras · ~{durationLabel} min
        </span>
        <label className="flex items-center gap-2">
          <span>Velocidad de referencia (PPM)</span>
          <input
            type="number"
            min={60}
            max={220}
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value) || DEFAULT_WPM)}
            className="w-16 shrink-0 rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
          />
        </label>
      </footer>

      {/* El diálogo de salida se OCULTA (no se cierra: blocker sigue en
          'blocked') mientras el selector de carpeta está abierto — así
          "Cancelar" en el selector vuelve a mostrar este mismo diálogo en
          vez de perder la elección Guardar/Descartar/Seguir editando. */}
      {blocker.state === 'blocked' && !folderPickerOpen && (
        <ConfirmDialog
          title="Cambios sin guardar"
          message="¿Qué querés hacer con los cambios de este guion?"
          actions={[
            {
              label: 'Guardar',
              variant: 'primary',
              onClick: async () => {
                // Parte 3: acá también hace falta preguntar la carpeta si
                // es la primera vez que se guarda un guion sin carpeta —
                // se abre el selector y se completa blocker.proceed()
                // recién cuando el usuario elija (o se aborta si cancela,
                // volviendo a este mismo diálogo).
                if (scriptNeedsFolderPicker) {
                  pendingProceedRef.current = true
                  setFolderPickerOpen(true)
                  return
                }
                await finalizeSave()
                blocker.proceed()
              },
            },
            {
              label: 'Descartar cambios',
              variant: 'danger',
              onClick: async () => {
                await handleDiscard()
                blocker.proceed()
              },
            },
            { label: 'Seguir editando', variant: 'neutral', onClick: () => blocker.reset() },
          ]}
          onClose={() => blocker.reset()}
        />
      )}

      {folderPickerOpen && (
        <FolderPickerDialog
          folders={folders}
          onSelect={async (folderId) => {
            setFolderPickerOpen(false)
            await finalizeSave(folderId)
            if (pendingProceedRef.current) {
              pendingProceedRef.current = false
              if (blocker.state === 'blocked') blocker.proceed()
            }
          }}
          onClose={() => setFolderPickerOpen(false)}
        />
      )}
    </div>
  )
}
