// Identidad visual de la CONSOLA (Teleprompter + su Control remoto — las
// dos pantallas que se usan EN PAREJA durante una grabación real). Separado
// de tokens.ts a propósito: ese archivo es la identidad de MARCA de toda la
// app (Fredoka/Inter, ver su propio comentario), que deliberadamente NO
// llega ni al contenido del Teleprompter ni a Prueba de vidrio. Esto es lo
// opuesto: una identidad de "hardware de producción" que solo viven estas
// dos pantallas de control, pensada para no parecerse al resto de la app
// (dashboard/tarjetas Tailwind genéricas) sino a una consola profesional.
export const FONT_CONSOLE = 'font-console'

// Superficie de un control de la consola: un gris carbón apenas más claro
// que el fondo casi negro de la pantalla, con borde extremadamente sutil —
// nunca el mismo tono plano de una tarjeta de la app (ver SURFACE en
// tokens.ts), que se vería como "dashboard genérico" en vez de hardware.
export const CONSOLE_SURFACE = 'border border-white/[0.08] bg-[#141519]'
export const CONSOLE_BUTTON = `flex items-center justify-center gap-1 rounded-xl ${CONSOLE_SURFACE} px-2.5 py-2.5 text-[13px] font-medium text-gray-200 transition-colors hover:bg-white/[0.06] active:bg-white/10`
// Estado "prendido" (Señal/Margen activos en el Teleprompter; el mismo
// criterio sirve acá para cualquier toggle de un solo toque): mismo ámbar
// de acento, pero como superficie tenue (15%) en vez de rellena.
export const CONSOLE_BUTTON_ACTIVE = `flex items-center justify-center gap-1 rounded-xl border border-accent/40 bg-accent/15 px-2.5 py-2.5 text-[13px] font-medium text-accent transition-colors`
