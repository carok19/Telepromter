import { useNavigate } from 'react-router-dom'
import { FONT_DISPLAY, LINK } from '../../styles/tokens'

interface PlaceholderPageProps {
  title: string
  phase: string
}

// Rediseño de Biblioteca: al quitar el sidebar de toda la app, esta
// pantalla (usada por Configuración y Ayuda) se quedó sin ninguna forma
// propia de volver — se agrega el mismo enlace '‹ Biblioteca' que ya usa
// FolderPage, para no dejarla como una pantalla sin salida.
export function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  const navigate = useNavigate()
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <button
        type="button"
        onClick={() => navigate('/guiones')}
        className={`absolute top-4 left-4 text-sm font-medium ${LINK} hover:underline`}
      >
        ‹ Biblioteca
      </button>
      <h1 className={`${FONT_DISPLAY} text-xl font-semibold text-gray-100`}>{title}</h1>
      <p className="text-sm text-gray-500">Página en construcción — se implementa en {phase}.</p>
    </div>
  )
}
