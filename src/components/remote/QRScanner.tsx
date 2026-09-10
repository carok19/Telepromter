// Escáner de QR mediante la cámara del dispositivo, usando html5-qrcode.
// Se usa desde RemoteJoinPage cuando el usuario prefiere escanear el código
// dentro de la propia app (además de poder abrir el QR con la cámara nativa
// del teléfono, que ya funciona sin este componente).
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onResult: (decodedText: string) => void
}

// Id único por instancia: html5-qrcode necesita un elemento del DOM con un
// id fijo donde montar su propio <video>. Un contador evita colisiones si
// en algún momento se usa el escáner en más de un lugar a la vez.
let instanceCounter = 0

export function QRScanner({ onResult }: QRScannerProps) {
  const [containerId] = useState(() => `qr-scanner-${++instanceCounter}`)
  const [error, setError] = useState<string | null>(null)
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    let stopped = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decodedText) => {
          if (stopped) return
          stopped = true
          onResultRef.current(decodedText)
          scanner.stop().catch(() => {})
        },
        () => {
          // Frame sin QR detectado: ocurre en casi todos los frames mientras
          // se apunta la cámara — no es un error real, se ignora a propósito.
        },
      )
      .catch((err) => {
        setError('No se pudo acceder a la cámara. Podés usar el código manual más abajo.')
        console.error('[remote] No se pudo iniciar el escáner de QR:', err)
      })

    return () => {
      stopped = true
      if (scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, [containerId])

  return (
    <div>
      <div id={containerId} className="mx-auto w-full max-w-xs overflow-hidden rounded-lg bg-black" />
      {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}
    </div>
  )
}
