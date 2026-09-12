// Rediseño de Biblioteca: se quita el sidebar (y el ☰ que lo abría en
// celular) de TODA la app — cada pantalla bajo esta rama del router ahora
// se encarga de su propia cabecera (Biblioteca Nivel 1: logo + engranaje;
// Nivel 2: '‹ Biblioteca' + menú de la carpeta; Editor ya tenía la suya).
// El <main> flex-1 se conserva tal cual estaba (antes al lado del sidebar)
// precisamente para que las páginas que dependen de una altura real vía
// `h-full` (EditorPage, GlassTestPage) seudo-hereden lo mismo que antes —
// sin este flex-1 wrapper, un <div min-h-screen> sin más no le da a sus
// hijos ninguna altura definida de la cual heredar `height:100%`.
import { Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0c10] text-gray-100">
      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
