import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'

const navItems = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/guiones', label: 'Mis guiones' },
  { to: '/editor', label: 'Editor' },
  { to: '/prueba-de-vidrio', label: 'Prueba de vidrio' },
  { to: '/configuracion', label: 'Configuración' },
  { to: '/ayuda', label: 'Ayuda' },
]

export function Layout() {
  return (
    <div className="flex min-h-screen bg-[#0b0c10] text-gray-100">
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-white/10 bg-[#0f1117] p-4">
        <Logo />
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
