import { useEffect, useRef, useState } from 'react'
import { X, Camera, CheckCircle2, Keyboard, ScanLine, AlertCircle } from 'lucide-react'

interface Props {
  onScan: (data: string) => Promise<boolean>
  onClose: () => void
  externalError?: string
}

type ScanState = 'idle' | 'processing' | 'success'

export default function QRScanner({ onScan, onClose, externalError }: Props) {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [manualCode, setManualCode] = useState('')
  const [manualError, setManualError] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(false)

  const scannerRef = useRef<any>(null)
  const containerId = useRef('qr-reader-' + Date.now())
  const processingRef = useRef(false)

  const stopCamera = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
    setCameraActive(false)
  }

  const startCamera = async () => {
    if (scanState !== 'idle') return
    setCameraError(false)
    setCameraActive(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(containerId.current)
      scannerRef.current = scanner

      // Sin `qrbox` para que no aparezca el recuadro interior.
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10 },
        async (decodedText: string) => {
          if (processingRef.current) return
          processingRef.current = true
          setScanState('processing')
          stopCamera()

          try {
            const ok = await onScan(decodedText)
            if (ok) {
              setScanState('success')
              return
            }
          } catch {
            setCameraError(true)
          }

          processingRef.current = false
          setScanState('idle')
        },
        () => {}
      )
    } catch {
      setCameraError(true)
      setCameraActive(false)
    }
  }

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (scanState !== 'idle') return

    const code = manualCode.trim().toUpperCase()
    if (!code) {
      setManualError('Introduce un código')
      return
    }

    setManualError('')
    processingRef.current = true
    setScanState('processing')
    stopCamera()

    try {
      const ok = await onScan(`MANUAL:${code}`)
      if (ok) {
        setScanState('success')
        return
      }
    } catch {
      // el error puede mostrarse desde `externalError`
    }

    processingRef.current = false
    setScanState('idle')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="w-6 h-6" />
          <span className="font-semibold text-lg">Verificar Pedido</span>
        </div>
        <button
          onClick={() => { stopCamera(); onClose() }}
          className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        {scanState === 'processing' ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-white text-lg font-medium">Verificando pedido...</p>
            <p className="text-gray-400 text-sm mt-2">Espera un momento</p>
          </div>
        ) : scanState === 'success' ? (
          <div className="text-center">
            <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto mb-4" />
            <p className="text-white text-lg font-medium">¡Éxito!</p>
            <p className="text-gray-400 text-sm mt-2">El pedido ha sido marcado como completado</p>
            <button
              onClick={() => { stopCamera(); onClose() }}
              className="mt-6 bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl font-medium transition"
            >
              Volver al panel de pedidos
            </button>
          </div>
        ) : (
          <>
            {/* Entrada manual del código - SIEMPRE VISIBLE */}
            <div className="w-full max-w-sm">
              <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
                <h3 className="text-white font-semibold text-center mb-4 flex items-center justify-center gap-2">
                  <Keyboard className="w-5 h-5" />
                  Código de recogida
                </h3>

                {manualError && (
                  <p className="text-red-400 text-sm text-center mb-3">{manualError}</p>
                )}
                {externalError && !manualError && (
                  <p className="text-red-400 text-sm text-center mb-3">{externalError}</p>
                )}

                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Ej: A1B2C3"
                    autoFocus
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-2xl font-bold tracking-widest placeholder:text-gray-500 placeholder:text-base placeholder:font-normal placeholder:tracking-normal focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                  <button
                    type="submit"
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Completar Pedido
                  </button>
                </form>
              </div>
            </div>

            {/* Separador */}
            <div className="flex items-center gap-3 w-full max-w-sm">
              <div className="flex-1 h-px bg-white/20"></div>
              <span className="text-gray-500 text-xs uppercase">o</span>
              <div className="flex-1 h-px bg-white/20"></div>
            </div>

            {/* Botón para activar cámara / Cámara activa */}
            <div className="w-full max-w-sm">
              <style>{`
                #${containerId.current} [id^="qr-shaded-region"] { display: none !important; }
                #${containerId.current} .qr-shaded-region { display: none !important; }
                #${containerId.current} video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
              `}</style>
              {/* Div contenedor del scanner - siempre en el DOM */}
              <div
                id={containerId.current}
                className={`relative w-full aspect-square bg-black rounded-2xl overflow-hidden ${cameraActive ? '' : 'hidden'}`}
              ></div>

              {cameraActive ? (
                <div className="text-center mt-3">
                  <p className="text-gray-400 text-sm mb-2">Apunta al código QR del cliente</p>
                  <button
                    onClick={stopCamera}
                    className="text-gray-500 hover:text-white text-sm transition"
                  >
                    Cerrar cámara
                  </button>
                </div>
              ) : (
                <button
                  onClick={startCamera}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Escanear con cámara
                </button>
              )}

              {cameraError && (
                <p className="text-yellow-400 text-xs text-center mt-2 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No se pudo acceder a la cámara
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
