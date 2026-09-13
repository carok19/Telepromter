// Reemplaza window.confirm en toda la app: mismo estilo oscuro que el
// resto (fondo #15171e, bordes white/10), botones grandes apilados
// (fáciles de tocar en celular, a diferencia de los dos chiquitos de un
// confirm() nativo), y admite más de dos acciones — lo necesita el borrado
// de carpetas (Cancelar / Mover a "Sin carpeta" / Eliminar todo).
import { useEffect } from 'react'
import { ACCENT_BG, ACCENT_BG_HOVER, FONT_DISPLAY, ON_ACCENT, SURFACE_RAISED } from '../../styles/tokens'

export interface ConfirmDialogAction {
  label: string
  onClick: () => void
  // 'danger': acción destructiva (rojo, para diferenciarla claramente —
  // pedido explícito del arreglo de borrado de carpetas). 'primary': la
  // acción esperable/segura. 'neutral': Cancelar y alternativas neutras.
  variant: 'primary' | 'danger' | 'neutral'
}

interface ConfirmDialogProps {
  title: string
  message: string
  actions: ConfirmDialogAction[]
  onClose: () => void
}

const VARIANT_CLASSES: Record<ConfirmDialogAction['variant'], string> = {
  primary: `${FONT_DISPLAY} ${ACCENT_BG} ${ON_ACCENT} ${ACCENT_BG_HOVER}`,
  danger: `${FONT_DISPLAY} bg-red-600 text-white hover:bg-red-500`,
  neutral: 'border border-white/10 text-gray-300 hover:bg-white/5',
}

export function ConfirmDialog({ title, message, actions, onClose }: ConfirmDialogProps) {
  // Escape cierra (equivalente a Cancelar) — mismo criterio que se le pidió
  // a los menús desplegables de carpeta/guion.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={`w-full max-w-sm rounded-lg border border-white/10 ${SURFACE_RAISED} p-5 shadow-xl`}
      >
        <h2 id="confirm-dialog-title" className={`${FONT_DISPLAY} text-base font-semibold text-gray-100`}>
          {title}
        </h2>
        <p className="mt-2 text-sm text-gray-400">{message}</p>
        <div className="mt-5 flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`w-full rounded-md px-4 py-3 text-sm font-medium transition-colors ${VARIANT_CLASSES[action.variant]}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
