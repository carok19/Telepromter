// Landing del modo remoto (F8.2): /remote. Pensada para abrirse casi
// siempre escaneando el QR con la cámara nativa del teléfono (que navega
// directo a /remote/:sessionId, sin pasar por acá) — pero también permite
// escanear dentro de la propia app o ingresar el código de sesión a mano,
// por si la cámara falla o el usuario entra manualmente a /remote.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRScanner } from '../components/remote/QRScanner'
import { Logo } from '../components/shared/Logo'
import { ACCENT_SURFACE, FONT_DISPLAY, NEUTRAL_SURFACE } from '../styles/tokens'

// Acepta tanto la URL completa del QR (https://dominio/remote/<id>) como el
// código de sesión pegado o escrito a mano.
function extractSessionId(input: string): string {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/\/remote\/([^/]+)/)
    if (match) return match[1]
  } catch {
    // No era una URL completa: se asume que el texto ya es el sessionId.
  }
  return trimmed
}

export function RemoteJoinPage() {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')

  function goToSession(raw: string) {
    const sessionId = extractSessionId(raw)
    if (!sessionId) return
    navigate(`/remote/${sessionId}`)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0b0c10] p-6 text-center text-gray-100">
      <Logo />
      <h1 className={`text-xl font-semibold ${FONT_DISPLAY}`}>Control remoto</h1>
      <p className="max-w-xs text-sm text-gray-400">
        Escaneá el código QR que te muestra el Teleprompter, o ingresá el código de sesión manualmente.
      </p>

      {scanning ? (
        <div className="w-full max-w-xs">
          <QRScanner onResult={goToSession} />
          <button
            type="button"
            onClick={() => setScanning(false)}
            className={`mt-4 w-full ${NEUTRAL_SURFACE} px-4 py-3 text-base`}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setScanning(true)}
          className={`w-full max-w-xs ${ACCENT_SURFACE} px-4 py-3 text-base font-medium`}
        >
          Escanear código QR
        </button>
      )}

      <div className="w-full max-w-xs border-t border-white/10 pt-6">
        <label className="block text-left text-xs text-gray-500">
          Código de sesión
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Pegá o escribí el código"
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0f1117] px-3 py-3 text-base text-gray-100 placeholder:text-gray-500 focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => goToSession(manualCode)}
          disabled={!manualCode.trim()}
          className={`mt-3 w-full ${NEUTRAL_SURFACE} px-4 py-3 text-base disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Conectar
        </button>
      </div>
    </div>
  )
}
