// Panel de campos de calibración, compartido por Prueba de vidrio y por el
// cajón de Ajustes del Teleprompter (antes eran dos componentes separados,
// CalibrationPanel y LiveSettingsPanel, con el segundo exponiendo menos
// campos que el primero — quedaban desincronizados a propósito). Ahora es
// uno solo: mismos campos, mismo comportamiento, en las dos pantallas.
//
// `collapsible`: en el cajón angosto del Teleprompter las secciones se
// pliegan (una a la vez) para no obligar a un scroll eterno en celular. En
// Prueba de vidrio, que ya tiene un panel lateral de alto completo con su
// propio scroll y nunca se quejaron de eso, quedan todas abiertas (default),
// para no arriesgar una regresión ahí por un problema que no existía.
//
// `onAdjustMargins`/`onAdjustReadingZone` son opcionales: solo el
// Teleprompter tiene un modo de ajuste directo (arrastrar sobre el propio
// texto) al que estos botones entran — en Prueba de vidrio, que no tiene ese
// modo, sencillamente no se pasan y los botones no se renderizan. Un solo
// componente, sin bifurcar su lógica interna por pantalla.
import { useState, type ReactNode } from 'react'
import {
  CALIBRATION_RANGES,
  FONT_WEIGHT_OPTIONS,
  type CalibrationSettings,
  type FontWeight,
  type GhostCompensation,
  type TextAlign,
} from '../../engine/calibrationEngine'
import { MirrorModeSelector } from '../glassMode/MirrorModeSelector'
import { Slider } from '../shared/Slider'
import { ACCENT_SOFT_BG, ACCENT_TEXT } from '../../styles/tokens'

interface CalibrationSettingsPanelProps {
  settings: CalibrationSettings
  onChange: (patch: Partial<CalibrationSettings>) => void
  collapsible?: boolean
  onAdjustMargins?: () => void
  onAdjustReadingZone?: () => void
}

const TEXT_ALIGN_OPTIONS: Array<[TextAlign, string]> = [
  ['script', 'Del guion'],
  ['left', 'Izquierda'],
  ['center', 'Centro'],
  ['right', 'Derecha'],
]

function Section({
  title,
  children,
  collapsible,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  collapsible: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!collapsible) {
    return (
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        {children}
      </div>
    )
  }

  return (
    <div className="border-b border-white/10 pb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-1 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</span>
        <span className="text-gray-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="flex flex-col gap-3 pt-2">{children}</div>}
    </div>
  )
}

export function CalibrationSettingsPanel({
  settings,
  onChange,
  collapsible = false,
  onAdjustMargins,
  onAdjustReadingZone,
}: CalibrationSettingsPanelProps) {
  function updateGhost(patch: Partial<GhostCompensation>) {
    onChange({ ghostCompensation: { ...settings.ghostCompensation, ...patch } })
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Texto" collapsible={collapsible} defaultOpen>
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
        <div className="flex flex-col gap-1">
          <Slider
            label="Margen"
            value={settings.maxWidth}
            {...CALIBRATION_RANGES.maxWidth}
            onChange={(maxWidth) => onChange({ maxWidth })}
          />
          {onAdjustMargins && (
            <button type="button" onClick={onAdjustMargins} className="self-start text-[11px] text-gray-400 hover:text-gray-100">
              Ajustar arrastrando los márgenes…
            </button>
          )}
        </div>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          <span>Alineación</span>
          <div className="flex gap-1 rounded-md border border-white/10 bg-[#0f1117] p-1">
            {TEXT_ALIGN_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ textAlign: value })}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  settings.textAlign === value ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}` : 'text-gray-400 hover:text-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          <span>Espejo</span>
          <MirrorModeSelector value={settings.mirror} onChange={(mirror) => onChange({ mirror })} />
        </label>
      </Section>

      <Section title="Posición y zona de lectura" collapsible={collapsible} defaultOpen={false}>
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
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <span className="text-xs text-gray-400">Zona de lectura</span>
          <button
            type="button"
            onClick={() => onChange({ readingZone: { ...settings.readingZone, enabled: !settings.readingZone.enabled } })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              settings.readingZone.enabled ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}` : 'border border-white/10 text-gray-400 hover:text-gray-100'
            }`}
          >
            {settings.readingZone.enabled ? 'Activada' : 'Desactivada'}
          </button>
        </div>
        <Slider
          label="Posición"
          value={settings.readingZone.center}
          {...CALIBRATION_RANGES.readingZoneCenter}
          onChange={(center) => onChange({ readingZone: { ...settings.readingZone, center } })}
        />
        <Slider
          label="Alto de la franja"
          value={settings.readingZone.height}
          {...CALIBRATION_RANGES.readingZoneHeight}
          onChange={(height) => onChange({ readingZone: { ...settings.readingZone, height } })}
        />
        {onAdjustReadingZone && (
          <button type="button" onClick={onAdjustReadingZone} className="self-start text-[11px] text-gray-400 hover:text-gray-100">
            Ajustar arrastrando la zona de lectura…
          </button>
        )}
      </Section>

      <Section title="Imagen y color" collapsible={collapsible} defaultOpen={false}>
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
            className="h-4 w-4 accent-accent"
          />
        </label>
      </Section>

      <Section title="Ghost (experimental)" collapsible={collapsible} defaultOpen={false}>
        <p className="text-[11px] leading-snug text-amber-300/80">
          Experimental: esta función no cancela físicamente el reflejo del vidrio. Puede mejorar o empeorar la
          percepción según el montaje.
        </p>
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
      </Section>
    </div>
  )
}
