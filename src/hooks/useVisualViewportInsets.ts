// Los diálogos modales (PromptDialog, ConfirmDialog, FolderPickerDialog,
// PairingModal) necesitan saber cuánto de la pantalla queda realmente
// visible cuando el teclado en pantalla de un celular está abierto.
//
// `100dvh`/`100vh` NO sirven para esto: en iOS Safari el layout viewport
// (contra el que se miden `fixed inset-0`, `dvh`, etc.) no se achica
// cuando aparece el teclado — el teclado se dibuja ENCIMA, tapando la
// parte de abajo sin que el CSS se entere. Android/Chrome tampoco lo
// achica por defecto (haría falta `interactive-widget=resizes-content`
// en el meta viewport, que esta app no usa). El resultado sin este hook:
// un modal `fixed inset-0 flex items-center justify-center` se centra
// contra la altura COMPLETA (como si no hubiera teclado), así que puede
// terminar centrado detrás del teclado.
//
// `window.visualViewport` sí referencia el área visible real (excluyendo
// el teclado) y dispara 'resize'/'scroll' cuando cambia. Con `top`/
// `height` de acá aplicados como `style` inline sobre el contenedor
// `fixed` del modal (en vez de `inset-0`), el modal se recorta y centra
// contra el área que el usuario efectivamente ve.
import { useEffect, useState } from 'react'

interface VisualViewportInsets {
  top: number
  height: number
}

function readInsets(): VisualViewportInsets {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) return { top: 0, height: typeof window !== 'undefined' ? window.innerHeight : 0 }
  return { top: vv.offsetTop, height: vv.height }
}

export function useVisualViewportInsets(): VisualViewportInsets {
  const [insets, setInsets] = useState(readInsets)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function update() {
      setInsets(readInsets())
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return insets
}
