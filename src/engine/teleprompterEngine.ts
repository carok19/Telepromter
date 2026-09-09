// TeleprompterEngine — motor de desplazamiento (posición, velocidad, play/pause/seek).
// Independiente de la UI. Se implementa en Fase 2.
//
// NOTA para el parser de contenido (auditoría previa a Fase 2):
// El HTML que produce EditorCanvas (vía document.execCommand) NO garantiza
// que cada "línea" sea un elemento HTML hijo directo de la raíz. Se confirmó
// empíricamente que la raíz puede mezclar, como hermanos directos:
//   - nodos de texto sueltos (p. ej. la primera línea, antes de un Enter),
//   - elementos en línea (<b>, <i>, los <span> de marcadores),
//   - elementos de bloque (<div> — separador de párrafo por defecto en
//     Chromium — <p>, <h1>/<h2>, etc.; el separador de bloque puede variar
//     entre navegadores).
// El parser NO debe recorrer solo `.children` (omite nodos de texto sueltos
// silenciosamente); debe usar `.childNodes` (o una estrategia equivalente
// que no pierda texto suelto) y agrupar el contenido no envuelto en un
// párrafo implícito antes del primer bloque real. También debe identificar
// los marcadores por sus atributos (`[data-marker="pause"]` con
// `data-auto-pause`, y `[data-marker="note"]`) en vez de depender de su
// posición o de qué elemento los envuelve.
export {}
