// Transporte P2P opcional sobre WebRTC (DataChannel) para la ruta "caliente"
// del control remoto — comandos, snapshot de reproducción/calibración,
// lista de guiones y avisos — cuando host y remoto pueden conectarse
// directo (misma red casi siempre, a veces incluso entre redes distintas
// si el NAT lo permite). Pedido explícito del usuario: el control remoto
// tenía lag perceptible pasando todo por el broadcast de Supabase.
//
// Supabase Realtime sigue siendo el ÚNICO canal para: la sesión en sí
// (crear/leer/unirse/terminar, vía RPC — ver remoteSession.ts) y la
// señalización WebRTC (intercambio de oferta/respuesta/candidatos ICE, acá
// abajo) — eso es liviano e infrecuente (un puñado de mensajes chicos al
// emparejar), nunca lo que generaba el lag reportado. Mientras el
// DataChannel no esté abierto (negociando, red que bloquea P2P, o
// directamente sin intentarlo porque el navegador no soporta WebRTC), TODO
// sigue viajando por el broadcast de Supabase exactamente como antes —
// este módulo es un ATAJO, nunca un reemplazo: remoteSession.ts decide en
// cada envío, en el momento, cuál transporte usar; ninguna función pública
// de ese archivo cambia de firma, así que TeleprompterPage/RemoteControlPage
// no se enteran de cuál transporte se usó para cada mensaje.
//
// Solo un servidor STUN público (no TURN): ayuda a cada lado a descubrir su
// IP/puerto público durante la negociación cuando no están en la misma
// subred exacta (p. ej. AP isolation, doble NAT de un hotspot) — el tráfico
// de datos en sí nunca pasa por ahí ni por ningún tercero. Si la negociación
// no prospera (red que bloquea P2P por completo), send() simplemente nunca
// encuentra el DataChannel abierto y todo sigue por Supabase sin que nadie
// lo note.
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const DATA_CHANNEL_LABEL = 'robress-remote'

export type RemoteWireEvent = 'command' | 'playback' | 'calibration' | 'scriptList' | 'notice'

interface WireEnvelope {
  kind: RemoteWireEvent
  payload: unknown
}

export type WebrtcSignal =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

export interface WebrtcLink {
  // Solo hace algo para el rol 'remote' (arranca la oferta) — el host
  // nunca ofrece, así que para 'host' es un no-op. Lo llama
  // remoteSession.ts recién después de confirmar que el canal de
  // señalización (el mismo canal de Supabase) ya está SUBSCRIBED, para que
  // sendSignal() tenga dónde mandar la oferta.
  start(): void
  isOpen(): boolean
  // true si se pudo mandar por el DataChannel — false si no estaba abierto
  // (el llamador cae a Supabase en ese caso, ver sendWireEvent en
  // remoteSession.ts).
  send(kind: RemoteWireEvent, payload: unknown): boolean
  handleSignal(message: WebrtcSignal): void
  destroy(): void
}

interface CreateWebrtcLinkOptions {
  role: 'host' | 'remote'
  sendSignal: (message: WebrtcSignal) => void
  onMessage: (kind: RemoteWireEvent, payload: unknown) => void
}

const isWebrtcSupported = typeof RTCPeerConnection !== 'undefined'

export function createWebrtcLink({ role, sendSignal, onMessage }: CreateWebrtcLinkOptions): WebrtcLink {
  if (!isWebrtcSupported) {
    return { start: () => {}, isOpen: () => false, send: () => false, handleSignal: () => {}, destroy: () => {} }
  }

  let pc: RTCPeerConnection | null = null
  let dataChannel: RTCDataChannel | null = null
  let negotiating = false

  function wireDataChannel(dc: RTCDataChannel): void {
    dataChannel = dc
    dc.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as WireEnvelope
        onMessage(envelope.kind, envelope.payload)
      } catch {
        // Mensaje corrupto o de un protocolo viejo/nuevo — se descarta,
        // nunca rompe la conexión (mismo criterio que el resto de los
        // parsers de este módulo con datos que no controla el otro
        // extremo).
      }
    }
  }

  function ensurePeerConnection(): RTCPeerConnection {
    if (pc) return pc
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ kind: 'ice', candidate: event.candidate.toJSON() })
    }
    // Solo lo usa el host: es quien recibe el DataChannel que crea el
    // remoto (ver startAsOfferer) en vez de crear el suyo propio.
    connection.ondatachannel = (event) => wireDataChannel(event.channel)
    pc = connection
    return connection
  }

  // El remoto siempre ofrece: es el lado que recién se unió (ver
  // joinSessionAsRemote en remoteSession.ts), así que es el que tiene
  // sentido que inicie la negociación apenas se confirma la unión — el
  // host, del otro lado, solo queda escuchando una oferta que puede llegar
  // en cualquier momento después de eso.
  async function startAsOfferer(): Promise<void> {
    if (negotiating) return
    negotiating = true
    try {
      const connection = ensurePeerConnection()
      wireDataChannel(connection.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true }))
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      sendSignal({ kind: 'offer', sdp: offer })
    } catch (err) {
      console.error('[remote-webrtc] no se pudo iniciar la oferta P2P:', err)
    }
  }

  async function handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (role !== 'host') return // el host nunca ofrece, el remoto nunca contesta una oferta
    try {
      const connection = ensurePeerConnection()
      await connection.setRemoteDescription(sdp)
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      sendSignal({ kind: 'answer', sdp: answer })
    } catch (err) {
      console.error('[remote-webrtc] no se pudo responder la oferta P2P:', err)
    }
  }

  async function handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (role !== 'remote' || !pc) return
    try {
      await pc.setRemoteDescription(sdp)
    } catch (err) {
      console.error('[remote-webrtc] no se pudo aplicar la respuesta P2P:', err)
    }
  }

  async function handleIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!pc) return
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // Un candidato puede llegar antes de setRemoteDescription por el
      // orden de entrega (trickle ICE) — se descarta ese candidato puntual,
      // no rompe la negociación entera (WebRTC tolera perder alguno).
    }
  }

  return {
    start() {
      if (role === 'remote') void startAsOfferer()
    },
    isOpen: () => dataChannel?.readyState === 'open',
    send(kind, payload) {
      if (dataChannel?.readyState !== 'open') return false
      try {
        dataChannel.send(JSON.stringify({ kind, payload } satisfies WireEnvelope))
        return true
      } catch {
        return false
      }
    },
    handleSignal(message) {
      if (message.kind === 'offer') void handleOffer(message.sdp)
      else if (message.kind === 'answer') void handleAnswer(message.sdp)
      else if (message.kind === 'ice') void handleIce(message.candidate)
    },
    destroy() {
      try {
        dataChannel?.close()
      } catch {
        /* no-op: ya puede estar cerrado */
      }
      try {
        pc?.close()
      } catch {
        /* no-op: ya puede estar cerrado */
      }
      dataChannel = null
      pc = null
    },
  }
}
