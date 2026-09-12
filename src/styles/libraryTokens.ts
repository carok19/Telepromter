// Tokens visuales compartidos entre LibraryPage (Nivel 1) y FolderPage
// (Nivel 2) — mismos colores, radios, espaciados y tamaños de texto en las
// dos pantallas para que no se vean como dos diseños distintos. Puramente
// visual: no expone nada de lógica ni de datos.
export const LIB_BG = 'bg-[#0b0c10]'

// Tarjetas: un gris apenas más claro que el fondo, con un borde muy sutil
// para separarlas del fondo sin líneas duras.
export const LIB_SURFACE = 'bg-[#16181d]'
export const LIB_SURFACE_HOVER = 'hover:bg-[#1b1e24]'
export const LIB_CARD_BORDER = 'border border-white/10'

// Superficies flotantes (menús, diálogos) que se apoyan sobre las tarjetas
// necesitan un tono más un poco más claro para distinguirse sin borde.
export const LIB_SURFACE_RAISED = 'bg-[#1e2128]'

export const LIB_TEXT_MUTED = 'text-[#8b8d97]'
export const LIB_TEXT_FAINT = 'text-[#5f616b]'

// Único azul de acento reservado al FAB (más el ícono de carpeta, que ya
// era azul en la referencia visual antes del rediseño).
export const LIB_ACCENT_BG = 'bg-blue-600'
export const LIB_ACCENT_BG_HOVER = 'hover:bg-blue-500'

export const LIB_RADIUS_CARD = 'rounded-2xl'
export const LIB_RADIUS_PILL = 'rounded-full'
export const LIB_RADIUS_MENU = 'rounded-2xl'

export const LIB_CARD_PADDING = 'p-3'
export const LIB_GRID_GAP = 'gap-3'

export const LIB_TITLE = 'text-xl font-bold tracking-tight text-white'
export const LIB_PAGE = `mx-auto flex min-h-screen w-full max-w-2xl flex-col ${LIB_BG} px-4 pt-6 pb-28 text-white`

export const LIB_SEARCH_INPUT = `w-full ${LIB_RADIUS_PILL} border-0 ${LIB_SURFACE} py-2.5 pl-9 pr-4 text-sm text-white placeholder:${LIB_TEXT_MUTED} focus:outline-none focus:ring-2 focus:ring-white/10`

// Grupo segmentado de orden (Reciente / A-Z / Por fecha): ancho completo,
// fondo gris oscuro, opción activa resaltada con una superficie más clara.
export const LIB_SEGMENTED_TRACK = `grid w-full grid-cols-3 gap-1 ${LIB_RADIUS_PILL} bg-[#111318] p-1`
export const LIB_SEGMENTED_OPTION_ACTIVE = `rounded-full bg-[#2a2d36] py-1.5 text-[13px] font-medium text-white`
export const LIB_SEGMENTED_OPTION_INACTIVE = `rounded-full py-1.5 text-[13px] font-medium ${LIB_TEXT_MUTED} hover:text-white`
