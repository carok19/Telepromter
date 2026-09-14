// Identidad visual de Robress — tokens compartidos por TODA la app
// (Biblioteca, Carpeta, Editor, Configuración, Prueba de vidrio,
// Teleprompter, Control remoto): colores, tipografía, radios y
// espaciados en un solo lugar para que ninguna pantalla quede con la
// paleta o la tipografía vieja. Puramente visual: no expone lógica ni
// datos.
//
// Deliberadamente NO se usan en el contenido del teleprompter ni en el
// patrón de Prueba de vidrio — esas dos superficies siguen su propia
// tipografía/colores, controlados por la calibración del usuario (ver
// engine/calibrationEngine.ts), nunca por esta identidad de marca.
export const BG = 'bg-[#0b0c10]'

// Tarjetas: un gris apenas más claro que el fondo, con un borde muy
// sutil para separarlas sin líneas duras y una sombra apenas perceptible
// (nunca un halo) para despegarlas del fondo sin looks de "dashboard".
export const SURFACE = 'bg-[#16181d]'
export const SURFACE_HOVER = 'hover:bg-[#1b1e24]'
export const SURFACE_BORDER = 'border border-white/10'
export const SURFACE_SHADOW = 'shadow-[0_1px_3px_rgba(0,0,0,0.4)]'

// Superficies flotantes (menús, diálogos) que se apoyan sobre las
// tarjetas necesitan un tono más claro para distinguirse.
export const SURFACE_RAISED = 'bg-[#1e2128]'

export const TEXT_MUTED = 'text-[#8b8d97]'
// #7f818a en vez de un gris casi invisible: sigue leyendo como texto
// terciario (fechas, contadores secundarios) pero pasa contraste real
// contra las superficies de tarjeta (~4.5:1), no solo contra el fondo.
export const TEXT_FAINT = 'text-[#7f818a]'

// Ámbar cálido: el único acento de marca de toda la app. Reservado a
// FAB, opción/estado activo, botones de acción primaria y enlaces —
// nunca como fondo de áreas grandes. El destructivo sigue en rojo
// (Tailwind red-500/600 tal cual, sin token propio).
export const ACCENT_BG = 'bg-accent'
export const ACCENT_BG_HOVER = 'hover:bg-accent-hover'
export const ACCENT_BG_ACTIVE = 'active:bg-accent-pressed'
export const ACCENT_TEXT = 'text-accent'
export const ACCENT_SOFT_BG = 'bg-accent/15'
// Texto/íconos sobre una superficie rellena de acento.
export const ON_ACCENT = 'text-onaccent'

export const LINK = 'text-accent transition-colors hover:text-accent-hover'

// Tipografía: 'Fredoka' (redondeada, con carácter) para títulos, botones
// principales y nombres de guion/carpeta; el body font ('Inter') es el
// default global (ver index.css), así que el texto corrido y los
// metadatos no necesitan clase aparte.
export const FONT_DISPLAY = 'font-display'
// Handoff "Diseño mobile estilo Apple": títulos de pantalla grandes y con
// tracking bien negativo (32px/700/-1.1px) — antes eran mucho más chicos
// (text-xl=20px, tracking-tight="solo" -0.025em). Es un token compartido
// (Biblioteca/Carpeta/Configuración/Ayuda lo importan) a propósito: todas
// esas pantallas deben verse con el mismo peso de título, no cada una a
// mano.
export const SCREEN_TITLE = `${FONT_DISPLAY} text-[32px] font-bold tracking-[-1.1px] text-white`

// 20px (no 16px de rounded-2xl): el handoff pide "radios de 18-22px" para
// tarjetas de contenido — 20px cae justo en el medio del rango.
export const RADIUS_CARD = 'rounded-[20px]'
export const RADIUS_PILL = 'rounded-full'
export const RADIUS_MENU = 'rounded-2xl'

export const CARD_PADDING = 'p-3'
export const GRID_GAP = 'gap-3'

export const PAGE = `mx-auto flex min-h-screen w-full max-w-2xl flex-col ${BG} px-4 pt-6 pb-28 text-white`

// Antes sin borde (`border-0`, solo una sombra apenas visible) — el
// handoff dibuja el buscador con un borde sutil como cualquier otra
// tarjeta, sin sombra. El color de placeholder es un poco más oscuro que
// TEXT_MUTED a propósito: así lo pide el handoff para placeholders en
// particular, no es el mismo tono que el texto secundario del resto de la
// app.
export const SEARCH_INPUT = `h-11 w-full ${RADIUS_PILL} ${SURFACE} ${SURFACE_BORDER} pl-10 pr-4 text-base text-white placeholder:text-[#6b6b70] focus:outline-none focus:ring-2 focus:ring-accent/40`

// Grupo segmentado de ancho completo (orden, etc.): misma superficie que
// las tarjetas (antes un tono a medida, casi idéntico al fondo — el
// track quedaba invisible y solo se veía la opción activa flotando)
// para que se lea como un control agrupado, no como texto suelto. Alto
// fijo (34px) + flex para centrar, en vez de solo padding vertical: así
// coincide exactamente con la altura que pide el handoff en vez de
// depender de line-height.
export const SEGMENTED_TRACK = `grid w-full grid-cols-3 gap-1 ${RADIUS_PILL} ${SURFACE} ${SURFACE_BORDER} p-1`
export const SEGMENTED_OPTION_ACTIVE = `${FONT_DISPLAY} ${RADIUS_PILL} ${ACCENT_BG} flex h-[34px] items-center justify-center text-sm font-semibold ${ON_ACCENT}`
export const SEGMENTED_OPTION_INACTIVE = `${FONT_DISPLAY} ${RADIUS_PILL} flex h-[34px] items-center justify-center text-sm font-medium ${TEXT_MUTED} hover:text-white`

// Botón de acción primaria (Guardar, Crear, confirmar un diálogo): el
// acento cuenta acá como "donde importa" — es la misma superficie
// rellena de marca que el FAB, solo que en forma de botón normal en vez
// de circular. ACCENT_SURFACE no trae tamaño/padding propios a propósito
// — para combinarla con el padding/tamaño de texto que haga falta en
// cada botón sin arriesgar un choque de utilidades Tailwind del mismo
// grupo (dos clases `px-*` conviviendo no tienen un ganador confiable).
// BTN_PRIMARY es el tamaño por default para el caso común.
export const ACCENT_SURFACE = `${FONT_DISPLAY} rounded-md ${ACCENT_BG} ${ON_ACCENT} transition-colors ${ACCENT_BG_HOVER}`
export const BTN_PRIMARY = `${ACCENT_SURFACE} px-4 py-2.5 text-sm font-semibold`
// Misma idea que ACCENT_SURFACE pero para el botón neutro (borde sutil,
// sin relleno): tampoco trae tamaño propio.
export const NEUTRAL_SURFACE = `rounded-md ${SURFACE_BORDER} text-gray-300 transition-colors hover:bg-white/5`
export const BTN_NEUTRAL = `${NEUTRAL_SURFACE} px-4 py-2.5 text-sm`
