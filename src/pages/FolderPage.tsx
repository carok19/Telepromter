// Biblioteca — Nivel 2 del rediseño: contenido de UNA carpeta (o del
// cajón fijo "Sin carpeta", :folderId === 'sin-carpeta'). Renombrar/
// eliminar carpeta se movieron ACÁ desde LibraryPage (Nivel 1 ya no tiene
// un menú por tarjeta de carpeta — ver el mockup aprobado) con la MISMA
// lógica de dos pasos que ya existía (mover los guiones a "Sin carpeta" o
// borrarlos junto con la carpeta, con una confirmación aparte para lo
// destructivo).
//
// Parte 1 del rediseño: esta pantalla ya es funcional (búsqueda dentro de
// la carpeta, menú ⋯ de la carpeta, eliminar guion) pero todavía reutiliza
// ScriptCard tal cual estaba (tocar la tarjeta abre el editor, con su
// botón "▶ Teleprompter" aparte) — el rediseño de la tarjeta en sí y el
// cambio de "tocar abre el teleprompter" son la Parte 2.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ScriptCard } from '../components/library/ScriptCard'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { PromptDialog } from '../components/shared/PromptDialog'
import { useDropdownMenu } from '../hooks/useDropdownMenu'
import { useScriptsStore } from '../stores/scriptsStore'

type DialogState =
  | { type: 'none' }
  | { type: 'renameFolder' }
  | { type: 'deleteScript'; scriptId: number }
  | { type: 'deleteFolderChoice'; count: number }
  | { type: 'deleteFolderConfirm'; count: number }

export function FolderPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const scripts = useScriptsStore((s) => s.scripts)
  const folders = useScriptsStore((s) => s.folders)
  const loading = useScriptsStore((s) => s.loading)
  const loadScripts = useScriptsStore((s) => s.loadScripts)
  const removeScript = useScriptsStore((s) => s.removeScript)
  const duplicateScript = useScriptsStore((s) => s.duplicateScript)
  const moveScriptToFolder = useScriptsStore((s) => s.moveScriptToFolder)
  const renameFolder = useScriptsStore((s) => s.renameFolder)
  const deleteFolder = useScriptsStore((s) => s.deleteFolder)

  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })
  const { open: menuOpen, setOpen: setMenuOpen, position, anchorRef, menuRef } = useDropdownMenu<HTMLDivElement>('right')

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  const isSinCarpeta = folderId === 'sin-carpeta'
  const numericFolderId = isSinCarpeta ? null : Number(folderId)
  const folder = isSinCarpeta ? null : folders.find((f) => f.id === numericFolderId)

  const folderScripts = useMemo(
    () => scripts.filter((s) => (isSinCarpeta ? s.folderId == null : s.folderId === numericFolderId)),
    [scripts, isSinCarpeta, numericFolderId],
  )

  const term = search.trim().toLowerCase()
  const visibleScripts = useMemo(() => {
    const filtered = term ? folderScripts.filter((s) => s.title.toLowerCase().includes(term)) : folderScripts
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [folderScripts, term])

  function closeDialog() {
    setDialog({ type: 'none' })
  }

  async function finishDeleteFolder(mode: 'move' | 'delete') {
    if (!folder) return
    await deleteFolder(folder.id!, mode)
    // La carpeta que se estaba viendo ya no existe — no hay nada más que
    // mostrar acá, se vuelve a la cuadrícula.
    navigate('/guiones')
  }

  // Carpeta inexistente (id inválido, o se borró desde otra pestaña) y no
  // es el cajón fijo: nada que mostrar. Mientras `loading` sigue en true
  // no se puede distinguir todavía "no existe" de "aún no cargó", así que
  // se espera a que termine de cargar antes de decidir esto.
  if (!loading && !isSinCarpeta && !folder) {
    return (
      <div className="p-8 text-sm text-gray-500">
        Esta carpeta ya no existe.{' '}
        <button type="button" onClick={() => navigate('/guiones')} className="text-blue-400 hover:underline">
          Volver a la biblioteca
        </button>
      </div>
    )
  }

  const title = isSinCarpeta ? 'Sin carpeta' : (folder?.name ?? '')

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 bg-[#0b0c10] px-4 py-4 text-gray-100">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => navigate('/guiones')} className="text-sm font-medium text-blue-400 hover:underline">
          ‹ Biblioteca
        </button>
        {!isSinCarpeta && folder && (
          <div ref={anchorRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`Más acciones para la carpeta ${folder.name}`}
              className="rounded-md p-1.5 text-xl leading-none text-gray-400 hover:bg-white/5 hover:text-gray-200"
            >
              ⋯
            </button>
            {menuOpen &&
              createPortal(
                <div
                  ref={menuRef}
                  style={{ position: 'fixed', top: position.top ?? undefined, bottom: position.bottom ?? undefined, left: position.left }}
                  className="z-50 w-40 rounded-md border border-white/10 bg-[#15171e] py-1 shadow-lg"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setDialog({ type: 'renameFolder' })
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setDialog({ type: 'deleteFolderChoice', count: folderScripts.length })
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
                  >
                    Eliminar
                  </button>
                </div>,
                document.body,
              )}
          </div>
        )}
      </header>

      <h1 className="text-2xl font-semibold text-gray-100">{title}</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Buscar en ${title}...`}
        className="w-full rounded-lg border border-white/10 bg-[#12151c] px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
      />

      {loading && <p className="text-sm text-gray-500">Cargando...</p>}

      {!loading && visibleScripts.length === 0 && (
        <p className="text-sm text-gray-500">
          {term ? 'No se encontraron guiones con ese título.' : 'Esta carpeta todavía no tiene guiones.'}
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
            onDelete={() => setDialog({ type: 'deleteScript', scriptId: script.id! })}
            onMoveToFolder={(newFolderId) => moveScriptToFolder(script.id!, newFolderId)}
          />
        ))}
      </div>

      {dialog.type === 'renameFolder' && folder && (
        <PromptDialog
          title="Renombrar carpeta"
          label="Nombre de la carpeta"
          initialValue={folder.name}
          confirmLabel="Guardar"
          onConfirm={(name) => {
            if (name !== folder.name) renameFolder(folder.id!, name)
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

      {dialog.type === 'deleteFolderChoice' && folder &&
        (dialog.count === 0 ? (
          <ConfirmDialog
            title={`Eliminar "${folder.name}"`}
            message="Esta carpeta no tiene guiones dentro."
            actions={[
              { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
              { label: 'Eliminar carpeta', variant: 'danger', onClick: () => finishDeleteFolder('move') },
            ]}
            onClose={closeDialog}
          />
        ) : (
          <ConfirmDialog
            title={`Eliminar "${folder.name}"`}
            message={`Tiene ${dialog.count} ${dialog.count === 1 ? 'guion' : 'guiones'}. Elegí qué hacer con ${
              dialog.count === 1 ? 'él' : 'ellos'
            }.`}
            actions={[
              { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
              {
                label: 'Mover a "Sin carpeta" y eliminar la carpeta',
                variant: 'primary',
                onClick: () => finishDeleteFolder('move'),
              },
              {
                label: `Eliminar la carpeta y sus ${dialog.count} guiones`,
                variant: 'danger',
                onClick: () => setDialog({ type: 'deleteFolderConfirm', count: dialog.count }),
              },
            ]}
            onClose={closeDialog}
          />
        ))}

      {dialog.type === 'deleteFolderConfirm' && folder && (
        <ConfirmDialog
          title="¿Eliminar definitivamente?"
          message={`Se borrarán la carpeta "${folder.name}" y sus ${dialog.count} ${
            dialog.count === 1 ? 'guion' : 'guiones'
          }. Esta acción NO se puede deshacer.`}
          actions={[
            { label: 'Cancelar', variant: 'neutral', onClick: closeDialog },
            { label: 'Eliminar para siempre', variant: 'danger', onClick: () => finishDeleteFolder('delete') },
          ]}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}
