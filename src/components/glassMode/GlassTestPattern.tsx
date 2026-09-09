import { buildCalibrationStyle, buildGhostLayerStyle, type CalibrationSettings } from '../../engine/calibrationEngine'

interface GlassTestPatternProps {
  settings: CalibrationSettings
}

// Frases largas y variadas (no solo letras sueltas) para poder juzgar
// nitidez, separación entre líneas y legibilidad de una línea completa —
// tal como se leería un guion real reflejado en el vidrio.
const TEST_LINES = [
  'El veloz murciélago hindú comía feliz cardillo y kiwi',
  'La calibración del vidrio requiere ajustar cada parámetro con cuidado',
  'Este texto de prueba permite evaluar el reflejo en el teleprompter casero',
  'Ajuste el brillo y el contraste hasta lograr la mayor nitidez posible',
]

function PatternContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="tracking-wider">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
      <div className="tracking-wider">0123456789</div>
      {TEST_LINES.map((line) => (
        <div key={line}>{line}</div>
      ))}
      <div className="flex flex-col gap-2 text-left">
        <div className="text-left">Texto alineado a la izquierda</div>
        <div className="text-center">Texto centrado</div>
        <div className="text-right">Texto alineado a la derecha</div>
      </div>
    </div>
  )
}

export function GlassTestPattern({ settings }: GlassTestPatternProps) {
  const stageStyle = buildCalibrationStyle(settings)
  const ghostStyle = buildGhostLayerStyle(settings)

  return (
    <div style={stageStyle}>
      <PatternContent />
      {ghostStyle && (
        <div aria-hidden="true" style={ghostStyle}>
          <PatternContent />
        </div>
      )}
    </div>
  )
}
