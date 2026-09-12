import type { ReactNode } from 'react'
import {
  CALIBRATION_RANGES,
  FONT_WEIGHT_OPTIONS,
  type CalibrationSettings,
  type FontWeight,
  type GhostCompensation,
  type TextAlign,
} from '../../engine/calibrationEngine'
import { Slider } from '../shared/Slider'

interface CalibrationPanelProps {
  settings: CalibrationSettings
  onChange: (patch: Partial<CalibrationSettings>) => void
}

const TEXT_ALIGN_OPTIONS: Array<[TextAlign, string]> = [
  ['script', 'Del guion'],
  ['left', 'Izquierda'],
  ['center', 'Centro'],
  ['right', 'Derecha'],
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </div>
  )
}

export function CalibrationPanel({ settings, onChange }: CalibrationPanelProps) {
  function updateGhost(patch: Partial<GhostCompensation>) {
    onChange({ ghostCompensation: { ...settings.ghostCompensation, ...patch } })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Posición">
        <Slider
          label="Desplazamiento X"
          value={settings.offsetX}
          {...CALIBRATION_RANGES.offsetX}
          onChange={(offsetX) => onChange({ offsetX })}
        />
        <Slider
          label="Desplazamiento Y"
          value={settings.offsetY}
          {...CALIBRATION_RANGES.offsetY}
          onChange={(offsetY) => onChange({ offsetY })}
        />
      </Section>

      <Section title="Tipografía">
        <Slider
          label="Tamaño de letra"
          value={settings.fontSize}
          {...CALIBRATION_RANGES.fontSize}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          <span>Grosor</span>
          <select
            value={settings.fontWeight}
            onChange={(e) => onChange({ fontWeight: e.target.value as FontWeight })}
            className="rounded border border-white/10 bg-[#0f1117] px-2 py-1.5 text-sm text-gray-200"
          >
            {FONT_WEIGHT_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Slider
          label="Interlineado"
          value={settings.lineHeight}
          {...CALIBRATION_RANGES.lineHeight}
          onChange={(lineHeight) => onChange({ lineHeight })}
        />
        <Slider
          label="Espaciado entre letras"
          value={settings.letterSpacing}
          {...CALIBRATION_RANGES.letterSpacing}
          onChange={(letterSpacing) => onChange({ letterSpacing })}
        />
        <Slider
          label="Ancho máximo"
          value={settings.maxWidth}
          {...CALIBRATION_RANGES.maxWidth}
          onChange={(maxWidth) => onChange({ maxWidth })}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          <span>Alineación</span>
          <div className="flex gap-1 rounded-md border border-white/10 bg-[#0f1117] p-1">
            {TEXT_ALIGN_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ textAlign: value })}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  settings.textAlign === value ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
      </Section>

      <Section title="Imagen">
        <Slider
          label="Brillo"
          value={settings.brightness}
          {...CALIBRATION_RANGES.brightness}
          onChange={(brightness) => onChange({ brightness })}
        />
        <Slider
          label="Contraste"
          value={settings.contrast}
          {...CALIBRATION_RANGES.contrast}
          onChange={(contrast) => onChange({ contrast })}
        />
      </Section>

      <Section title="Colores">
        <label className="flex items-center justify-between text-xs text-gray-400">
          <span>Color del texto</span>
          <input
            type="color"
            value={settings.textColor}
            onChange={(e) => onChange({ textColor: e.target.value })}
            className="h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-gray-400">
          <span>Color de fondo</span>
          <input
            type="color"
            value={settings.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            className="h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-gray-400">
          <span>Invertir colores</span>
          <input
            type="checkbox"
            checked={settings.invertColors}
            onChange={(e) => onChange({ invertColors: e.target.checked })}
            className="h-4 w-4 accent-blue-500"
          />
        </label>
      </Section>

      <div className="flex flex-col gap-3 pb-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400">
            Compensación experimental de doble reflejo
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-amber-300/80">
            Experimental: esta función no cancela físicamente el reflejo del vidrio. Puede mejorar o
            empeorar la percepción según el montaje.
          </p>
        </div>

        <label className="flex items-center justify-between text-xs text-gray-400">
          <span>Activar compensación</span>
          <input
            type="checkbox"
            checked={settings.ghostCompensation.enabled}
            onChange={(e) => updateGhost({ enabled: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
          />
        </label>

        {settings.ghostCompensation.enabled && (
          <>
            <Slider
              label="Offset X secundario"
              value={settings.ghostCompensation.offsetX2}
              {...CALIBRATION_RANGES.ghostOffset}
              onChange={(offsetX2) => updateGhost({ offsetX2 })}
            />
            <Slider
              label="Offset Y secundario"
              value={settings.ghostCompensation.offsetY2}
              {...CALIBRATION_RANGES.ghostOffset}
              onChange={(offsetY2) => updateGhost({ offsetY2 })}
            />
            <Slider
              label="Opacidad"
              value={settings.ghostCompensation.opacity2}
              {...CALIBRATION_RANGES.ghostOpacity}
              onChange={(opacity2) => updateGhost({ opacity2 })}
            />
            <Slider
              label="Intensidad"
              value={settings.ghostCompensation.intensity2}
              {...CALIBRATION_RANGES.ghostIntensity}
              onChange={(intensity2) => updateGhost({ intensity2 })}
            />
            <Slider
              label="Blur"
              value={settings.ghostCompensation.blur2}
              {...CALIBRATION_RANGES.ghostBlur}
              onChange={(blur2) => updateGhost({ blur2 })}
            />
          </>
        )}
      </div>
    </div>
  )
}
