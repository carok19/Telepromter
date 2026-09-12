// Store (Zustand) de perfiles de calibración: CRUD sobre la tabla `profiles`
// de Dexie. Mismo patrón que scriptsStore — el store es una capa de datos
// delgada; la configuración "en vivo" mientras se calibra vive como estado
// local de GlassTestPage, no aquí.
import { create } from 'zustand'
import { db, type CalibrationProfileRecord } from '../db/db'
import type { CalibrationSettings } from '../engine/calibrationEngine'

interface ProfilesState {
  profiles: CalibrationProfileRecord[]
  loading: boolean
  loadProfiles: () => Promise<void>
  createProfile: (name: string, settings: CalibrationSettings) => Promise<number>
  updateProfile: (id: number, settings: CalibrationSettings) => Promise<void>
  // Configuración (Parte 3): renombrar es una operación aparte de
  // updateProfile (que solo toca los valores de calibración) — mismo
  // criterio que ya separa renameFolder de moveScriptToFolder.
  renameProfile: (id: number, name: string) => Promise<void>
  // A lo sumo un perfil marcado a la vez: apaga isDefault en cualquier
  // otro que lo tuviera antes de prenderlo en este.
  setDefaultProfile: (id: number) => Promise<void>
  deleteProfile: (id: number) => Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,

  loadProfiles: async () => {
    set({ loading: true })
    const profiles = await db.profiles.orderBy('updatedAt').reverse().toArray()
    set({ profiles, loading: false })
  },

  createProfile: async (name, settings) => {
    const now = Date.now()
    const id = await db.profiles.add({ name, ...settings, createdAt: now, updatedAt: now })
    await get().loadProfiles()
    return id
  },

  updateProfile: async (id, settings) => {
    const updatedAt = Date.now()
    await db.profiles.update(id, { ...settings, updatedAt })
    set({
      profiles: get().profiles.map((p) => (p.id === id ? { ...p, ...settings, updatedAt } : p)),
    })
  },

  renameProfile: async (id, name) => {
    const updatedAt = Date.now()
    await db.profiles.update(id, { name, updatedAt })
    set({ profiles: get().profiles.map((p) => (p.id === id ? { ...p, name, updatedAt } : p)) })
  },

  setDefaultProfile: async (id) => {
    const updatedAt = Date.now()
    await db.transaction('rw', db.profiles, async () => {
      const previousDefault = await db.profiles.filter((p) => p.isDefault === true).toArray()
      for (const p of previousDefault) {
        if (p.id !== id) await db.profiles.update(p.id!, { isDefault: false })
      }
      await db.profiles.update(id, { isDefault: true, updatedAt })
    })
    set({
      profiles: get().profiles.map((p) => ({ ...p, isDefault: p.id === id, updatedAt: p.id === id ? updatedAt : p.updatedAt })),
    })
  },

  deleteProfile: async (id) => {
    await db.profiles.delete(id)
    set({ profiles: get().profiles.filter((p) => p.id !== id) })
  },
}))
