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

  deleteProfile: async (id) => {
    await db.profiles.delete(id)
    set({ profiles: get().profiles.filter((p) => p.id !== id) })
  },
}))
