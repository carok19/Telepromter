import { create } from 'zustand'
import { db, type ScriptRecord } from '../db/db'

interface ScriptsState {
  scripts: ScriptRecord[]
  loading: boolean
  loadScripts: () => Promise<void>
  createScript: (title?: string) => Promise<number>
  updateScript: (id: number, patch: Partial<Pick<ScriptRecord, 'title' | 'content'>>) => Promise<void>
  removeScript: (id: number) => Promise<void>
  duplicateScript: (id: number) => Promise<number | undefined>
}

export const useScriptsStore = create<ScriptsState>((set, get) => ({
  scripts: [],
  loading: false,

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
