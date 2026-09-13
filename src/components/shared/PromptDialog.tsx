// Reemplaza window.prompt en toda la app: mismo estilo oscuro que el
// resto, con un <input> real (autoFocus, Enter para confirmar) en vez del
// cuadro nativo del navegador, que además se ve distinto en cada uno y no
// se puede estilar.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BTN_PRIMARY, FONT_DISPLAY, SURFACE_RAISED } from '../../styles/tokens'

interface PromptDialogProps {
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

export function PromptDialog({
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'Guardar',
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="presentation">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        className={`w-full max-w-sm rounded-lg border border-white/10 ${SURFACE_RAISED} p-5 shadow-xl`}
      >
        <h2 id="prompt-dialog-title" className={`${FONT_DISPLAY} text-base font-semibold text-gray-100`}>
          {title}
        </h2>
        <label className="mt-3 flex flex-col gap-1.5 text-xs text-gray-400">
          {label}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="rounded-md border border-white/10 bg-[#0f1117] px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-accent focus:outline-none"
          />
        </label>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="submit"
            disabled={!value.trim()}
            className={`w-full ${BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-white/10 px-4 py-3 text-sm text-gray-300 hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
