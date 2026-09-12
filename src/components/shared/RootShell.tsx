// F8.6 (PWA): capa fina por encima de TODAS las rutas (Layout, /remote y
// /teleprompter son hermanas entre sí — ver router.tsx) para poder montar
// <UpdateBanner /> una sola vez con acceso a useLocation(), sin duplicarlo
// en cada rama del router ni tocar Layout.tsx.
import { Outlet } from 'react-router-dom'
import { UpdateBanner } from './UpdateBanner'

export function RootShell() {
  return (
    <>
      <Outlet />
      <UpdateBanner />
    </>
  )
}
