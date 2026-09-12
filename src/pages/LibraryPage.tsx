import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { PromptDialog } from '../components/shared/PromptDialog'
import { FolderTabs, type FolderFilter } from '../components/library/FolderTabs'
import { ScriptCard } from '../components/library/ScriptCard'
import type { FolderRecord } from '../db/db'
import { extractTextPreview } from '../engine/textPreview'
import { useScriptsStore } from '../stores/scriptsStore'

type SortOption = 'recientes' | 'antiguos' | 'titulo'

const SORT_OPTIONS: Array<[SortOption, string]> = [
  ['recientes', 'Recientes'],
  ['antiguos', 'Más antiguos'],
  ['titulo', 'A-Z'],
]

// Carpetas: recuerda la última abierta entre visitas a Mis guiones, igual
// que TeleprompterPage ya hace con el último perfil de calibración
// elegido (robress:teleprompterProfileId) — una preferencia liviana de UI,
// no datos del dominio, así que localStorage y no Dexie.
const LAST_FOLDER_STORAGE_KEY = 'robress:lastLibraryFolder'

function readStoredFolder(): FolderFilter {
  try {
    const stored = window.localStorage.getItem(LAST_FOLDER_STORAGE_KEY)
    if (stored === 'all' || stored === 'none') return stored
    if (stored) {
      const id = Number(stored)
      if (Number.isFinite(id)) return id
    }
  } catch {
    // localStorage puede no estar disponible (modo privado, permisos) —
    // se sigue con 'all' en memoria, sin romper la página por esto.
  }
  return 'all'
}

function storeFolder(filter: FolderFilter) {
  try {
    window.localStorage.setItem(LAST_FOLDER_STORAGE_KEY, String(filter))
  } catch {
    // Igual que arriba: si no se pudo guardar, simplemente no se recuerda
    // la próxima vez — no es motivo para romper nada.
  }
}

// Reemplaza window.prompt/confirm (ver ConfirmDialog/PromptDialog): un
// único estado describe cuál diálogo está abierto, si alguno. El borrado
// de carpetas necesita DOS pasos ('deleteFolderChoice' -> opcionalmente
// 'deleteFolderConfirm') porque la opción destructiva debe pedir una
// confirmación aparte, más seria que la de simplemente mover los guiones.
type DialogState =
  | { type: 'none' }
  | { type: 'createFolder' }
  | { type: 'renameFolder'; folder: FolderRecord }
  | { type: 'deleteScript'; scriptId: number }
  | { type: 'deleteFolderChoice'; folder: FolderRecord; count: number }
  | { type: 'deleteFolderConfirm'; folder: FolderRecord; count: number }

export function LibraryPage() {
  const navigate = useNavigate()
  const scripts = useScriptsStore((s) => s.scripts)
  const folders = useScriptsStore((s) => s.folders)
  const pendingDrafts = useScriptsStore((s) => s.pendingDrafts)
  const loading = useScriptsStore((s) => s.loading)
  const loadScripts = useScriptsStore((s) => s.loadScripts)
  const createScript = useScriptsStore((s) => s.createScript)
  const removeScript = useScriptsStore((s) => s.removeScript)
  const duplicateScript = useScriptsStore((s) => s.duplicateScript)
  const moveScriptToFolder = useScriptsStore((s) => s.moveScriptToFolder)
  const createFolder = useScriptsStore((s) => s.createFolder)
  const renameFolder = useScriptsStore((s) => s.renameFolder)
  const deleteFolder = useScriptsStore((s) => s.deleteFolder)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recientes')
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>(() => readStoredFolder())
  // Mientras se busca, permite ignorar la carpeta seleccionada y buscar en
  // TODOS los guiones — sin esto, buscar algo que está en otra carpeta
  // parecería "no existe". Se resetea cada vez que se borra el término de
  // búsqueda, para no dejarlo prendido por accidente la próxima vez que se
  // busca algo nuevo dentro de una carpeta.
  const [searchAllFolders, setSearchAllFolders] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  // Si la carpeta recordada ya no existe (se borró en otra pestaña, o el
  // valor guardado quedó de una versión vieja), se trata como "Todos" —
  // derivado en el render en vez de "corregir" selectedFolder con un
  // setState en un efecto (evita un ciclo de render extra). Mientras
  // `loading` sigue en true, `folders` todavía puede estar vacío sin que
  // eso signifique que la carpeta no existe — no se descarta todavía.
  const selectedFolderExists =
    loading || typeof selectedFolder !== 'number' || folders.some((f) => f.id === selectedFolder)
  const effectiveFolder: FolderFilter = selectedFolderExists ? selectedFolder : 'all'

  function handleSelectFolder(filter: FolderFilter) {
    setSelectedFolder(filter)
    storeFolder(filter)
    setSearchAllFolders(false)
  }

  const countAll = scripts.length
  const countNone = useMemo(() => scripts.filter((s) => s.folderId == null).length, [scripts])
  const countByFolder = useMemo(() => {
    const map = new Map<number, number>()
    for (const s of scripts) {
      if (s.folderId == null) continue
      map.set(s.folderId, (map.get(s.folderId) ?? 0) + 1)
    }
    return map
  }, [scripts])

  const searchTerm = search.trim().toLowerCase()
  // "Todos" ya busca en todo — el toggle de "buscar en todas" solo tiene
  // sentido (y solo se muestra) cuando hay una carpeta específica elegida.
  const effectivelySearchingAllFolders = effectiveFolder === 'all' || searchAllFolders

  const visibleScripts = useMemo(() => {
    const withinFolder = effectivelySearchingAllFolders
      ? scripts
      : scripts.filter((s) => (effectiveFolder === 'none' ? s.folderId == null : s.folderId === effectiveFolder))
    const filtered = searchTerm ? withinFolder.filter((s) => s.title.toLowerCase().includes(searchTerm)) : withinFolder
    const sorted = [...filtered]
    if (sort === 'recientes') sorted.sort((a, b) => b.updatedAt - a.updatedAt)
    else if (sort === 'antiguos') sorted.sort((a, b) => a.updatedAt - b.updatedAt)
    else sorted.sort((a, b) => a.title.localeCompare(b.title))
    return sorted
  }, [scripts, searchTerm, sort, effectiveFolder, effectivelySearchingAllFolders])

  async function handleCreate() {
    // Si hay una carpeta real elegida (no "Todos"/"Sin carpeta"), el guion
    // nuevo se crea ahí directamente.
    const folderId = typeof effectiveFolder === 'number' ? effectiveFolder : undefined
    const id = await createScript(undefined, folderId)
    navigate(`/editor/${id}`)
  }

  function closeDialog() {
    setDialog({ type: 'none' })
  }

  function handleDelete(id: number) {
    setDialog({ type: 'deleteScript', scriptId: id })
  }

  function handleCreateFolder() {
    setDialog({ type: 'createFolder' })
  }

  function handleRenameFolder(folder: FolderRecord) {
    setDialog({ type: 'renameFolder', folder })
  }

  function handleDeleteFolder(folder: FolderRecord) {
    const count = countByFolder.get(folder.id!) ?? 0
    setDialog({ type: 'deleteFolderChoice', folder, count })
  }

  async function finishDeleteFolder(folder: FolderRecord, mode: 'move' | 'delete') {
    await deleteFolder(folder.id!, mode)
    if (selectedFolder === folder.id) handleSelectFolder('all')
    closeDialog()
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-100">Mis guiones</h1>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          + Nuevo guion
        </button>
      </div>

      {/* Guardado explícito: un guion (nuevo o ya guardado) con una edición
          pendiente que nunca pasó por "Guardar" ni "Descartar" — p. ej. se
          cerró la pestaña de golpe. Sin esto quedaría invisible para
          siempre (no aparece en la lista de abajo, que solo muestra
          guiones guardados), que para el usuario es lo mismo que perdido. */}
      {pendingDrafts.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-300">
            {pendingDrafts.length === 1
              ? 'Tenés 1 borrador sin guardar:'
              : `Tenés ${pendingDrafts.length} borradores sin guardar:`}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {pendingDrafts.map(({ script: draftScript, draft }) => {
              // Título vacío: con varios borradores sin título, "Sin
              // título" repetido no ayudaría a distinguir cuál es cuál —
              // se usa un fragmento del contenido en su lugar, igual que
              // ScriptCard ya hace para sus tarjetas.
              const label = draft.title || draftScript.title || extractTextPreview(draft.content, 60) || 'Sin título'
              return (
                <button
                  key={draftScript.id}
                  type="button"
                  onClick={() => navigate(`/editor/${draftScript.id}`)}
                  className="truncate text-left text-sm text-amber-200 hover:underline"
                >
                  {label}
                  <span className="ml-2 text-xs text-amber-400/70">
                    {new Date(draft.updatedAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <FolderTabs
        folders={folders}
        countAll={countAll}
        countNone={countNone}
        countByFolder={countByFolder}
        selected={effectiveFolder}
        onSelect={handleSelectFolder}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar guiones..."
          className="w-64 rounded-md border border-white/10 bg-[#0f1117] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
        />
        {effectiveFolder !== 'all' && search && (
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={searchAllFolders}
              onChange={(e) => setSearchAllFolders(e.target.checked)}
              className="accent-blue-500"
            />
            Buscar en todas las carpetas
          </label>
        )}
        <div className="flex gap-1 rounded-md border border-white/10 bg-[#0f1117] p-1">
          {SORT_OPTIONS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setSort(value)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                sort === value ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando...</p>}

      {!loading && visibleScripts.length === 0 && (
        <p className="text-sm text-gray-500">
          {search ? 'No se encontraron guiones con ese título.' : 'Todavía no tienes guiones. Crea el primero.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visibleScripts.map((script) => (
          <ScriptCard
            key={script.id}
            script={script}
            folders={folders}
            onOpen={() => navigate(`/editor/${script.id}`)}
            onOpenTeleprompter={() => navigate(`/teleprompter/${script.id}`)}
            onDuplicate={() => duplicateScript(script.id!)}
            onDelete={() => handleDelete(script.id!)}
            onMoveToFolder={(folderId) => moveScriptToFolder(script.id!, folderId)}
          />
        ))}
      </div>

      {dialog.type === 'createFolder' && (
        <PromptDialog
          title="Nueva carpeta"
          label="Nombre de la carpeta"
          placeholder="Ej. Marca A"
          confirmLabel="Crear"
          onConfirm={(name) => {
            // Nombres duplicados: se permiten a propósito, sin avisar —
            // mismo criterio que ya rige el título de los guiones (tampoco
            // es único), y dos cuentas de TikTok pueden compartir
            // legítimamente un nombre de fantasía.
            createFolder(name)
            closeDialog()
          }}
          onClose={closeDialog}
        />
      )}

      {dialog.type === 'renameFolder' && (
        <PromptDialog
          title="Renombrar carpeta"
          label="Nombre de la carpeta"
          initialValue={dialog.folder.name}
          confirmLabel="Guardar"
          onConfirm={(name) => {
            if (name !== dialog.folder.name) renameFolder(dialog.folder.id!, name)
            closeDialog()
          }}
          onClose={closeDialog}
        />
      )}

      {dialog.type === 'deleteScript' && (
        <ConfirmDialog
          title="Eliminar guion"
          message="Esta acción no se puede deshacer."
          actions={[
            { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
            {
              label: 'Eliminar',
              variant: 'danger',
              onClick: async () => {
                await removeScript(dialog.scriptId)
                closeDialog()
              },
            },
          ]}
          onClose={closeDialog}
        />
      )}

      {dialog.type === 'deleteFolderChoice' &&
        (dialog.count === 0 ? (
          <ConfirmDialog
            title={`Eliminar "${dialog.folder.name}"`}
            message="Esta carpeta no tiene guiones dentro."
            actions={[
              { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
              {
                label: 'Eliminar carpeta',
                variant: 'danger',
                onClick: () => finishDeleteFolder(dialog.folder, 'move'),
              },
            ]}
            onClose={closeDialog}
          />
        ) : (
          <ConfirmDialog
            title={`Eliminar "${dialog.folder.name}"`}
            message={`Tiene ${dialog.count} ${dialog.count === 1 ? 'guion' : 'guiones'}. Elegí qué hacer con ${
              dialog.count === 1 ? 'él' : 'ellos'
            }.`}
            actions={[
              { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
              {
                label: 'Mover a "Sin carpeta" y eliminar la carpeta',
                variant: 'primary',
                onClick: () => finishDeleteFolder(dialog.folder, 'move'),
              },
              {
                label: `Eliminar la carpeta y sus ${dialog.count} guiones`,
                variant: 'danger',
                onClick: () => setDialog({ type: 'deleteFolderConfirm', folder: dialog.folder, count: dialog.count }),
              },
            ]}
            onClose={closeDialog}
          />
        ))}

      {dialog.type === 'deleteFolderConfirm' && (
        <ConfirmDialog
          title="¿Eliminar definitivamente?"
          message={`Se borrarán la carpeta "${dialog.folder.name}" y sus ${dialog.count} ${
            dialog.count === 1 ? 'guion' : 'guiones'
          }. Esta acción NO se puede deshacer.`}
          actions={[
            { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
            {
              label: 'Eliminar para siempre',
              variant: 'danger',
              onClick: () => finishDeleteFolder(dialog.folder, 'delete'),
            },
          ]}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}
