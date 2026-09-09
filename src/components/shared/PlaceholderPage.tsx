interface PlaceholderPageProps {
  title: string
  phase: string
}

export function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-100">{title}</h1>
      <p className="text-sm text-gray-500">Página en construcción — se implementa en {phase}.</p>
    </div>
  )
}
