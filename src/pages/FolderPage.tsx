// Biblioteca — Nivel 2 del rediseño: contenido de UNA carpeta (o del
// cajón fijo "Sin carpeta", :folderId === 'sin-carpeta'). Renombrar/
// eliminar carpeta se movieron ACÁ desde LibraryPage (Nivel 1 ya no tiene
// un menú por tarjeta de carpeta — ver el mockup aprobado) con la MISMA
// lógica de dos pasos que ya existía (mover los guiones a "Sin carpeta" o
// borrarlos junto con la carpeta, con una confirmación aparte para lo
// destructivo).
//
// Parte 2 del rediseño: ScriptCard ya usa la tarjeta nueva (ícono,
// metadatos, vista previa de 2 líneas, marca [BORRADOR]) — tocarla abre el
// teleprompter, editar pasó al menú ⋯.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ScriptCard } from '../components/library/ScriptCard'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { FabMenu } from '../components/shared/FabMenu'
import { PromptDialog } from '../components/shared/PromptDialog'
import { SearchIcon } from '../components/shared/Icons'
import type { DraftRecord, ScriptRecord } from '../db/db'
import { useDropdownMenu } from '../hooks/useDropdownMenu'
import { useScriptsStore } from '../stores/scriptsStore'
import {
  LIB_GRID_GAP,
  LIB_PAGE,
  LIB_RADIUS_MENU,
  LIB_SEARCH_INPUT,
  LIB_SURFACE_RAISED,
  LIB_TEXT_FAINT,
  LIB_TEXT_MUTED,
  LIB_TITLE,
} from '../styles/libraryTokens'

// Fusiona un borrador pendiente sobre su guion — se usa tanto para uno YA
// guardado con una edición sin confirmar como para uno que TODAVÍA no se
// guardó ni una vez (status:'draft'): en los dos casos, lo que hay que
// mostrar en la tarjeta es lo último tipeado (título/contenido/fecha),
// nunca lo último guardado (que para un guion nunca guardado ni siquiera
// existe — title/content llegarían vacíos).
function mergeDraft(script: ScriptRecord, draft: DraftRecord): ScriptRecord {
  return { ...script, title: draft.title, content: draft.content, updatedAt: draft.updatedAt }
}

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
  const pendingDrafts = useScriptsStore((s) => s.pendingDrafts)
  const loading = useScriptsStore((s) => s.loading)
  const loadScripts = useScriptsStore((s) => s.loadScripts)
  const createScript = useScriptsStore((s) => s.createScript)
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

  // Si un guion (ya guardado) tiene una edición pendiente sin confirmar,
  // la tarjeta debe mostrar SIEMPRE lo último tipeado, no lo último
  // guardado — igual criterio que ya usaba el aviso "Borradores sin
  // guardar" que reemplaza esta marca. `isDraft` es lo que dispara la
  // marca [BORRADOR] en ScriptCard.
  //
  // Un guion que TODAVÍA no se guardó ni una vez (status:'draft') no
  // aparece en `scripts` (el store ya lo filtra a solo guardados) — sin
  // agregarlo acá quedaría invisible para siempre en esta carpeta, que es
  // justo el gap que esta marca [BORRADOR] vino a cerrar: si no, crear un
  // guion y salir sin guardar equivale a perderlo de vista por completo.
  const displayScripts = useMemo(() => {
    const draftByScriptId = new Map(pendingDrafts.map((d) => [d.script.id!, d.draft]))
    const saved = folderScripts.map((script) => {
      const draft = draftByScriptId.get(script.id!)
      return draft ? { script: mergeDraft(script, draft), isDraft: true } : { script, isDraft: false }
    })
    const neverSaved = pendingDrafts
      .filter(
        (d) =>
          d.script.status === 'draft' &&
          (isSinCarpeta ? d.script.folderId == null : d.script.folderId === numericFolderId),
      )
      .map((d) => ({ script: mergeDraft(d.script, d.draft), isDraft: true }))
    return [...saved, ...neverSaved]
  }, [folderScripts, pendingDrafts, isSinCarpeta, numericFolderId])

  const term = search.trim().toLowerCase()
  const visibleScripts = useMemo(() => {
    const filtered = term
      ? displayScripts.filter(({ script }) => script.title.toLowerCase().includes(term))
      : displayScripts
    return [...filtered].sort((a, b) => b.script.updatedAt - a.script.updatedAt)
  }, [displayScripts, term])

  // FAB de esta pantalla: "Nuevo guion" nace YA asignado a la carpeta que
  // se está viendo (createScript ya soportaba un folderId opcional desde
  // que existían las carpetas) — folderId `undefined` para "Sin carpeta",
  // que es justo lo que significa ausencia de la clave en ScriptRecord.
  // Con la carpeta decidida por contexto, guardarlo no debería tener que
  // volver a preguntar nada (eso lo resuelve la Parte 3).
  async function handleCreateScript() {
    const id = await createScript(undefined, numericFolderId ?? undefined)
    navigate(`/editor/${id}`)
  }

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
      <div className={`p-8 text-sm ${LIB_TEXT_MUTED}`}>
        Esta carpeta ya no existe.{' '}
        <button type="button" onClick={() => navigate('/guiones')} className="text-white underline underline-offset-2 hover:no-underline">
          Volver a la biblioteca
        </button>
      </div>
    )
  }

  const title = isSinCarpeta ? 'Sin carpeta' : (folder?.name ?? '')

  return (
    <div className={LIB_PAGE}>
      <header className="mb-5 flex items-center justify-between">
        <button type="button" onClick={() => navigate('/guiones')} className="text-sm font-medium text-white/90 hover:text-white">
          ‹ Biblioteca
        </button>
        {!isSinCarpeta && folder && (
          <div ref={anchorRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`Más acciones para la carpeta ${folder.name}`}
              className={`rounded-full p-1.5 text-xl leading-none ${LIB_TEXT_MUTED} hover:bg-white/5 hover:text-white`}
            >
              ⋯
            </button>
            {menuOpen &&
              createPortal(
                <div
                  ref={menuRef}
                  style={{ position: 'fixed', top: position.top ?? undefined, bottom: position.bottom ?? undefined, left: position.left }}
                  className={`z-50 w-40 ${LIB_RADIUS_MENU} ${LIB_SURFACE_RAISED} py-1 shadow-xl`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setDialog({ type: 'renameFolder' })
                    }}
                    className="block w-full px-3.5 py-2.5 text-left text-sm text-gray-200 hover:bg-white/5"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      // displayScripts (no folderScripts ni visibleScripts):
                      // incluye los guiones nunca guardados de esta carpeta
                      // (deleteFolder los borra igual — son filas reales en
                      // `scripts`, aunque status:'draft') sin restar los que
                      // un término de búsqueda activo esté ocultando ahora
                      // mismo. El conteo mostrado tiene que ser cuánto se va
                      // a borrar de VERDAD, no cuánto se ve en pantalla.
                      setDialog({ type: 'deleteFolderChoice', count: displayScripts.length })
                    }}
                    className="block w-full px-3.5 py-2.5 text-left text-sm text-red-400 hover:bg-white/5"
                  >
                    Eliminar
                  </button>
                </div>,
                document.body,
              )}
          </div>
        )}
      </header>

      <h1 className={LIB_TITLE}>{title}</h1>

      <div className="relative mt-5 mb-5">
        <SearchIcon className={`pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 ${LIB_TEXT_FAINT}`} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Buscar en ${title}...`}
          className={LIB_SEARCH_INPUT}
        />
      </div>

      {loading && <p className={`text-sm ${LIB_TEXT_MUTED}`}>Cargando...</p>}

      {!loading && visibleScripts.length === 0 && (
        <p className={`text-sm ${LIB_TEXT_MUTED}`}>
          {term ? 'No se encontraron guiones con ese título.' : 'Esta carpeta todavía no tiene guiones.'}
        </p>
      )}

      <div className={`flex flex-col ${LIB_GRID_GAP}`}>
        {visibleScripts.map(({ script, isDraft }) => (
          <ScriptCard
            key={script.id}
            script={script}
            isDraft={isDraft}
            folders={folders}
            onEdit={() => navigate(`/editor/${script.id}`)}
            onOpenTeleprompter={() => navigate(`/teleprompter/${script.id}`)}
            onDuplicate={() => duplicateScript(script.id!)}
            onDelete={() => setDialog({ type: 'deleteScript', scriptId: script.id! })}
            onMoveToFolder={(newFolderId) => moveScriptToFolder(script.id!, newFolderId)}
          />
        ))}
      </div>

      <FabMenu onNewScript={handleCreateScript} />

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
