// F8.4 parte B: panel de ajustes en vivo del host, abierto desde el footer
// de TeleprompterPage. Deliberadamente chico — solo los campos que se
// pueden tocar EN VIVO mientras se lee (tamaño de letra, margen,
// interlineado, alineación, espejo, zona de lectura), no el resto de
// CalibrationPanel (posición fina, colores, ghost) que solo tiene sentido
// calibrando tranquilo en Glass Test. Reutiliza el mismo <Slider> que ese
// panel, sin duplicar el control.
//
// Márgenes y Zona de lectura tienen, además del slider, un botón "Ajustar
// arrastrando…" que entra al modo de ajuste directo sobre el propio texto
// (ver TeleprompterPage: MarginGuides/ReadingZoneGuides) — el slider de acá
// sigue sirviendo para un ajuste fino sin salir del panel.
import { CALIBRATION_RANGES, type CalibrationSettings, type MirrorMode, type TextAlign } from '../../engine/calibrationEngine'
import { Slider } from '../shared/Slider'
import { ACCENT_SOFT_BG, ACCENT_TEXT } from '../../styles/tokens'

const MIRROR_OPTIONS: Array<[MirrorMode, string]> = [
  ['none', 'Normal'],
  ['horizontal', '↔ Horizontal'],
  ['vertical', '↕ Vertical'],
]

const TEXT_ALIGN_OPTIONS: Array<[TextAlign, string]> = [
  ['script', 'Del guion'],
  ['left', 'Izquierda'],
  ['center', 'Centro'],
  ['right', 'Derecha'],
]

interface LiveSettingsPanelProps {
  settings: CalibrationSettings
  onChange: (patch: Partial<CalibrationSettings>) => void
  onSave: () => void
  onClose: () => void
  onAdjustMargins: () => void
  onAdjustReadingZone: () => void
}

export function LiveSettingsPanel({
  settings,
  onChange,
  onSave,
  onClose,
  onAdjustMargins,
  onAdjustReadingZone,
}: LiveSettingsPanelProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/10 bg-[#0b0c10]/95 px-6 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-100">Ajustes en vivo</h2>
        <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-100">
          Cerrar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Slider
          label="Tamaño de letra"
          value={settings.fontSize}
          {...CALIBRATION_RANGES.fontSize}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <div className="flex flex-col gap-1">
          <Slider
            label="Margen"
            value={settings.maxWidth}
            {...CALIBRATION_RANGES.maxWidth}
            onChange={(maxWidth) => onChange({ maxWidth })}
          />
          <button type="button" onClick={onAdjustMargins} className="self-start text-[11px] text-gray-400 hover:text-gray-100">
            Ajustar arrastrando los márgenes…
          </button>
        </div>
        <Slider
          label="Interlineado"
          value={settings.lineHeight}
          {...CALIBRATION_RANGES.lineHeight}
          onChange={(lineHeight) => onChange({ lineHeight })}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <label className="flex flex-1 flex-col gap-1 text-xs text-gray-400">
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

        <label className="flex flex-1 flex-col gap-1 text-xs text-gray-400">
          <span>Espejo</span>
          <div className="flex gap-1 rounded-md border border-white/10 bg-[#0f1117] p-1">
            {MIRROR_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ mirror: value })}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  settings.mirror === value ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}` : 'text-gray-400 hover:text-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
        <button type="button" onClick={onAdjustReadingZone} className="self-start text-[11px] text-gray-400 hover:text-gray-100">
          Ajustar arrastrando la zona de lectura…
        </button>
      </div>

      {/* Temporal hasta tocar esto: no se guarda solo. */}
      <button
        type="button"
        onClick={onSave}
        className="self-start rounded-md border border-white/10 px-4 py-2 text-xs text-gray-300 hover:bg-white/5"
      >
        Guardar en perfil
      </button>
    </div>
  )
}
