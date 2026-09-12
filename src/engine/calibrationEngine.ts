// CalibrationEngine — configuración visual para el montaje físico (celular/
// tablet detrás de un vidrio reflectivo). No es un motor con bucle de
// animación como TeleprompterEngine: son tipos + funciones puras que
// transforman un `CalibrationSettings` en estilos CSS. Lo usa Glass Test
// (Fase 3) y queda preparado para que, en una fase posterior, el mismo
// `buildCalibrationStyle()` se aplique también al contenido de
// TeleprompterPage — sin que este archivo dependa de ninguno de los dos.
import type { CSSProperties } from 'react'

export type MirrorMode = 'none' | 'horizontal' | 'vertical'
export type FontWeight = 'light' | 'regular' | 'medium' | 'semibold' | 'bold'
// F8.4 parte B: 'script' (default) respeta la alineación que el editor ya
// grabó por párrafo (document.execCommand('justify...') deja
// `style="text-align: ..."` inline en cada bloque) — no se toca nada. Las
// otras tres FUERZAN esa alineación en todo el contenido, ver
// getTextAlignOverrideCss() más abajo: un `text-align` puesto acá en el
// wrapper NO alcanza, porque el estilo inline de cada bloque individual
// tiene más especificidad que cualquier regla heredada.
export type TextAlign = 'script' | 'left' | 'center' | 'right'

export interface GhostCompensation {
  enabled: boolean
  // Desplazamiento de la segunda copia respecto al texto principal, en px.
  offsetX2: number
  offsetY2: number
  // Opacidad de la segunda copia, en porcentaje (0-100). Se guarda como
  // porcentaje por consistencia con brightness/contrast/intensity de la UI;
  // se convierte a 0-1 recién al construir el estilo CSS.
  opacity2: number
  // "Intensidad": brillo adicional aplicado solo a la segunda copia, en
  // porcentaje (100 = sin cambio), independiente de la opacidad.
  intensity2: number
  // Desenfoque de la segunda copia, en px.
  blur2: number
}

export interface CalibrationSettings {
  mirror: MirrorMode
  // Desplazamiento fino de todo el bloque de texto respecto al centro del
  // área visible, en px de CSS (px de referencia, no píxeles físicos del
  // dispositivo — por eso se comportan de forma razonable entre celular y
  // tablet sin necesitar conocer la resolución exacta).
  offsetX: number
  offsetY: number
  // Tamaño de fuente en px. Sin tope arbitrario más allá del rango de la UI.
  fontSize: number
  fontWeight: FontWeight
  // Interlineado como multiplicador (relativo a fontSize, ya independiente
  // de la resolución).
  lineHeight: number
  // Espaciado entre letras en px.
  letterSpacing: number
  // Ancho máximo del bloque de texto como PORCENTAJE del contenedor (no px),
  // para que se comporte igual en pantallas de distinto tamaño.
  maxWidth: number
  // Ver TextAlign arriba. Un perfil guardado ANTES de que este campo
  // existiera simplemente no lo trae — se trata igual que 'script' en
  // todos lados (DEFAULT_CALIBRATION.textAlign más abajo, y el spread
  // `{...DEFAULT_CALIBRATION, ...perfilViejo}` en TeleprompterPage), así
  // que un perfil viejo se sigue viendo exactamente igual que antes.
  textAlign: TextAlign
  // Brillo/contraste como porcentaje CSS (100 = sin cambio), igual que
  // `filter: brightness()/contrast()`.
  brightness: number
  contrast: number
  textColor: string
  backgroundColor: string
  // Si está activo, se intercambian textColor/backgroundColor al renderizar
  // (no se usa un filtro CSS invert(), para no alterar también otros
  // colores de acento que puedan agregarse más adelante).
  invertColors: boolean
  // Herramienta EXPERIMENTAL: no cancela el reflejo físico del vidrio (una
  // pantalla no puede restar la luz que refleja el propio vidrio). Renderiza
  // una segunda copia semitransparente del mismo texto para probar si
  // alguna combinación reduce la percepción del doble reflejo. Opcional,
  // independiente del resto del perfil, y desactivable por completo.
  ghostCompensation: GhostCompensation
}

export const DEFAULT_CALIBRATION: CalibrationSettings = {
  mirror: 'none',
  offsetX: 0,
  offsetY: 0,
  fontSize: 56,
  fontWeight: 'semibold',
  lineHeight: 1.4,
  letterSpacing: 0,
  maxWidth: 90,
  textAlign: 'script',
  brightness: 100,
  contrast: 100,
  textColor: '#f3f4f6',
  backgroundColor: '#0b0c10',
  invertColors: false,
  ghostCompensation: {
    enabled: false,
    offsetX2: 4,
    offsetY2: 4,
    opacity2: 30,
    intensity2: 100,
    blur2: 1,
  },
}

export const FONT_WEIGHT_OPTIONS: Array<[FontWeight, string, number]> = [
  ['light', 'Light', 300],
  ['regular', 'Regular', 400],
  ['medium', 'Medium', 500],
  ['semibold', 'SemiBold', 600],
  ['bold', 'Bold', 700],
]

function fontWeightToCss(weight: FontWeight): number {
  return FONT_WEIGHT_OPTIONS.find(([key]) => key === weight)?.[2] ?? 400
}

// Rangos pensados para calibrar un celular/tablet detrás de vidrio, no para
// una resolución concreta. Documentados en un solo lugar para que la UI
// (CalibrationPanel) no tenga números mágicos repetidos.
export const CALIBRATION_RANGES = {
  offsetX: { min: -150, max: 150, step: 1, unit: 'px' },
  offsetY: { min: -150, max: 150, step: 1, unit: 'px' },
  fontSize: { min: 24, max: 140, step: 1, unit: 'px' },
  lineHeight: { min: 1, max: 2.5, step: 0.1, unit: '×' },
  letterSpacing: { min: -2, max: 20, step: 0.5, unit: 'px' },
  maxWidth: { min: 30, max: 100, step: 5, unit: '%' },
  brightness: { min: 50, max: 200, step: 5, unit: '%' },
  contrast: { min: 50, max: 200, step: 5, unit: '%' },
  ghostOffset: { min: -60, max: 60, step: 1, unit: 'px' },
  ghostOpacity: { min: 0, max: 100, step: 5, unit: '%' },
  ghostIntensity: { min: 50, max: 200, step: 5, unit: '%' },
  ghostBlur: { min: 0, max: 5, step: 0.5, unit: 'px' },
} as const

export function getEffectiveColors(settings: CalibrationSettings): { text: string; background: string } {
  return settings.invertColors
    ? { text: settings.backgroundColor, background: settings.textColor }
    : { text: settings.textColor, background: settings.backgroundColor }
}

// Estilo del "escenario": mirror + posición + tipografía + brillo/contraste
// + color de texto. Se aplica tanto al texto principal como (por herencia,
// ya que el ghost es hijo de este mismo nodo) a la copia fantasma, para que
// ambas capas se muevan/reflejen juntas como una sola imagen en el vidrio.
export function buildCalibrationStyle(settings: CalibrationSettings): CSSProperties {
  const { text } = getEffectiveColors(settings)
  const scaleX = settings.mirror === 'horizontal' ? -1 : 1
  const scaleY = settings.mirror === 'vertical' ? -1 : 1
  return {
    position: 'relative',
    margin: '0 auto',
    maxWidth: `${settings.maxWidth}%`,
    fontSize: `${settings.fontSize}px`,
    fontWeight: fontWeightToCss(settings.fontWeight),
    lineHeight: settings.lineHeight,
    letterSpacing: `${settings.letterSpacing}px`,
    // Sin efecto real por sí solo si el contenido tiene bloques con su
    // propio `text-align` inline (ver TEXT_ALIGN_OVERRIDE_CLASS/
    // getTextAlignOverrideCss) — se deja igual acá para que el wrapper sea
    // consistente consigo mismo incluso si algún día lo usa un contenido
    // sin esos estilos inline.
    textAlign: settings.textAlign === 'script' ? undefined : settings.textAlign,
    color: text,
    // translate() primero (a la izquierda en la lista) para que se aplique
    // último visualmente: el desplazamiento queda en coordenadas de
    // pantalla ya reflejadas, así offsetX/Y se sienten igual con o sin
    // espejo activado.
    transform: `translate(${settings.offsetX}px, ${settings.offsetY}px) scaleX(${scaleX}) scaleY(${scaleY})`,
    filter: `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`,
  }
}

// Estilo de la segunda capa (compensación experimental de doble reflejo).
// Devuelve `null` si está desactivada, para que el componente simplemente no
// la renderice.
//
// Esta capa es un nodo HIJO del "escenario" (el mismo elemento que ya tiene
// aplicado scaleX/scaleY del mirror principal — ver buildCalibrationStyle).
// Un transform hijo se compone DENTRO del sistema de coordenadas que le
// hereda su padre, así que si aquí se hiciera simplemente
// `translate(offsetX2, offsetY2)`, con el mirror horizontal activo esa
// traslación terminaría viéndose invertida en pantalla (bug B2 de la
// auditoría física: "+X" se sentía como "izquierda" en vez de "derecha").
//
// La corrección (demostrada por composición de matrices, no por prueba y
// error): premultiplicar offsetX2/offsetY2 por el mismo signo que el padre
// aplica en su propio scaleX/scaleY, y NO agregar ningún scale propio en
// este nodo. Al componerse con el scale heredado del padre, ese signo se
// cancela exactamente y el desplazamiento queda expresado en coordenadas
// reales de pantalla (+X siempre a la derecha, +Y siempre hacia abajo),
// para cualquier combinación de mirror — igual que ya se siente el offset
// del texto principal. La ORIENTACIÓN del texto del ghost (reflejado o no)
// no cambia: sigue determinada enteramente por el mirror heredado del
// padre, ya que este nodo no aplica ningún scale propio.
export function buildGhostLayerStyle(settings: CalibrationSettings): CSSProperties | null {
  const ghost = settings.ghostCompensation
  if (!ghost.enabled) return null
  const mirrorSignX = settings.mirror === 'horizontal' ? -1 : 1
  const mirrorSignY = settings.mirror === 'vertical' ? -1 : 1
  return {
    position: 'absolute',
    inset: 0,
    transform: `translate(${mirrorSignX * ghost.offsetX2}px, ${mirrorSignY * ghost.offsetY2}px)`,
    opacity: ghost.opacity2 / 100,
    filter: `blur(${ghost.blur2}px) brightness(${ghost.intensity2}%)`,
  }
}

// F8.4 parte B — forzar alineación: el editor graba `text-align` como
// estilo INLINE en cada bloque (`document.execCommand('justifyLeft'/
// 'justifyCenter'/'justifyRight')`), que gana por especificidad sobre
// cualquier `text-align` puesto en un contenedor padre (heredado, no
// forzado). La única forma de forzarlo sin reescribir el HTML del guion es
// una regla de hoja de estilos con `!important`, que sí le gana a un
// estilo inline sin `!important`. TeleprompterPage agrega esta clase al
// wrapper del contenido solo cuando `textAlign !== 'script'`, y renderiza
// esta CSS en un <style> — 'script' (el default) no agrega la clase ni la
// hoja de estilos, así que el comportamiento de siempre (cada bloque
// conserva la alineación que el editor le puso) no cambia en absoluto.
export const TEXT_ALIGN_OVERRIDE_CLASS = 'tp-force-text-align'

export function getTextAlignOverrideCss(textAlign: TextAlign): string | null {
  if (textAlign === 'script') return null
  return `.${TEXT_ALIGN_OVERRIDE_CLASS}, .${TEXT_ALIGN_OVERRIDE_CLASS} * { text-align: ${textAlign} !important; }`
}
