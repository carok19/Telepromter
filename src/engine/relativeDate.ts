// Fecha relativa corta, sin prefijo ("Hoy" / "Ayer" / "12 nov") — la usa
// tanto la tarjeta de carpeta ("Actualizado {esto}") como la fila de guion
// dentro de una carpeta ("{esto} · 1:48 · 312 palabras", formato del
// handoff), que necesita el dato sin el prefijo "Actualizado".
export function formatRelativeDateShort(timestamp: number): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(timestamp))) / 86_400_000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  return new Date(timestamp).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

// Fecha relativa corta para tarjetas de la biblioteca ("Actualizado hoy" /
// "Actualizado ayer" / "Actualizado 12 nov") — separado de duration.ts
// porque no tiene nada que ver con palabras/velocidad, es puramente de
// presentación para el rediseño de Biblioteca & Carpetas.
export function formatRelativeDate(timestamp: number): string {
  return `Actualizado ${formatRelativeDateShort(timestamp).toLowerCase()}`
}
