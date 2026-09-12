// Saneador de estilos en línea (F8.5 — bug real reportado: pegar un guion
// desde Word/ChatGPT/WhatsApp en el editor deja `font-size` (a veces
// `font-family`/`color`/`line-height`) puesto INLINE por el navegador en
// cada bloque pegado. Un estilo inline en el propio elemento SIEMPRE le
// gana a lo heredado del ancestro — así que ese texto queda con un tamaño
// fijo para siempre, sordo a cualquier calibración (perfil, panel en vivo
// del host, o comando del remoto), exactamente el mismo mecanismo que ya
// afectaba a `text-align` antes de F8.4 parte B.
//
// Estrategia: LISTA BLANCA, no lista negra. `document.execCommand('bold'/
// 'italic')` en este editor usa <b>/<i> (etiquetas), no estilos — así que
// `text-align` (puesto por justifyLeft/Center/Right, ver EditorToolbar.tsx)
// es la ÚNICA propiedad de `style` que esta app deja a propósito. Todo lo
// demás que traiga un `style` pegado desde afuera se descarta sin excepción
// — más seguro que tratar de enumerar cada propiedad "peligrosa" conocida
// (font-size, font-family, color, line-height, los mso-* de Word, etc.),
// que dejaría pasar cualquiera que no se nos ocurriera.
//
// Nunca toca `class` ni atributos `data-*`: los marcadores de pausa/nota
// (ver markers.ts) se identifican por esas dos cosas, nunca por `style`,
// así que siguen pausando el desplazamiento después de sanear.
const ALLOWED_STYLE_PROPERTIES = ['text-align']

function sanitizeElementStyle(el: HTMLElement): void {
  if (!el.hasAttribute('style')) return
  const kept = ALLOWED_STYLE_PROPERTIES.map((prop) => {
    const value = el.style.getPropertyValue(prop)
    return value ? `${prop}: ${value}` : null
  }).filter((declaration): declaration is string => declaration !== null)

  if (kept.length > 0) {
    el.setAttribute('style', kept.join('; '))
  } else {
    el.removeAttribute('style')
  }
}

// Se usa en dos momentos (F8.5):
// 1) Al pegar en el editor (EditorCanvas.tsx) — para que lo que se GUARDA
//    en Dexie ya nazca limpio.
// 2) Al renderizar en TeleprompterPage — para que un guion pegado ANTES de
//    este arreglo (ya guardado con estilos alienígenas) también se vea
//    bien, sin reescribir nada en Dexie ni pedirle al usuario que lo vuelva
//    a pegar.
// Ambos casos llaman a la MISMA función: un solo lugar con la lista
// blanca, no dos implementaciones que puedan divergir.
export function sanitizeContentHtml(html: string): string {
  if (!html) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.body.querySelectorAll<HTMLElement>('[style]').forEach(sanitizeElementStyle)
  return doc.body.innerHTML
}
