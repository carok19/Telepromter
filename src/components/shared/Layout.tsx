import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'

const navItems = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/guiones', label: 'Mis guiones' },
  { to: '/editor', label: 'Editor' },
  { to: '/glass-test', label: 'Prueba de vidrio' },
  { to: '/configuracion', label: 'Configuración' },
  { to: '/ayuda', label: 'Ayuda' },
]

// Umbral B3: en celular (debajo de `md`, 768px) el sidebar fijo de 240px
// dejaba menos de 1/3 del ancho para el contenido — en tablet (~768px) y
// PC ya se veía bien, así que el corte es acá, no en `lg` (1024px), para
// no cambiarle nada al rango que el usuario confirmó que ya andaba OK.
// TeleprompterPage/RemoteControlPage viven fuera de Layout (ver
// router.tsx) y no pasan por acá — esto no les cambia nada.
export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#0b0c10] text-gray-100">
      {/* Barra superior solo en celular: botón de menú + logo chico. En
          `md` y más grande queda oculta — el sidebar ya está siempre
          visible ahí, como antes. */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#0f1117] px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 text-xl leading-none text-gray-300 hover:bg-white/5"
        >
          ☰
        </button>
        <Logo showWordmark={false} />
      </div>

      {/* Fondo oscuro detrás del panel en celular: tocar afuera cierra el
          menú. Sin esto en `md`+ porque ahí el sidebar no es un panel
          flotante, es parte del layout de siempre. */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col gap-6 border-r border-white/10 bg-[#0f1117] p-4 transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : ''
        }`}
      >
        <Logo />
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
