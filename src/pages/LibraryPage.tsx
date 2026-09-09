import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScriptCard } from '../components/library/ScriptCard'
import { useScriptsStore } from '../stores/scriptsStore'

type SortOption = 'recientes' | 'antiguos' | 'titulo'

const SORT_OPTIONS: Array<[SortOption, string]> = [
  ['recientes', 'Recientes'],
  ['antiguos', 'Más antiguos'],
  ['titulo', 'A-Z'],
]

export function LibraryPage() {
  const navigate = useNavigate()
  const scripts = useScriptsStore((s) => s.scripts)
  const loading = useScriptsStore((s) => s.loading)
  const loadScripts = useScriptsStore((s) => s.loadScripts)
  const createScript = useScriptsStore((s) => s.createScript)
  const removeScript = useScriptsStore((s) => s.removeScript)
  const duplicateScript = useScriptsStore((s) => s.duplicateScript)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recientes')

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  const visibleScripts = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term ? scripts.filter((s) => s.title.toLowerCase().includes(term)) : scripts
    const sorted = [...filtered]
    if (sort === 'recientes') sorted.sort((a, b) => b.updatedAt - a.updatedAt)
    else if (sort === 'antiguos') sorted.sort((a, b) => a.updatedAt - b.updatedAt)
    else sorted.sort((a, b) => a.title.localeCompare(b.title))
    return sorted
  }, [scripts, search, sort])

  async function handleCreate() {
    const id = await createScript()
    navigate(`/editor/${id}`)
  }

  async function handleDelete(id: number) {
    if (window.confirm('¿Eliminar este guion? Esta acción no se puede deshacer.')) {
      await removeScript(id)
    }
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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar guiones..."
          className="w-64 rounded-md border border-white/10 bg-[#0f1117] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
        />
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
            onOpen={() => navigate(`/editor/${script.id}`)}
            onDuplicate={() => duplicateScript(script.id!)}
            onDelete={() => handleDelete(script.id!)}
          />
        ))}
      </div>
    </div>
  )
}
