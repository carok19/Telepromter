// Diagrama de línea, simple a propósito: vista de costado de un
// teleprompter de vidrio. Muestra el camino "bueno" (la pantalla se
// refleja en el vidrio hacia la cámara) y, más tenue y punteado, el
// segundo reflejo ("fantasma") que aparece porque el vidrio tiene dos
// caras — la misma idea que explica el texto de la sección 1 de Ayuda,
// acá solo en forma de dibujo. No es a escala ni pretende serlo.
export function TeleprompterGlassDiagram() {
  return (
    <svg viewBox="0 0 300 170" className="w-full" role="img" aria-label="Esquema de costado: el celular apoyado, el vidrio inclinado en el medio, y el camino de la luz reflejándose hacia la cámara del otro lado.">
      {/* Base */}
      <line x1="15" y1="155" x2="285" y2="155" stroke="currentColor" className="text-white/15" strokeWidth="1.5" />

      {/* Celular apoyado boca arriba */}
      <rect x="30" y="138" width="64" height="14" rx="3" fill="none" stroke="currentColor" className="text-gray-400" strokeWidth="1.5" />
      <rect x="36" y="141.5" width="52" height="7" rx="1.5" className="fill-accent/70" />

      {/* Vidrio inclinado */}
      <line x1="128" y1="18" x2="210" y2="155" stroke="currentColor" className="text-white/40" strokeWidth="2" />

      {/* Cámara / ojo, del otro lado del vidrio */}
      <circle cx="255" cy="55" r="9" fill="none" stroke="currentColor" className="text-gray-400" strokeWidth="1.5" />
      <circle cx="255" cy="55" r="3" className="fill-gray-400" />

      {/* Camino bueno: pantalla -> vidrio -> cámara */}
      <path
        d="M 62 141 L 158 92 L 248 58"
        fill="none"
        stroke="currentColor"
        className="text-accent"
        strokeWidth="2"
        strokeLinecap="round"
        markerEnd="url(#glassDiagramArrow)"
      />

      {/* Segundo reflejo (fantasma): mismo origen, rebote apenas corrido,
          más tenue y punteado — nunca desaparece del todo, solo se atenúa
          con un vidrio más fino/tratado y buena luz. */}
      <path
        d="M 62 141 L 165 99 L 248 68"
        fill="none"
        stroke="currentColor"
        className="text-white/30"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        strokeLinecap="round"
      />

      <defs>
        <marker id="glassDiagramArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" className="fill-accent" />
        </marker>
      </defs>
    </svg>
  )
}
