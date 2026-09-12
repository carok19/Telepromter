import Dexie, { type Table } from 'dexie'
import type { CalibrationSettings } from '../engine/calibrationEngine'

export interface ScriptRecord {
  id?: number
  // title/content acá son SIEMPRE la última versión GUARDADA de verdad
  // (el usuario tocó "Guardar", o el diálogo de salida con cambios sin
  // guardar). El autoguardado en vivo mientras se edita NUNCA escribe acá
  // — ver DraftRecord más abajo — así "Descartar cambios" siempre puede
  // volver exactamente a esto sin perder nada, y un guion nunca aparece a
  // medio escribir en Mis guiones.
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
  // Guardado explícito (tipo Word): 'draft' = todavía nunca se guardó a
  // propósito — no debe listarse en Mis guiones aunque ya exista la fila
  // (se creó para tener un id/URL de inmediato al entrar al editor).
  // Ausente (guiones de antes de esta fase) se trata como 'saved' en
  // todos lados (chequeo `status !== 'draft'`, nunca `=== 'saved'`) — cero
  // migración, todo lo que ya existía queda guardado como estaba.
  status?: 'draft' | 'saved'
}

// El buffer autoguardado en vivo mientras se edita — separado de
// ScriptRecord a propósito, para que "hay cambios sin guardar" sea tan
// simple como "existe una fila acá" en vez de comparar campo por campo.
// Se borra al guardar de verdad (Guardar, o "Guardar" en el aviso de
// salir) o al descartar. Uno por guion como mucho — scriptId es la clave.
export interface DraftRecord {
  scriptId: number
  title: string
  content: string
  updatedAt: number
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
  // Configuración (Parte 3): a lo sumo UN perfil puede tener esto en true
  // a la vez — setDefaultProfile en profilesStore.ts se encarga de que
  // elegir uno nuevo apague el anterior. Ausente = no es el
  // predeterminado (todo perfil de antes de esta fase empieza así, sin
  // migración: nadie queda marcado por sorpresa).
  isDefault?: boolean
}

class RobressDatabase extends Dexie {
  scripts!: Table<ScriptRecord, number>
  profiles!: Table<CalibrationProfileRecord, number>
  folders!: Table<FolderRecord, number>
  drafts!: Table<DraftRecord, number>

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
    // v4: guardado explícito. Agrega `status` a `scripts` (índice, para
    // poder filtrar rápido los guardados) y la tabla `drafts`. Sin
    // `.upgrade()`, mismo criterio que v3: los guiones de antes de esta
    // fase no traen `status`, se tratan como 'saved' en todos lados
    // (nunca se compara `=== 'saved'`, siempre `!== 'draft'`) — quedan
    // exactamente como estaban, ninguno pasa a ser un "borrador" por
    // sorpresa.
    this.version(4).stores({
      scripts: '++id, updatedAt, createdAt, title, folderId, status',
      profiles: '++id, updatedAt, name',
      folders: '++id, updatedAt, name',
      drafts: 'scriptId, updatedAt',
    })
  }
}

export const db = new RobressDatabase()
