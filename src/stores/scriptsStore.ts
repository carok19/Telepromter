import { create } from 'zustand'
import { db, type ScriptRecord } from '../db/db'

interface ScriptsState {
  scripts: ScriptRecord[]
  loading: boolean
  // F8.6 (PWA): antes vivía como estado local de EditorPage (para mostrar
  // "Guardando.../Guardado" en su propio header) — se sube acá para que
  // usePwaUpdate.ts (que no está montado dentro de EditorPage) también
  // pueda saber si hay un guardado en curso y NUNCA recargar la app en
  // medio de eso. Una sola fuente de verdad en vez de duplicar el estado.
  saveStatus: 'saved' | 'saving'
  setSaveStatus: (status: 'saved' | 'saving') => void
  loadScripts: () => Promise<void>
  createScript: (title?: string) => Promise<number>
  updateScript: (id: number, patch: Partial<Pick<ScriptRecord, 'title' | 'content'>>) => Promise<void>
  removeScript: (id: number) => Promise<void>
  duplicateScript: (id: number) => Promise<number | undefined>
}

export const useScriptsStore = create<ScriptsState>((set, get) => ({
  scripts: [],
  loading: false,
  saveStatus: 'saved',
  setSaveStatus: (status) => set({ saveStatus: status }),

  loadScripts: async () => {
    set({ loading: true })
    const scripts = await db.scripts.orderBy('updatedAt').reverse().toArray()
    set({ scripts, loading: false })
  },

  createScript: async (title = 'Sin título') => {
    const now = Date.now()
    const id = await db.scripts.add({ title, content: '', createdAt: now, updatedAt: now })
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
      title: `${original.title} (copia)`,
      content: original.content,
      createdAt: now,
      updatedAt: now,
    })
    await get().loadScripts()
    return newId
  },
}))
