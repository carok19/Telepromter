// El contenido de un guion se renderiza usando exactamente el mismo HTML que
// produjo el editor (ver EditorCanvas) — no se reconstruye una lista de
// "líneas" para mostrarlo, así que el riesgo señalado en la auditoría previa
// a Fase 2 (perder texto suelto al recorrer solo `.children`) no aplica a la
// parte visual: el navegador dibuja el HTML tal cual, con o sin wrapper de
// bloque. Tampoco aplica al conteo de palabras, que ya usa `duration.ts`
// (DOMParser + textContent, que incluye todo el texto sin importar si está
// anidado o suelto bajo la raíz).
//
// Lo único que sí requiere leer el DOM ya montado (no un HTML sin renderizar)
// es ubicar los marcadores de pausa con su posición real en pantalla —
// `offsetTop` depende del layout, que no existe hasta que el contenido está
// en el documento. Por eso esta función usa `querySelectorAll`, que recorre
// todo el árbol sin importar si el marcador quedó como hijo directo de la
// raíz (texto suelto antes del primer bloque) o anidado dentro de un
// <div>/<p>/<h2>: nunca se asume "cada hijo de la raíz es una línea".

import { AUTO_PAUSE_ATTR, PAUSE_MARKER_CLASS } from './markers'

export interface PauseCheckpoint {
  element: HTMLElement
  autoPause: boolean
  offsetTop: number
}

export function findPauseCheckpoints(container: HTMLElement): PauseCheckpoint[] {
  const markers = container.querySelectorAll<HTMLElement>(`.${PAUSE_MARKER_CLASS}`)
  return Array.from(markers).map((element) => ({
    element,
    autoPause: element.getAttribute(AUTO_PAUSE_ATTR) === 'true',
    offsetTop: element.offsetTop,
  }))
}
