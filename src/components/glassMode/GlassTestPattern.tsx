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

// El alfabeto y los números son cadenas SIN espacios: un navegador nunca
// puede partirlas en un salto de línea normal, así que a tamaños de fuente
// grandes o en viewports angostos desbordaban horizontalmente y arrastraban
// a todo el patrón con ellas (bug B1 de la auditoría física). Se agrupan en
// bloques de 5 caracteres separados por espacio para que puedan envolver de
// forma natural en el punto entre bloques.
const ALPHABET_LINE = 'ABCDE FGHIJ KLMNO PQRST UVWXY Z'
const NUMBERS_LINE = '01234 56789'

function PatternContent() {
  return (
    // break-words (overflow-wrap: break-word) es la red de seguridad: si un
    // bloque de 5 caracteres SIGUE siendo más ancho que el contenedor (fuente
    // muy grande + viewport muy angosto), se permite partirlo dentro del
    // bloque en vez de desbordar — nunca oculta ni recorta el texto, solo
    // continúa en la siguiente línea. No afecta a las frases normales (ya
    // envuelven por sus espacios reales antes de necesitar este mecanismo).
    <div className="flex flex-col gap-4 break-words">
      <div className="tracking-wider">{ALPHABET_LINE}</div>
      <div className="tracking-wider">{NUMBERS_LINE}</div>
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
    // minWidth: 0 es necesario porque este nodo es un hijo flex (del
    // contenedor "items-center justify-center" en GlassTestPage): por
    // defecto un hijo flex no se encoge por debajo del ancho de su
    // contenido (min-width: auto — el mismo tipo de problema que min-height
    // causó en el viewport del teleprompter en Fase 2), lo que impediría
    // que break-words entrara en efecto. No cambia nada visible del texto.
    <div style={{ ...stageStyle, minWidth: 0 }}>
      <PatternContent />
      {ghostStyle && (
        <div aria-hidden="true" style={ghostStyle}>
          <PatternContent />
        </div>
      )}
    </div>
  )
}
