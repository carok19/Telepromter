import { ACCENT_BG, ACCENT_BG_HOVER, FONT_DISPLAY, ON_ACCENT, TEXT_MUTED } from '../../styles/tokens'

// Ilustración simple (carpeta + una chispa de acento) para el estado
// vacío de la Biblioteca y de una carpeta sin guiones — a propósito una
// sola ilustración reutilizada en los dos casos, ambos significan
// literalmente lo mismo: "todavía no hay nada acá".
function EmptyFolderIllustration() {
  return (
    <svg viewBox="0 0 120 100" className="h-24 w-28" aria-hidden="true">
      <path
        d="M10 30a4 4 0 0 1 4-4h21l6 8h55a4 4 0 0 1 4 4v38a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z"
        fill="none"
        stroke="#3a3d47"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M22 44h50" stroke="#2a2d34" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 56h34" stroke="#2a2d34" strokeWidth="3" strokeLinecap="round" />
      <circle cx="88" cy="24" r="13" fill="#F2A93B" />
      <path d="M88 18v12M82 24h12" stroke="#0b0c10" strokeWidth="2.75" strokeLinecap="round" />
    </svg>
  )
}

interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <EmptyFolderIllustration />
      <div className="max-w-[30ch]">
        <p className={`${FONT_DISPLAY} text-base font-semibold text-white`}>{title}</p>
        <p className={`mt-1 text-sm ${TEXT_MUTED}`}>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`${FONT_DISPLAY} mt-1 rounded-full ${ACCENT_BG} px-5 py-2.5 text-sm font-semibold ${ON_ACCENT} transition-colors ${ACCENT_BG_HOVER}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
