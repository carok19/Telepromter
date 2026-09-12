// Menú desplegable reutilizado por FolderTabs (⋮ de carpeta) y ScriptCard
// (⋮ de guion, incluida su lista "Mover a..."). Historia del bug que este
// hook existe para resolver:
//
// v1: cada uno reimplementaba su propio "cerrar al hacer click afuera" con
// un simple listener de document, con el menú posicionado `absolute`
// dentro del propio botón — sin ninguna noción de dónde queda la
// pantalla, así que podía quedar fuera del viewport.
//
// v2 (esta versión): agregó cálculo de arriba/abajo contra el espacio
// real, pero SEGUÍA con `position: absolute` — en FolderTabs, ese absolute
// vive DENTRO de la fila de chips, que tiene `overflow-x-auto` (necesario
// para el scroll lateral). CSS: overflow-x distinto de 'visible' hace que
// overflow-y se compute también a 'auto', así que ese contenedor recorta
// cualquier hijo posicionado que se salga verticalmente — el cálculo de
// arriba/abajo daba bien, pero el menú igual quedaba cortado por el
// ancestro. Cualquier ancestro con overflow no-visible puede recortar un
// `absolute`, no solo el padre inmediato.
//
// v3: el menú se renderiza en un PORTAL a document.body con
// `position: fixed`, calculado desde getBoundingClientRect() del botón —
// así escapa de CUALQUIER ancestro con overflow, sin importar cuál sea.
// `position: fixed` usa coordenadas de viewport directamente (no hace
// falta sumar scrollX/scrollY como con `absolute` sobre body). Como ya no
// se mueve con el contenedor que lo abrió, se cierra ante cualquier
// scroll (de la fila de chips o de cualquier otro contenedor — por eso el
// listener va en fase de captura) o resize, en vez de tratar de
// reposicionarlo en cada evento.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface DropdownMenuPosition {
  top: number | null
  bottom: number | null
  left: number
}

const VIEWPORT_MARGIN_PX = 8

export function useDropdownMenu<T extends HTMLElement = HTMLDivElement>(
  align: 'left' | 'right' = 'left',
  remeasureKey: unknown = null,
) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<DropdownMenuPosition>({ top: 0, bottom: null, left: 0 })
  const anchorRef = useRef<T>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function close() {
    setOpen(false)
  }

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor) return
    const anchorRect = anchor.getBoundingClientRect()
    const menuRect = menu?.getBoundingClientRect()
    const menuHeight = menuRect?.height ?? 0
    const menuWidth = menuRect?.width ?? 0
    const spaceBelow = window.innerHeight - anchorRect.bottom
    const spaceAbove = anchorRect.top
    // Solo se abre hacia arriba si abajo no entra Y arriba hay más lugar —
    // así un menú que tampoco entraría arriba (pantalla muy baja) se queda
    // abierto hacia abajo, que sigue siendo scrolleable, en vez de
    // "mejorar" hacia un lado que en realidad no ayuda.
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow
    const rawLeft = align === 'right' ? anchorRect.right - menuWidth : anchorRect.left
    const clampedLeft = Math.min(
      Math.max(rawLeft, VIEWPORT_MARGIN_PX),
      window.innerWidth - menuWidth - VIEWPORT_MARGIN_PX,
    )
    setPosition({
      top: openUpward ? null : anchorRect.bottom,
      bottom: openUpward ? window.innerHeight - anchorRect.top : null,
      left: clampedLeft,
    })
  }, [open, align, remeasureKey])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      // El menú vive en un portal (document.body), fuera del subárbol DOM
      // del ancla — sin este chequeo aparte, cualquier click DENTRO del
      // propio menú se leería como "afuera" y lo cerraría antes de que el
      // botón clickeado llegue a ejecutar su propio onClick.
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    function handleScrollOrResize() {
      close()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    // capture:true en 'scroll' — el scroll de un contenedor interno (como
    // la fila de chips) no burbujea como evento normal, así que hay que
    // escucharlo en la fase de captura para enterarse igual.
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  return { open, setOpen, position, anchorRef, menuRef }
}
