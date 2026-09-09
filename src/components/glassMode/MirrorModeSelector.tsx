import type { MirrorMode } from '../../engine/calibrationEngine'

interface MirrorModeSelectorProps {
  value: MirrorMode
  onChange: (mode: MirrorMode) => void
}

const OPTIONS: Array<[MirrorMode, string]> = [
  ['none', 'Normal'],
  ['horizontal', '↔ Espejo horizontal'],
  ['vertical', '↕ Espejo vertical'],
]

export function MirrorModeSelector({ value, onChange }: MirrorModeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-md border border-white/10 bg-[#0f1117] p-1">
      {OPTIONS.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            value === mode ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
