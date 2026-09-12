import { create } from 'zustand'
import { db, type FolderRecord, type ScriptRecord } from '../db/db'

interface ScriptsState {
  scripts: ScriptRecord[]
  // Carpetas: cargadas junto con `scripts` (ver loadScripts) porque Mis
  // guiones siempre necesita las dos listas juntas para filtrar/agrupar —
  // separarlas en otro store solo obligaría a coordinar dos cargas en vez
  // de una.
  folders: FolderRecord[]
  loading: boolean
  // F8.6 (PWA): antes vivía como estado local de EditorPage (para mostrar
  // "Guardando.../Guardado" en su propio header) — se sube acá para que
  // usePwaUpdate.ts (que no está montado dentro de EditorPage) también
  // pueda saber si hay un guardado en curso y NUNCA recargar la app en
  // medio de eso. Una sola fuente de verdad en vez de duplicar el estado.
  saveStatus: 'saved' | 'saving'
  setSaveStatus: (status: 'saved' | 'saving') => void
  loadScripts: () => Promise<void>
  createScript: (title?: string, folderId?: number) => Promise<number>
  updateScript: (id: number, patch: Partial<Pick<ScriptRecord, 'title' | 'content'>>) => Promise<void>
  removeScript: (id: number) => Promise<void>
  duplicateScript: (id: number) => Promise<number | undefined>
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
  loading: false,
  saveStatus: 'saved',
  setSaveStatus: (status) => set({ saveStatus: status }),

  loadScripts: async () => {
    set({ loading: true })
    const [scripts, folders] = await Promise.all([
      db.scripts.orderBy('updatedAt').reverse().toArray(),
      db.folders.orderBy('name').toArray(),
    ])
    set({ scripts, folders, loading: false })
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
      ...(folderId != null ? { folderId } : {}),
    })
    await get().loadScripts()
    return id
  },

  updateScript: async (id, patch) => {
    const updatedAt = Date.now()
    await db.scripts.update(id, { ...patch, updatedAt })
    set({
      scripts: get().scripts.map((s) => (s.id === id ? { ...s, ...patch, updatedAt } : s)),
    })
  },

  removeScript: async (id) => {
    await db.scripts.delete(id)
    set({ scripts: get().scripts.filter((s) => s.id !== id) })
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
      // La copia queda en la MISMA carpeta que el original — "duplicar"
      // nunca debería sacar un guion de donde el usuario lo tenía
      // organizado.
      ...(original.folderId != null ? { folderId: original.folderId } : {}),
    })
    await get().loadScripts()
    return newId
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
    await db.transaction('rw', db.scripts, db.folders, async () => {
      if (mode === 'delete') {
        await db.scripts.where('folderId').equals(id).delete()
      } else {
        await db.scripts.where('folderId').equals(id).modify({ folderId: undefined })
      }
      await db.folders.delete(id)
    })
    await get().loadScripts()
  },
}))
