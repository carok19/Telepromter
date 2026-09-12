// Extrae texto plano legible de un HTML de guion, recortado — usado tanto
// por ScriptCard (vista previa de cada tarjeta) como por el aviso de
// "Borradores sin guardar" en Mis guiones (para poder distinguir dos
// borradores sin título por su contenido).
export function extractTextPreview(html: string, maxLength = 140): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = doc.body.textContent?.trim() ?? ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
