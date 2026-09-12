// Menú desplegable reutilizado por FolderTabs (⋮ de carpeta) y ScriptCard
// (⋮ de guion, incluida su lista "Mover a..."). Antes cada uno reimplementaba
// su propio "cerrar al hacer click afuera" con un simple listener de
// document, sin ninguna noción de dónde queda la pantalla — el bug
// reportado era justo ese: el menú se abría siempre hacia abajo y podía
// quedar fuera del viewport, obligando a hacer scroll para verlo.
//
// Este hook agrega lo que faltaba:
// - Medir el menú YA RENDERIDO (con useLayoutEffect, antes de pintar, para
//   que el usuario nunca vea el salto) contra el espacio real disponible
//   arriba/abajo del botón que lo abre, y decidir `openUpward` en
//   consecuencia — nunca asume una altura fija.
// - Cerrar con Escape además de con un click/touch afuera.
//
// `remeasureKey` es para el caso de ScriptCard: su menú cambia de
// contenido (menú principal <-> lista "Mover a...") sin cerrarse, así que
// hay que volver a medir cuando ese contenido cambia, no solo al abrir.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useDropdownMenu<T extends HTMLElement = HTMLDivElement>(remeasureKey: unknown = null) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const anchorRef = useRef<T>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return
    const anchorRect = anchor.getBoundingClientRect()
    const menuHeight = menu.getBoundingClientRect().height
    const spaceBelow = window.innerHeight - anchorRect.bottom
    const spaceAbove = anchorRect.top
    // Solo se abre hacia arriba si abajo no entra Y arriba hay más lugar —
    // así un menú que tampoco entraría arriba (pantalla muy baja) se queda
    // abierto hacia abajo, que sigue siendo scrolleable, en vez de
    // "mejorar" hacia un lado que en realidad no ayuda.
    setOpenUpward(spaceBelow < menuHeight && spaceAbove > spaceBelow)
  }, [open, remeasureKey])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return { open, setOpen, openUpward, anchorRef, menuRef }
}
