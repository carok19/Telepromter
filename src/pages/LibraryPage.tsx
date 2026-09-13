// Biblioteca — Nivel 1 del rediseño: cuadrícula de carpetas (nunca la
// lista de guiones directamente, eso es FolderPage.tsx = Nivel 2). El
// buscador acá busca DOS cosas a la vez: nombres de carpeta (filtra la
// cuadrícula de arriba) y títulos de guion en TODA la biblioteca sin
// importar la carpeta (los muestra aparte, debajo, cada uno con su
// carpeta indicada) — si no, no habría forma de buscar en toda la app
// desde acá, ya que esta pantalla ya no lista guiones sueltos.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { FolderCard } from '../components/library/FolderCard'
import { EmptyState } from '../components/shared/EmptyState'
import { FabMenu } from '../components/shared/FabMenu'
import { PromptDialog } from '../components/shared/PromptDialog'
import { FileTextIcon, SearchIcon, SettingsIcon } from '../components/shared/Icons'
import { formatRelativeDate } from '../engine/relativeDate'
import { useScriptsStore } from '../stores/scriptsStore'
import {
  SURFACE_BORDER,
  FONT_DISPLAY,
  GRID_GAP,
  PAGE,
  RADIUS_CARD,
  SEARCH_INPUT,
  SEGMENTED_OPTION_ACTIVE,
  SEGMENTED_OPTION_INACTIVE,
  SEGMENTED_TRACK,
  SURFACE,
  SURFACE_HOVER,
  TEXT_FAINT,
  TEXT_MUTED,
  SCREEN_TITLE,
} from '../styles/tokens'

type SortOption = 'recientes' | 'antiguos' | 'titulo'

const SORT_OPTIONS: Array<[SortOption, string]> = [
  ['recientes', 'Recientes'],
  ['antiguos', 'Más antiguos'],
  ['titulo', 'A-Z'],
]

// folderId `null` = el cajón fijo "Sin carpeta" (no una fila real de la
// tabla `folders`) — mismo criterio que ya usaba FolderTabs.
interface FolderSummary {
  folderId: number | null
  name: string
  scriptCount: number
  draftCount: number
  updatedAt: number | null
}

export function LibraryPage() {
  const navigate = useNavigate()
  const scripts = useScriptsStore((s) => s.scripts)
  const folders = useScriptsStore((s) => s.folders)
  const pendingDrafts = useScriptsStore((s) => s.pendingDrafts)
  const loading = useScriptsStore((s) => s.loading)
  const loadScripts = useScriptsStore((s) => s.loadScripts)
  const createScript = useScriptsStore((s) => s.createScript)
  const createFolder = useScriptsStore((s) => s.createFolder)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recientes')
  const [showCreateFolder, setShowCreateFolder] = useState(false)

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  // Un resumen por carpeta (conteos + última actividad) que alcanza tanto
  // para las carpetas reales como para el cajón fijo "Sin carpeta" — este
  // último se arma igual que los demás pero sin una fila en `folders`, y
  // se omite por completo si no tiene ni guiones ni borradores (pedido
  // explícito: no ocupar espacio con un cajón vacío).
  const folderSummaries = useMemo<FolderSummary[]>(() => {
    const real = folders.map((folder): FolderSummary => {
      const folderScripts = scripts.filter((s) => s.folderId === folder.id)
      const folderDrafts = pendingDrafts.filter((d) => d.script.folderId === folder.id)
      const lastActivity = Math.max(
        folder.updatedAt,
        ...folderScripts.map((s) => s.updatedAt),
        ...folderDrafts.map((d) => d.draft.updatedAt),
      )
      return {
        folderId: folder.id!,
        name: folder.name,
        scriptCount: folderScripts.length,
        draftCount: folderDrafts.length,
        updatedAt: lastActivity,
      }
    })

    const sinCarpetaScripts = scripts.filter((s) => s.folderId == null)
    const sinCarpetaDrafts = pendingDrafts.filter((d) => d.script.folderId == null)
    if (sinCarpetaScripts.length === 0 && sinCarpetaDrafts.length === 0) return real

    const sinCarpeta: FolderSummary = {
      folderId: null,
      name: 'Sin carpeta',
      scriptCount: sinCarpetaScripts.length,
      draftCount: sinCarpetaDrafts.length,
      updatedAt: Math.max(0, ...sinCarpetaScripts.map((s) => s.updatedAt), ...sinCarpetaDrafts.map((d) => d.draft.updatedAt)),
    }
    return [sinCarpeta, ...real]
  }, [folders, scripts, pendingDrafts])

  const term = search.trim().toLowerCase()

  const visibleFolders = useMemo(() => {
    const filtered = term ? folderSummaries.filter((f) => f.name.toLowerCase().includes(term)) : folderSummaries
    const sorted = [...filtered]
    if (sort === 'titulo') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'antiguos') sorted.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
    else sorted.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return sorted
  }, [folderSummaries, term, sort])

  // Guiones encontrados en CUALQUIER carpeta (nunca borradores: `scripts`
  // ya viene filtrado a solo guardados) — solo se calcula/muestra mientras
  // hay término de búsqueda.
  const matchingScripts = useMemo(() => {
    if (!term) return []
    const folderNameById = new Map(folders.map((f) => [f.id!, f.name]))
    return scripts
      .filter((s) => s.title.toLowerCase().includes(term))
      .map((s) => ({
        id: s.id!,
        title: s.title || 'Sin título',
        folderName: s.folderId != null ? (folderNameById.get(s.folderId) ?? 'Sin carpeta') : 'Sin carpeta',
      }))
  }, [scripts, folders, term])

  async function handleCreateScript() {
    const id = await createScript()
    navigate(`/editor/${id}`)
  }

  return (
    <div className={PAGE}>
      <header className="mb-5 flex items-center justify-between">
        <span className="h-9 w-9" aria-hidden="true" />
        <img src={logo} alt="Robress Teleprompter" width={36} height={36} className="rounded-lg" />
        <button
          type="button"
          onClick={() => navigate('/configuracion')}
          aria-label="Configuración"
          className={`flex h-9 w-9 items-center justify-center rounded-full ${SURFACE} ${TEXT_MUTED} ${SURFACE_HOVER}`}
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </header>

      <h1 className={SCREEN_TITLE}>Guiones &amp; Carpetas</h1>

      <div className="relative mt-4">
        <SearchIcon className={`pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 ${TEXT_FAINT}`} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar guiones y carpetas..."
          className={SEARCH_INPUT}
        />
      </div>

      <div className={`mt-3 mb-5 ${SEGMENTED_TRACK}`}>
        {SORT_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSort(value)}
            className={sort === value ? SEGMENTED_OPTION_ACTIVE : SEGMENTED_OPTION_INACTIVE}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className={`text-sm ${TEXT_MUTED}`}>Cargando...</p>}

      {!loading && visibleFolders.length === 0 && matchingScripts.length === 0 && term && (
        <p className={`text-sm ${TEXT_MUTED}`}>No se encontraron carpetas ni guiones con ese término.</p>
      )}

      {!loading && visibleFolders.length === 0 && matchingScripts.length === 0 && !term && (
        <EmptyState
          title="Todavía no hay nada acá"
          description="Creá tu primer guion o una carpeta para empezar a organizar tu biblioteca."
          actionLabel="Crear guion"
          onAction={handleCreateScript}
        />
      )}

      {visibleFolders.length > 0 && (
        <div className={`grid grid-cols-2 ${GRID_GAP}`}>
          {visibleFolders.map((folder) => (
            <FolderCard
              key={folder.folderId ?? 'sin-carpeta'}
              name={folder.name}
              scriptCount={folder.scriptCount}
              draftCount={folder.draftCount}
              updatedLabel={folder.updatedAt ? formatRelativeDate(folder.updatedAt) : null}
              onOpen={() => navigate(`/guiones/${folder.folderId ?? 'sin-carpeta'}`)}
            />
          ))}
        </div>
      )}

      {term && (
        <div className="mt-5">
          <p className={`mb-2.5 text-xs font-semibold tracking-wide uppercase ${TEXT_FAINT}`}>
            {matchingScripts.length > 0 ? 'Guiones encontrados' : 'Sin guiones encontrados'}
          </p>
          <div className="flex flex-col gap-2">
            {matchingScripts.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => navigate(`/teleprompter/${result.id}`)}
                className={`flex items-center gap-3 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} px-4 py-3 text-left transition-colors ${SURFACE_HOVER}`}
              >
                <FileTextIcon className={`h-4 w-4 shrink-0 ${TEXT_MUTED}`} />
                <span className={`min-w-0 flex-1 truncate text-sm text-white ${FONT_DISPLAY}`}>{result.title}</span>
                <span className={`shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] ${TEXT_MUTED}`}>
                  {result.folderName}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <FabMenu onNewScript={handleCreateScript} onNewFolder={() => setShowCreateFolder(true)} />

      {showCreateFolder && (
        <PromptDialog
          title="Nueva carpeta"
          label="Nombre de la carpeta"
          placeholder="Ej. Marca A"
          confirmLabel="Crear"
          onConfirm={(name) => {
            // Nombres duplicados: se permiten a propósito, sin avisar —
            // mismo criterio que ya rige el título de los guiones.
            createFolder(name)
            setShowCreateFolder(false)
          }}
          onClose={() => setShowCreateFolder(false)}
        />
      )}
    </div>
  )
}
