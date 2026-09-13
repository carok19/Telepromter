// Modal de emparejamiento del control remoto (F8.2): se abre desde
// TeleprompterPage al crear una sesión. Muestra el QR y el enlace para que
// otro celular se una desde /remote/:sessionId, y refleja en vivo si ya se
// conectó un remoto (vía el snapshot de sesión que le pasa TeleprompterPage,
// suscripto por separado).
import { useState } from 'react'
import QRCode from 'react-qr-code'
import type { RemoteSession } from '../../services/remoteSession'
import { ModalPortal } from '../shared/ModalPortal'
import { ACCENT_SURFACE, FONT_DISPLAY, SURFACE_RAISED } from '../../styles/tokens'

interface PairingModalProps {
  sessionId: string
  session: RemoteSession | null
  joinUrl: string
  onClose: () => void
}

export function PairingModal({ sessionId, session, joinUrl, onClose }: PairingModalProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Clipboard API puede no estar disponible (permisos, contexto no
      // seguro); el enlace ya queda visible en texto para copiarlo a mano.
      console.error('[remote] No se pudo copiar el enlace:', err)
    }
  }

  const isEnded = session?.status === 'ended'
  // remoteConnected exige que el clientId trackeado en Presence coincida
  // con el remoteUid confirmado por la tabla — no alcanza con que la tabla
  // diga que hay un remoto emparejado (ver remoteSession.ts).
  const isConnected = !isEnded && session?.remoteConnected === true

  const statusLabel = !session
    ? 'Creando sesión…'
    : isEnded
      ? 'Sesión cerrada'
      : isConnected
        ? 'Remoto conectado'
        : 'Esperando conexión…'

  return (
    <ModalPortal backdropClassName="bg-black/70">
      <div className={`w-full max-w-sm rounded-lg border border-white/10 ${SURFACE_RAISED} p-6 text-center`}>
        <h2 className={`text-lg font-semibold text-gray-100 ${FONT_DISPLAY}`}>Control remoto</h2>
        <p className="mt-2 text-sm text-gray-400">
          Escaneá este código QR desde otro celular para controlar este Teleprompter.
        </p>

        <div className="mx-auto mt-4 w-fit rounded-lg bg-white p-4">
          <QRCode value={joinUrl} size={200} />
        </div>

        <p className="mt-4 text-xs text-gray-500">Código de sesión</p>
        <p className="break-all px-2 font-mono text-sm text-gray-300">{sessionId}</p>

        <button
          type="button"
          onClick={handleCopy}
          className="mt-4 w-full rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
        >
          {copied ? 'Enlace copiado' : 'Copiar enlace'}
        </button>

        <p className={`mt-4 text-sm font-medium ${isConnected ? 'text-emerald-400' : 'text-amber-300'}`}>
          {statusLabel}
        </p>

        <button type="button" onClick={onClose} className={`mt-4 w-full ${ACCENT_SURFACE} px-4 py-2 text-sm font-medium`}>
          Cerrar
        </button>
      </div>
    </ModalPortal>
  )
}
