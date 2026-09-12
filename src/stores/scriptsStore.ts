import { create } from 'zustand'
import { db, type DraftRecord, type FolderRecord, type ScriptRecord } from '../db/db'

// Guardado explícito (tipo Word): un guion recién creado nace con
// status:'draft' y NO aparece en `scripts` (la lista que ve Mis guiones)
// hasta que se guarda de verdad. Mientras se edita, el autoguardado
// escribe en la tabla `drafts` (ver DraftRecord en db.ts) — nunca en
// `scripts.title/content` — así "Descartar cambios" siempre puede volver
// exactamente a la última versión guardada sin perder nada, y un guion a
// medio escribir nunca se ve en la biblioteca.
export interface PendingDraft {
  script: ScriptRecord
  draft: DraftRecord
}

interface ScriptsState {
  // Solo guiones GUARDADOS (status !== 'draft') — lo que ve Mis guiones y
  // las carpetas. Un guion recién creado sin guardar todavía no aparece
  // acá aunque ya tenga una fila real en Dexie.
  scripts: ScriptRecord[]
  // Carpetas: cargadas junto con `scripts` (ver loadScripts) porque Mis
  // guiones siempre necesita las dos listas juntas para filtrar/agrupar —
  // separarlas en otro store solo obligaría a coordinar dos cargas en vez
  // de una.
  folders: FolderRecord[]
  // Guiones con cambios sin guardar recuperables: tanto un guion nuevo
  // que nunca se guardó (status:'draft' con contenido tipeado) como uno
  // ya guardado con una edición pendiente. Mis guiones los muestra aparte
  // para que nunca queden invisibles/perdidos si se cerró la pestaña sin
  // pasar por el aviso de salir.
  pendingDrafts: PendingDraft[]
  loading: boolean
  // F8.6 (PWA): antes vivía como estado local de EditorPage (para mostrar
  // "Guardando.../Guardado" en su propio header) — se sube acá para que
  // usePwaUpdate.ts (que no está montado dentro de EditorPage) también
  // pueda saber si hay cambios sin guardar y NUNCA recargar la app en
  // medio de eso. Una sola fuente de verdad en vez de duplicar el estado.
  // Con guardado explícito, 'saving' cubre TODA la ventana con cambios
  // sin confirmar (no solo el debounce de 500ms del autoguardado interno).
  saveStatus: 'saved' | 'saving'
  setSaveStatus: (status: 'saved' | 'saving') => void
  loadScripts: () => Promise<void>
  // status siempre 'draft' acá — es el único punto donde nace un guion
  // genuinamente nuevo. No aparecerá en `scripts` hasta guardarlo.
  createScript: (title?: string, folderId?: number) => Promise<number>
  removeScript: (id: number) => Promise<void>
  duplicateScript: (id: number) => Promise<number | undefined>
  // Autoguardado en vivo: upsert en `drafts`, nunca toca `scripts`.
  saveDraft: (scriptId: number, patch: { title: string; content: string }) => Promise<void>
  // Guardado explícito de verdad: title/content pasan a `scripts`,
  // status:'saved', y se borra la fila de `drafts` — ya no hay "cambios
  // sin guardar" hasta la próxima edición. `folderId` es opcional a
  // propósito (Parte 3, selector de carpeta al primer guardado):
  // ausente = no tocar la carpeta que el guion ya tenía (guardados
  // posteriores, o guion creado con carpeta por contexto); `null` = fijar
  // "Sin carpeta"; un número = fijar esa carpeta.
  commitSave: (scriptId: number, title: string, content: string, folderId?: number | null) => Promise<void>
  // "Descartar cambios": borra el borrador. Si el guion NUNCA se había
  // guardado (status:'draft'), también borra el guion entero — no debe
  // quedar nada en la biblioteca. Si ya estaba guardado, solo se pierde
  // la edición pendiente; title/content guardados quedan intactos.
  discardDraft: (scriptId: number) => Promise<void>
  // folderId `null` = mover a "Sin carpeta" (borra la clave del registro,
  // no la deja en `null` — ver el comentario de ScriptRecord.folderId).
  moveScriptToFolder: (id: number, folderId: number | null) => Promise<void>
  createFolder: (name: string) => Promise<number>
  renameFolder: (id: number, name: string) => Promise<void>
  // 'move' (por defecto en la UI): mueve los guiones de esa carpeta a "Sin
  // carpeta" antes de borrarla — nunca los toca de otro modo. 'delete':
  // borra la carpeta Y todos sus guiones — la opción destructiva, que
  // LibraryPage solo ofrece tras una confirmación aparte. Ninguno de los
  // dos modos pregunta nada acá: eso es responsabilidad de la UI.
  deleteFolder: (id: number, mode: 'move' | 'delete') => Promise<void>
}

export const useScriptsStore = create<ScriptsState>((set, get) => ({
  scripts: [],
  folders: [],
  pendingDrafts: [],
  loading: false,
  saveStatus: 'saved',
  setSaveStatus: (status) => set({ saveStatus: status }),

  loadScripts: async () => {
    set({ loading: true })
    const [allScripts, folders, drafts] = await Promise.all([
      db.scripts.orderBy('updatedAt').reverse().toArray(),
      db.folders.orderBy('name').toArray(),
      db.drafts.toArray(),
    ])
    const scriptById = new Map(allScripts.map((s) => [s.id!, s]))
    const pendingDrafts: PendingDraft[] = drafts
      .map((draft) => {
        const script = scriptById.get(draft.scriptId)
        return script ? { script, draft } : null
      })
      .filter((d): d is PendingDraft => d !== null)
      .sort((a, b) => b.draft.updatedAt - a.draft.updatedAt)
    set({
      scripts: allScripts.filter((s) => s.status !== 'draft'),
      folders,
      pendingDrafts,
      loading: false,
    })
  },

  // title='' (no 'Sin título'): el título vacío se muestra como
  // placeholder gris en el editor y como "Sin título" en la biblioteca
  // (ScriptCard ya hace `script.title || 'Sin título'`) — pero como TEXTO
  // real en el campo, antes había que borrarlo para poder escribir.
  createScript: async (title = '', folderId) => {
    const now = Date.now()
    const id = await db.scripts.add({
      title,
      content: '',
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      ...(folderId != null ? { folderId } : {}),
    })
    await get().loadScripts()
    return id
  },

  removeScript: async (id) => {
    await db.transaction('rw', db.scripts, db.drafts, async () => {
      await db.scripts.delete(id)
      await db.drafts.delete(id)
    })
    set({
      scripts: get().scripts.filter((s) => s.id !== id),
      pendingDrafts: get().pendingDrafts.filter((d) => d.script.id !== id),
    })
  },

  duplicateScript: async (id) => {
    const original = await db.scripts.get(id)
    if (!original) return undefined
    const now = Date.now()
    const newId = await db.scripts.add({
      // Un original sin título queda sin título también — "(copia)" a
      // secas se leería como si ESE fuera el título real.
      title: original.title ? `${original.title} (copia)` : '',
      content: original.content,
      createdAt: now,
      updatedAt: now,
      // Duplicar un guion ya guardado produce otro guion ya guardado —
      // aparece de inmediato en Mis guiones, sin pedir "Guardar" para
      // algo que el usuario no tipeó de cero.
      status: 'saved',
      // La copia queda en la MISMA carpeta que el original — "duplicar"
      // nunca debería sacar un guion de donde el usuario lo tenía
      // organizado.
      ...(original.folderId != null ? { folderId: original.folderId } : {}),
    })
    await get().loadScripts()
    return newId
  },

  saveDraft: async (scriptId, patch) => {
    await db.drafts.put({ scriptId, title: patch.title, content: patch.content, updatedAt: Date.now() })
  },

  commitSave: async (scriptId, title, content, folderId) => {
    const updatedAt = Date.now()
    const patch: { title: string; content: string; status: 'saved'; updatedAt: number; folderId?: number } = {
      title,
      content,
      status: 'saved',
      updatedAt,
    }
    // folderId === undefined (parámetro omitido): no tocar la carpeta que
    // el guion ya tenía. folderId === null: "Sin carpeta" de verdad (borra
    // la clave, mismo criterio que moveScriptToFolder). Un número: esa
    // carpeta.
    if (folderId !== undefined) patch.folderId = folderId ?? undefined
    await db.transaction('rw', db.scripts, db.drafts, async () => {
      await db.scripts.update(scriptId, patch)
      await db.drafts.delete(scriptId)
    })
    await get().loadScripts()
  },

  discardDraft: async (scriptId) => {
    const script = await db.scripts.get(scriptId)
    await db.transaction('rw', db.scripts, db.drafts, async () => {
      await db.drafts.delete(scriptId)
      if (script && script.status === 'draft') {
        await db.scripts.delete(scriptId)
      }
    })
    await get().loadScripts()
  },

  moveScriptToFolder: async (id, folderId) => {
    const updatedAt = Date.now()
    // folderId undefined (no null) borra la clave del registro — Dexie
    // trata una propiedad puesta en `undefined` en `.update()` como "quitar
    // esta clave", que es justo lo que significa "Sin carpeta" acá.
    await db.scripts.update(id, { folderId: folderId ?? undefined, updatedAt })
    set({
      scripts: get().scripts.map((s) => (s.id === id ? { ...s, folderId: folderId ?? undefined, updatedAt } : s)),
    })
  },

  createFolder: async (name) => {
    const now = Date.now()
    const id = await db.folders.add({ name, createdAt: now, updatedAt: now })
    await get().loadScripts()
    return id
  },

  renameFolder: async (id, name) => {
    const updatedAt = Date.now()
    await db.folders.update(id, { name, updatedAt })
    set({ folders: get().folders.map((f) => (f.id === id ? { ...f, name, updatedAt } : f)) })
  },

  deleteFolder: async (id, mode) => {
    await db.transaction('rw', db.scripts, db.folders, db.drafts, async () => {
      if (mode === 'delete') {
        const idsToDelete = await db.scripts.where('folderId').equals(id).primaryKeys()
        await db.scripts.where('folderId').equals(id).delete()
        await db.drafts.where('scriptId').anyOf(idsToDelete).delete()
      } else {
        await db.scripts.where('folderId').equals(id).modify({ folderId: undefined })
      }
      await db.folders.delete(id)
    })
    await get().loadScripts()
  },
}))
