// TeleprompterEngine — motor de desplazamiento (posición, velocidad, play/pause/seek).
// Independiente de la UI: no conoce React ni Zustand, solo el DOM que se le
// entrega en attach() y una lista de listeners a los que notifica cambios de
// estado. La animación se hace mutando `style.transform` directamente sobre
// el elemento de contenido en cada frame de requestAnimationFrame — nunca a
// través de un render de React — para que el desplazamiento no dependa de la
// velocidad de re-render de la UI.
//
// NOTA para el parser de contenido (auditoría previa a Fase 2):
// El HTML que produce EditorCanvas (vía document.execCommand) NO garantiza
// que cada "línea" sea un elemento HTML hijo directo de la raíz. Se confirmó
// empíricamente que la raíz puede mezclar, como hermanos directos:
//   - nodos de texto sueltos (p. ej. la primera línea, antes de un Enter),
//   - elementos en línea (<b>, <i>, los <span> de marcadores),
//   - elementos de bloque (<div> — separador de párrafo por defecto en
//     Chromium — <p>, <h1>/<h2>, etc.; el separador de bloque puede variar
//     entre navegadores).
// Este motor nunca recorre `.children` para interpretar el guion: el
// contenido se muestra renderizando el HTML tal cual (el navegador ya sabe
// dibujar esa mezcla correctamente) y los marcadores se ubican con
// `querySelectorAll` (ver contentParser.ts), que también es inmune a este
// problema. Ver contentParser.ts para el detalle.

import { findPauseCheckpoints, type PauseCheckpoint } from './contentParser'
import { DEFAULT_WPM, estimateDurationSeconds } from './duration'

export type TeleprompterStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'finished'

export interface TeleprompterSnapshot {
  status: TeleprompterStatus
  progress: number
  positionPx: number
  totalPx: number
  wpm: number
  pausedByMarker: boolean
}

type Listener = (snapshot: TeleprompterSnapshot) => void

// Fracción del alto del viewport que actúa como "línea de lectura" donde se
// dispara una pausa automática. Todavía no existe un punto de lectura
// configurable (llegará en una fase posterior); se usa el centro vertical
// del área visible como valor por defecto razonable.
const READING_LINE_FRACTION = 0.5

// Umbral mínimo entre notificaciones a los suscriptores mientras se
// reproduce, para no disparar un render de React en cada frame de rAF.
const EMIT_THROTTLE_MS = 120

export class TeleprompterEngine {
  private status: TeleprompterStatus = 'idle'
  private positionPx = 0
  private totalPx = 0
  private pxPerSecond = 0
  private wpm = DEFAULT_WPM
  private totalWords = 0
  private readingLinePx = 0

  private viewportEl: HTMLElement | null = null
  private contentEl: HTMLElement | null = null
  private checkpoints: PauseCheckpoint[] = []
  private triggeredMarkers = new Set<Element>()
  private pausedByMarker = false

  private rafId: number | null = null
  private lastFrameTime: number | null = null
  private listeners = new Set<Listener>()
  private lastEmitAt = 0

  attach(viewportEl: HTMLElement, contentEl: HTMLElement, totalWords: number) {
    this.viewportEl = viewportEl
    this.contentEl = contentEl
    this.totalWords = totalWords
    this.status = 'ready'
    this.recalculateGeometry()
    this.emit(true)
  }

  detach() {
    this.stopLoop()
    this.viewportEl = null
    this.contentEl = null
    this.listeners.clear()
  }

  // Vuelve a medir el DOM (alto total desplazable y posición de cada
  // marcador). Se llama al conectar el motor y ante un resize (p. ej. al
  // rotar el celular), ya que un reflujo del texto puede cambiar dónde cae
  // verticalmente cada marcador.
  recalculateGeometry() {
    if (!this.viewportEl || !this.contentEl) return
    this.totalPx = Math.max(0, this.contentEl.scrollHeight - this.viewportEl.clientHeight)
    this.readingLinePx = this.viewportEl.clientHeight * READING_LINE_FRACTION
    this.checkpoints = findPauseCheckpoints(this.contentEl)
    this.recalcSpeed()
    this.positionPx = Math.min(this.positionPx, this.totalPx)
    this.applyTransform()
  }

  setSpeed(wpm: number) {
    this.wpm = Math.max(1, wpm)
    this.recalcSpeed()
    this.emit(true)
  }

  getSpeed(): number {
    return this.wpm
  }

  // La velocidad se expresa en palabras por minuto (PPM/WPM), la misma
  // unidad que usa duration.ts para la duración estimada del editor. Se
  // convierte a píxeles/segundo dividiendo el alto total desplazable por la
  // duración estimada a esa velocidad — así "130 PPM" significa lo mismo en
  // el editor y en el teleprompter.
  private recalcSpeed() {
    const seconds = estimateDurationSeconds(this.totalWords, this.wpm)
    this.pxPerSecond = seconds > 0 ? this.totalPx / seconds : 0
  }

  play() {
    if (this.status === 'idle' || this.status === 'playing') return
    if (this.status === 'finished') this.resetInternal()
    if (this.totalPx <= 0) {
      // Nada que desplazar (guion muy corto o vacío): no tiene sentido
      // arrancar un bucle que nunca avanzaría.
      this.status = 'finished'
      this.emit(true)
      return
    }
    this.status = 'playing'
    this.pausedByMarker = false
    this.lastFrameTime = null
    this.startLoop()
    this.emit(true)
  }

  pause() {
    if (this.status !== 'playing') return
    this.status = 'paused'
    this.pausedByMarker = false
    this.stopLoop()
    this.emit(true)
  }

  togglePlay() {
    if (this.status === 'playing') this.pause()
    else this.play()
  }

  reset() {
    this.resetInternal()
    this.emit(true)
  }

  private resetInternal() {
    this.stopLoop()
    this.positionPx = 0
    this.triggeredMarkers.clear()
    this.pausedByMarker = false
    this.status = 'ready'
    this.applyTransform()
  }

  // F8.4 — usado por el comando remoto de avanzar/retroceder (siempre vía
  // seekToProgress, nunca con píxeles cruzando la red). Dos correcciones
  // necesarias para que un salto se comporte como el usuario espera, no
  // solo como "mover la posición":
  //
  // 1) Si el estado es 'finished' y el salto deja la posición antes del
  //    final, hay que pasar a 'paused'. Si no, play() vería 'finished' y
  //    llamaría a resetInternal() (reiniciar al inicio) en vez de
  //    continuar desde donde acaba de retroceder el usuario.
  // 2) Un salto hacia atrás puede dejar "por delante" (en o después de la
  //    nueva posición) un marcador de pausa que ya se había disparado
  //    antes de llegar al final. Sin limpiar `triggeredMarkers`, ese
  //    marcador quedaría marcado como "ya visto" para siempre y
  //    `findCrossedCheckpoint` nunca volvería a pausar ahí al releerlo —
  //    aunque visualmente el usuario está viendo el texto por primera vez
  //    otra vez. Se destriggerean todos los marcadores cuyo punto de
  //    cruce (misma fórmula que findCrossedCheckpoint) sea >= la nueva
  //    posición, y se limpia pausedByMarker (si el seek aterrizó lejos de
  //    cualquier marcador, no hay razón para seguir mostrando ese aviso).
  seek(px: number) {
    const clamped = Math.min(Math.max(0, px), this.totalPx)
    this.positionPx = clamped
    for (const checkpoint of this.checkpoints) {
      const triggerPx = Math.max(0, checkpoint.offsetTop - this.readingLinePx)
      if (triggerPx >= clamped) this.triggeredMarkers.delete(checkpoint.element)
    }
    this.pausedByMarker = false
    if (this.status === 'finished' && clamped < this.totalPx) {
      this.status = 'paused'
    }
    this.applyTransform()
    this.emit(true)
  }

  // Nunca se envían píxeles por la red: el remoto solo conoce progreso
  // normalizado (0-1), y cada host lo convierte a su propia geometría
  // (totalPx puede ser distinto en cada pantalla). También la usa
  // TeleprompterPage para restaurar la posición de lectura tras un
  // cambio de calibración que reflowea el texto (Fase F8.4 parte B).
  seekToProgress(progress: number) {
    const clamped = Math.min(Math.max(0, progress), 1)
    this.seek(clamped * this.totalPx)
  }

  getProgress(): number {
    return this.totalPx > 0 ? this.positionPx / this.totalPx : 0
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): TeleprompterSnapshot {
    return {
      status: this.status,
      progress: this.getProgress(),
      positionPx: this.positionPx,
      totalPx: this.totalPx,
      wpm: this.wpm,
      pausedByMarker: this.pausedByMarker,
    }
  }

  private startLoop() {
    if (this.rafId != null) return
    const step = (time: number) => {
      if (this.status !== 'playing') {
        this.rafId = null
        return
      }
      if (this.lastFrameTime == null) this.lastFrameTime = time
      const deltaMs = time - this.lastFrameTime
      this.lastFrameTime = time
      this.advance(deltaMs)
      this.rafId = this.status === 'playing' ? requestAnimationFrame(step) : null
    }
    this.rafId = requestAnimationFrame(step)
  }

  private stopLoop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    this.lastFrameTime = null
  }

  private advance(deltaMs: number) {
    const deltaPx = (this.pxPerSecond * deltaMs) / 1000
    const nextPos = this.positionPx + deltaPx

    const crossed = this.findCrossedCheckpoint(this.positionPx, nextPos)
    if (crossed) {
      // Detener exactamente en el punto de cruce, no en donde haya caído el
      // último frame — así la pausa siempre ocurre en el mismo lugar visual
      // sin importar el deltaMs del frame en que se detectó.
      this.positionPx = Math.min(crossed.triggerPx, this.totalPx)
      this.triggeredMarkers.add(crossed.checkpoint.element)
      this.status = 'paused'
      this.pausedByMarker = true
      this.applyTransform()
      this.stopLoop()
      this.emit(true)
      return
    }

    if (nextPos >= this.totalPx) {
      this.positionPx = this.totalPx
      this.status = 'finished'
      this.applyTransform()
      this.stopLoop()
      this.emit(true)
      return
    }

    this.positionPx = nextPos
    this.applyTransform()
    this.emit(false)
  }

  // Busca un marcador de pausa automática cuya "línea de lectura" caiga
  // dentro del tramo [from, to) que se va a recorrer en este frame. Un
  // marcador ya disparado (triggeredMarkers) se ignora, así que reanudar la
  // reproducción no vuelve a pausar en el mismo punto.
  //
  // Un marcador ubicado dentro de la primera mitad de pantalla (offsetTop <
  // readingLinePx) tendría un punto de cruce NEGATIVO — una posición "antes
  // del inicio" que el scroll, arrancando en 0, nunca podría alcanzar, y por
  // lo tanto jamás se dispararía. Geométricamente, ese marcador ya está "en
  // o por delante de" la línea de lectura desde el primer frame: la posición
  // válida más temprana en la que puede considerarse cruzado es el propio
  // inicio del recorrido (0). Se ancla (clamp) el punto de cruce a ese
  // mínimo en vez de dejarlo negativo, así una pausa al comienzo del guion sí
  // puede dispararse (en el primer frame con avance real), sin afectar en
  // nada a los marcadores cuyo punto de cruce ya era válido.
  private findCrossedCheckpoint(from: number, to: number) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.autoPause) continue
      if (this.triggeredMarkers.has(checkpoint.element)) continue
      const triggerPx = Math.max(0, checkpoint.offsetTop - this.readingLinePx)
      if (triggerPx >= from && triggerPx < to) {
        return { checkpoint, triggerPx }
      }
    }
    return null
  }

  private applyTransform() {
    if (this.contentEl) {
      this.contentEl.style.transform = `translateY(${-this.positionPx}px)`
    }
  }

  private emit(force: boolean) {
    const now = performance.now()
    if (!force && now - this.lastEmitAt < EMIT_THROTTLE_MS) return
    this.lastEmitAt = now
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
