import Dexie, { type Table } from 'dexie'
import type { CalibrationSettings } from '../engine/calibrationEngine'

export interface ScriptRecord {
  id?: number
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

// Un perfil guardado = la configuración de calibración (reutilizada tal
// cual desde calibrationEngine, sin duplicar su forma) más nombre e
// identificación para poder tener varios (Teléfono, Tablet, etc.).
export interface CalibrationProfileRecord extends CalibrationSettings {
  id?: number
  name: string
  createdAt: number
  updatedAt: number
}

class RobressDatabase extends Dexie {
  scripts!: Table<ScriptRecord, number>
  profiles!: Table<CalibrationProfileRecord, number>

  constructor() {
    super('robress-teleprompter')
    this.version(1).stores({
      scripts: '++id, updatedAt, createdAt, title',
    })
    // v2 agrega la tabla de perfiles de calibración sin tocar `scripts`.
    this.version(2).stores({
      scripts: '++id, updatedAt, createdAt, title',
      profiles: '++id, updatedAt, name',
    })
  }
}

export const db = new RobressDatabase()
