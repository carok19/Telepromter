import Dexie, { type Table } from 'dexie'

export interface ScriptRecord {
  id?: number
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

class RobressDatabase extends Dexie {
  scripts!: Table<ScriptRecord, number>

  constructor() {
    super('robress-teleprompter')
    this.version(1).stores({
      scripts: '++id, updatedAt, createdAt, title',
    })
  }
}

export const db = new RobressDatabase()
