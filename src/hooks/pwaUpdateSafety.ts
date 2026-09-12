// F8.6 (PWA): la decisión de "¿es seguro aplicar sola una actualización del
// service worker ahora mismo?", separada en su propio archivo sin
// dependencias de React/Vite/Zustand — así se puede probar standalone (sin
// un service worker real ni un navegador), y usePwaUpdate.ts (que sí
// depende de 'virtual:pwa-register/react', un módulo que solo existe
// dentro del build de Vite) se limita a juntar los datos reales y
// preguntarle a esta función.
//
// "Seguro" = nada que perder ni interrumpir:
// - no se está en /teleprompter (ninguna variante de status: aunque esté
//   'ready'/'finished' se decidió no avisar ahí — ver UpdateBanner.tsx).
// - no se está en /editor ni /editor/:id, NI hay un guardado pendiente.
// - no hay una sesión de control remoto activa en este dispositivo.
// - no hay una lectura en curso (status 'playing'/'paused') — chequeo
//   redundante con lo de /teleprompter a propósito: cubre también el caso
//   de que el status quedara "playing" fuera de esa ruta por algún motivo.
export interface PwaUpdateSafetyInput {
  pathname: string
  playerStatus: string
  editorSaving: boolean
  remoteSessionActive: boolean
}

export function computeIsSafeToApplyUpdate({
  pathname,
  playerStatus,
  editorSaving,
  remoteSessionActive,
}: PwaUpdateSafetyInput): boolean {
  const onTeleprompterScreen = pathname.startsWith('/teleprompter')
  const onEditorScreen = pathname.startsWith('/editor')
  const isReading = playerStatus === 'playing' || playerStatus === 'paused'
  return !onTeleprompterScreen && !onEditorScreen && !editorSaving && !remoteSessionActive && !isReading
}
