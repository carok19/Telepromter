// Control de slider reutilizado por el panel de calibración de Glass Test
// (CalibrationPanel) y por el panel de ajustes en vivo del Teleprompter
// (F8.4 parte B) — antes vivía como función privada dentro de
// CalibrationPanel.tsx; se extrae acá tal cual, sin cambiar nada de su
// comportamiento, para no duplicarlo entre los dos paneles.
interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}

export function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-400">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-gray-200">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-blue-500"
      />
    </label>
  )
}
