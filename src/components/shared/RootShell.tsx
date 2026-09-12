// F8.6 (PWA): capa fina por encima de TODAS las rutas (Layout, /remote y
// /teleprompter son hermanas entre sí — ver router.tsx) para poder montar
// <UpdateBanner /> una sola vez con acceso a useLocation(), sin duplicarlo
// en cada rama del router ni tocar Layout.tsx.
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useRemoteStore } from '../../stores/remoteStore'
import { UpdateBanner } from './UpdateBanner'

// B.1: TeleprompterPage persiste `hostSessionId` en remoteStore (no en su
// propio estado) precisamente para que emparejar sobreviva un cambio de
// guion, que pasa por /guiones (ruta hermana de /teleprompter — ver
// router.tsx) y por lo tanto desmonta TeleprompterPage por completo.
// ¿Quién decide entonces cuándo esa sesión quedó abandonada de verdad, ya
// que TeleprompterPage no está para decirlo? Acá, que envuelve TODAS las
// rutas y por lo tanto sigue viva mientras dure la pestaña: si hay una
// hostSessionId activa y el usuario navega a una pantalla que NO es
// /teleprompter ni /guiones, se la trata como abandonada y se cierra. Esas
// dos rutas quedan exceptuadas porque son, juntas, el camino normal para
// "cambiar de guion" (Volver → Mis guiones → abrir otro) — cerrar la
// sesión justo ahí sería el mismo bug que esta fase vino a arreglar.
function useEndAbandonedHostSession() {
  const location = useLocation()
  const endSession = useRemoteStore((s) => s.endSession)
  const setHostSessionId = useRemoteStore((s) => s.setHostSessionId)

  useEffect(() => {
    if (location.pathname.startsWith('/teleprompter') || location.pathname.startsWith('/guiones')) return
    const hostSessionId = useRemoteStore.getState().hostSessionId
    if (!hostSessionId) return
    setHostSessionId(null)
    void endSession(hostSessionId)
  }, [location.pathname, endSession, setHostSessionId])
}

export function RootShell() {
  useEndAbandonedHostSession()
  return (
    <>
      <Outlet />
      <UpdateBanner />
    </>
  )
}
