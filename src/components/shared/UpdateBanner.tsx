// F8.6 (PWA) — aviso de "hay una versión nueva" para cuando NO es seguro
// aplicarla sola todavía (ver usePwaUpdate.ts: mientras se lee, se edita
// con un guardado pendiente, o hay un control remoto emparejado). Una vez
// que se vuelve seguro, se aplica sola y este banner nunca llega a
// mostrarse para esa actualización.
//
// A PROPÓSITO nunca se muestra en TeleprompterPage (ver el chequeo de ruta
// más abajo) — decisión F8.6 punto 3, opción (b) en vez de (a):
// TeleprompterPage existe para mostrar SOLO el texto detrás del vidrio (la
// fase "pantalla limpia" ya escondió header/footer con este mismo
// propósito); meter un aviso de actualización ahí — aunque respetara el
// ocultado automático y el retraso de toque fantasma — reintroduce
// exactamente el tipo de UI que esa fase eliminó. Como la actualización YA
// se pospone mientras se lee (usePwaUpdate ya cubre eso con isSafeToApply),
// no hay ningún apuro: se aplica sola apenas el usuario sale de esa
// pantalla, sin haber mostrado nunca nada ahí.
import { useLocation } from 'react-router-dom'
import { usePwaUpdate } from '../../hooks/usePwaUpdate'
import { ACCENT_BG, ACCENT_BG_HOVER, FONT_DISPLAY, ON_ACCENT } from '../../styles/tokens'

export function UpdateBanner() {
  const { needRefresh, isSafeToApply, applyNow } = usePwaUpdate()
  const location = useLocation()

  if (location.pathname.startsWith('/teleprompter')) return null
  if (!needRefresh || isSafeToApply) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-3 border-t border-accent/30 bg-[#0f1117] px-4 py-3 text-sm text-gray-200 shadow-lg">
      <span>Hay una actualización disponible. Se va a aplicar sola apenas termines.</span>
      <button
        type="button"
        onClick={applyNow}
        className={`shrink-0 rounded-md ${ACCENT_BG} px-3 py-1.5 text-xs font-medium ${ON_ACCENT} ${ACCENT_BG_HOVER} ${FONT_DISPLAY}`}
      >
        Actualizar ahora
      </button>
    </div>
  )
}
