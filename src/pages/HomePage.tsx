import { useNavigate } from 'react-router-dom'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold text-gray-100">Robress Teleprompter</h1>
      <p className="max-w-md text-sm text-gray-500">
        Fase 1 en curso: biblioteca de guiones y editor disponibles. El motor de teleprompter y el
        modo vidrio se habilitan en las fases siguientes.
      </p>
      <button
        type="button"
        onClick={() => navigate('/guiones')}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Ir a Mis guiones
      </button>
    </div>
  )
}
