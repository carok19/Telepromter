import Dexie, { type Table } from 'dexie'
import type { CalibrationSettings } from '../engine/calibrationEngine'

export interface ScriptRecord {
  id?: number
  title: string
  content: string
  createdAt: number
  updatedAt: number
  // Carpetas: ausente (no `null`, para que Dexie pueda borrar la clave por
  // completo con `update({ folderId: undefined })`) significa "Sin
  // carpeta". Todo guion creado ANTES de esta fase simplemente no trae este
  // campo — Dexie no reescribe filas existentes al subir de versión, así
  // que no hace falta ninguna migración: se tratan igual que un guion
  // nuevo sin carpeta elegida.
  folderId?: number
}

// Una carpeta = solo nombre + timestamps. No lleva un color ni ningún otro
// dato — la organización real (qué guion está en cuál) vive en
// ScriptRecord.folderId, no acá, para no tener que mantener dos listas
// sincronizadas.
export interface FolderRecord {
  id?: number
  name: string
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
  folders!: Table<FolderRecord, number>

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
    // v3 agrega carpetas: la tabla `folders` y el índice `folderId` en
    // `scripts` (para poder hacer `where('folderId').equals(id)` al borrar
    // una carpeta). Sin `.upgrade()`: Dexie no reescribe las filas de
    // `scripts` ya existentes, así que simplemente no traen `folderId` —
    // se comportan igual que un guion nuevo sin carpeta elegida, sin
    // ninguna migración ni riesgo de perder guiones.
    this.version(3).stores({
      scripts: '++id, updatedAt, createdAt, title, folderId',
      profiles: '++id, updatedAt, name',
      folders: '++id, updatedAt, name',
    })
  }
}

export const db = new RobressDatabase()
