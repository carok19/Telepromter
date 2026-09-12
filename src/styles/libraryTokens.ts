// Tokens visuales compartidos entre LibraryPage (Nivel 1) y FolderPage
// (Nivel 2) — mismos colores, radios, espaciados y tamaños de texto en las
// dos pantallas para que no se vean como dos diseños distintos. Puramente
// visual: no expone nada de lógica ni de datos.
export const LIB_BG = 'bg-[#0b0c10]'

// Tarjetas: un gris apenas más claro que el fondo, sin borde visible.
export const LIB_SURFACE = 'bg-[#16181d]'
export const LIB_SURFACE_HOVER = 'hover:bg-[#1b1e24]'

// Superficies flotantes (menús, diálogos) que se apoyan sobre las tarjetas
// necesitan un tono más un poco más claro para distinguirse sin borde.
export const LIB_SURFACE_RAISED = 'bg-[#1e2128]'

export const LIB_TEXT_MUTED = 'text-[#8b8d97]'
export const LIB_TEXT_FAINT = 'text-[#5f616b]'

// Único azul de acento de toda la Biblioteca, reservado al FAB.
export const LIB_ACCENT_BG = 'bg-blue-600'
export const LIB_ACCENT_BG_HOVER = 'hover:bg-blue-500'

export const LIB_RADIUS_CARD = 'rounded-[22px]'
export const LIB_RADIUS_PILL = 'rounded-full'
export const LIB_RADIUS_MENU = 'rounded-2xl'

export const LIB_CARD_PADDING = 'p-4'
export const LIB_GRID_GAP = 'gap-3.5'

export const LIB_TITLE = 'text-[28px] font-bold tracking-tight text-white'
export const LIB_PAGE = `mx-auto flex min-h-screen w-full max-w-2xl flex-col ${LIB_BG} px-4 pt-6 pb-28 text-white`

export const LIB_SEARCH_INPUT = `w-full ${LIB_RADIUS_PILL} border-0 ${LIB_SURFACE} py-3 pl-11 pr-4 text-[15px] text-white placeholder:${LIB_TEXT_MUTED} focus:outline-none focus:ring-2 focus:ring-white/10`

export const LIB_SORT_SELECT = `appearance-none border-0 bg-transparent py-1 pr-5 text-[13px] font-medium ${LIB_TEXT_MUTED} focus:outline-none`
