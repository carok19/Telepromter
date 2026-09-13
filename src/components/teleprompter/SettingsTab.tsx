// Pestaña con forma de flecha, pegada al borde DERECHO de la pantalla,
// reemplazo del botón "Ajustes" del footer (el borde izquierdo lo ocupa el
// indicador de Señal, ver SignalIndicator). A diferencia del resto de los
// controles de reproducción, NUNCA pasa de oculta a visible — está siempre
// ahí — por eso no necesita el delay de toque fantasma de 350ms que sí
// protege al contenido del cajón que despliega (ver SettingsDrawer): un
// elemento que nunca aparece de golpe no puede sufrir el problema que ese
// delay evita.
//
// Discreta a propósito (opacidad y contraste bajos, para minimizar cuánto
// se refleja en el vidrio) pero con una zona de toque de sobra (44px de
// alto) para que siga siendo fácil de tocar.
//
// z-index más alto que el propio cajón: así, aunque el cajón esté abierto y
// cubra ese borde, la pestaña sigue tocable en el mismo lugar para cerrarlo
// — "volver a tocarla la cierra" funciona sin lógica extra.
interface SettingsTabProps {
  open: boolean
  onClick: () => void
  hidden?: boolean
}

export function SettingsTab({ open, onClick, hidden = false }: SettingsTabProps) {
  if (hidden) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Cerrar ajustes' : 'Abrir ajustes'}
      aria-expanded={open}
      data-testid="settings-tab"
      className="absolute top-1/2 right-0 z-40 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-white/10 bg-white/5 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
    >
      <span aria-hidden="true" className="text-xs">
        {open ? '›' : '‹'}
      </span>
    </button>
  )
}
