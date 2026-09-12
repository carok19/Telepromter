// Fecha relativa corta para tarjetas de la biblioteca ("Actualizado hoy" /
// "Actualizado ayer" / "Actualizado 12 nov") — separado de duration.ts
// porque no tiene nada que ver con palabras/velocidad, es puramente de
// presentación para el rediseño de Biblioteca & Carpetas.
export function formatRelativeDate(timestamp: number): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(timestamp))) / 86_400_000)
  if (diffDays === 0) return 'Actualizado hoy'
  if (diffDays === 1) return 'Actualizado ayer'
  return `Actualizado ${new Date(timestamp).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
}
