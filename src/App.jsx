import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScanbotSDK from 'scanbot-web-sdk/ui'
import './App.css'

const LICENSE_KEY =
  'I9WH335R2QxFJDOPcQAOfo3AHMxIUa' +
  'McdyC+Eg2u4UsHcf4PSEMsGYCApaxU' +
  'RzTFcE8FwEgpaUdgCilaqEggbCFIP0' +
  'PnlqZZjjhDjc6VaVkUH80XXcipM+yY' +
  'iz1OtQVxKJCOhlo7E+hYYvGPi3rLnz' +
  'hs9ysov6HzKLGSdQWmLnf1WQsTasOg' +
  'oSGxipXgfwFH2lwjisUyUE73KnG9CK' +
  'g7wcCCtfBKvrrqwej1HXggrVB1+Bma' +
  'n9FOKecMhHyNE+EwEmEPPPRTjgB62E' +
  'pxQ8G1pDOmqP/4z/lZxqLROiZMBMAG' +
  'cJaasL6xRKrPPNsAZTcdxMdCuiUX3+' +
  '3Ly8631L8A6g==\nU2NhbmJvdFNESw' +
  'psb2NhbGhvc3R8c2Nhbi1ib3Qtc2Rr' +
  'LWRlbW8udmVyY2VsLmFwcAoxNzY0Nj' +
  'MzNTk5CjgzODg2MDcKOA==\n'

const ENGINE_PATH = '/scanbot-sdk/bin/complete/'

const DOC_TYPES = {
  id: {
    label: 'ID / license card',
    summary: 'Optimized for small IDs, driver licenses and insurance cards.',
    aspect: { width: 86, height: 54 },
    sizeScore: 60,
  },
  a4: {
    label: 'Prescription / A4 sheet',
    summary: 'Best for prescriptions, medical forms and A4-sized paperwork.',
    aspect: { width: 210, height: 297 },
    sizeScore: 80,
  },
}

const bytesToBase64Url = (bytes) => {
  if (!bytes) return ''
  const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000

  for (let i = 0; i < normalized.byteLength; i += chunk) {
    const slice = normalized.subarray(i, i + chunk)
    binary += String.fromCharCode(...slice)
  }

  const encoder =
    typeof window !== 'undefined' && window.btoa
      ? window.btoa
      : (value) => Buffer.from(value, 'binary').toString('base64')
  return `data:image/jpeg;base64,${encoder(binary)}`
}

function App() {
  const [sdk, setSdk] = useState(null)
  const [status, setStatus] = useState('Booting Scanbot SDK…')
  const [docType, setDocType] = useState('id')
  const [autoCapture, setAutoCapture] = useState(true)
  const [autoSensitivity, setAutoSensitivity] = useState(0.75)
  const [isScannerOpen, setScannerOpen] = useState(false)
  const [captures, setCaptures] = useState([])
  const [previewImage, setPreviewImage] = useState(null)
  const containerRef = useRef(null)
  const scannerHandleRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      try {
        setStatus('Initializing Scanbot SDK…')
        const instance = await ScanbotSDK.initialize({
          licenseKey: LICENSE_KEY,
          enginePath: ENGINE_PATH,
          allowThreads: true,
          verboseLogging: false,
        })
        setSdk(instance)
        setStatus('SDK ready. Tap “Start scanning” to open the camera.')
      } catch (error) {
        console.error('Scanbot initialization failed', error)
        setStatus(`Initialization failed: ${error?.message || error}`)
      }
    }

    init()

    return () => {
      scannerHandleRef.current?.dispose()
      scannerHandleRef.current = null
    }
  }, [])

  useEffect(() => {
    const handle = scannerHandleRef.current
    if (!handle) return

    if (autoCapture) {
      handle.enableAutoCapture()
    } else {
      handle.disableAutoCapture()
    }
  }, [autoCapture])

  const activeDocPreset = useMemo(() => DOC_TYPES[docType], [docType])

  const disposeScanner = useCallback(() => {
    if (scannerHandleRef.current) {
      scannerHandleRef.current.dispose()
      scannerHandleRef.current = null
    }
    setScannerOpen(false)
  }, [])

  const handleDocumentDetected = useCallback(async (response) => {
    if (!response?.result?.croppedImage) {
      setStatus('Document detected but no crop was returned. Try again.')
      return
    }

    setStatus('Processing capture…')
    try {
      const jpegBytes = await response.result.croppedImage.toJpeg(95)
      const base64Image = bytesToBase64Url(jpegBytes)
      console.log('[Scanbot] Captured document (base64):', base64Image)
      setCaptures((prev) => [base64Image, ...prev].slice(0, 4))
      setPreviewImage(base64Image)
      setStatus('Preview ready. Review the capture or retake it.')
      disposeScanner()
    } catch (error) {
      console.error('Failed to convert capture', error)
      setStatus(`Capture conversion failed: ${error?.message || error}`)
    }
  }, [disposeScanner])

  const buildScannerConfiguration = useCallback(() => {
    const aspectRatio = new ScanbotSDK.Config.AspectRatio({
      width: activeDocPreset.aspect.width,
      height: activeDocPreset.aspect.height,
    })

    return {
      container: containerRef.current ?? undefined,
      autoCaptureEnabled: autoCapture,
      autoCaptureSensitivity: autoSensitivity,
      autoCaptureDelay: 900,
      useImageCaptureAPI: true,
      scannerConfiguration: {
        engineMode: 'ML',
        processingMode: 'SINGLE_SHOT',
        parameters: new ScanbotSDK.Config.DocumentScannerParameters({
          acceptedAngleScore: 85,
          acceptedSizeScore: activeDocPreset.sizeScore,
          acceptedAspectRatioScore: 92,
          aspectRatios: [aspectRatio],
          ignoreOrientationMismatch: true,
        }),
      },
      onDocumentDetected: handleDocumentDetected,
      onError: (error) => {
        console.error('Scanner error', error)
        setStatus(`Scanner error: ${error?.message || error}`)
      },
    }
  }, [activeDocPreset, autoCapture, autoSensitivity, handleDocumentDetected])

  const startScanner = useCallback(async () => {
    if (!sdk) {
      setStatus('SDK not ready yet. Please wait…')
      return
    }

    if (!containerRef.current) {
      setStatus('Scanner container is missing from the DOM')
      return
    }

    try {
      setStatus('Starting camera preview…')
      setPreviewImage(null)
      disposeScanner()
      const config = buildScannerConfiguration()
      const handle = await sdk.createDocumentScanner(config)
      scannerHandleRef.current = handle
      setScannerOpen(true)
      setStatus('Scanner live. Align the document and wait for auto capture or tap the shutter.')
    } catch (error) {
      console.error('Unable to start scanner', error)
      setStatus(`Unable to start scanner: ${error?.message || error}`)
    }
  }, [sdk, buildScannerConfiguration, disposeScanner])

  const retakeCapture = useCallback(() => {
    setStatus('Retake requested. Relaunching scanner…')
    startScanner()
  }, [startScanner])

  const keepCapture = useCallback(() => {
    setPreviewImage(null)
    setStatus('Capture locked in. Start scanning again for more pages.')
  }, [])

  return (
    <div className="app-shell">
      <main className="layout">
        <header className="hero">
          <div>
            <p className="eyebrow">Scanbot SDK • Ready-to-Use UI</p>
            <h1>Capture crystal-clear IDs & prescriptions</h1>
            <p className="lede">
              Auto-edge detection, auto snapping, and manual shutter fallback ship out of the box. Select the
              document preset that matches your workflow and start scanning in seconds.
            </p>
          </div>
        </header>

        <section className="controls-card">
          <div className="controls-row">
            <div className="control-block">
              <h2>Document preset</h2>
              <div className="pill-group">
                {Object.entries(DOC_TYPES).map(([type, preset]) => (
                  <button
                    key={type}
                    type="button"
                    className={`pill ${docType === type ? 'pill--active' : ''}`}
                    onClick={() => setDocType(type)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="preset-hint">{activeDocPreset.summary}</p>
            </div>

            <div className="control-block">
              <h2>Capture mode</h2>
              <label className="toggle">
                <input type="checkbox" checked={autoCapture} onChange={() => setAutoCapture((prev) => !prev)} />
                <span>Auto capture</span>
              </label>
              <label className="slider">
                <span>Auto sensitivity: {autoSensitivity.toFixed(2)}</span>
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={autoSensitivity}
                  onChange={(event) => setAutoSensitivity(Number(event.target.value))}
                  disabled={!autoCapture}
                />
              </label>
            </div>

            <div className="control-block actions">
              <h2>Scanner controls</h2>
              <div className="button-stack">
                <button type="button" className="primary" onClick={startScanner}>
                  Start scanning
                </button>
                <button type="button" className="ghost" onClick={disposeScanner} disabled={!isScannerOpen}>
                  Stop scanner
                </button>
              </div>
              <p className="status-label">{status}</p>
            </div>
          </div>
        </section>

        <section className="scanner-card">
          <div className={`scanner-shell ${isScannerOpen ? 'scanner-shell--active' : ''}`}>
            <div className="scanner-surface" ref={containerRef} style={{ opacity: previewImage ? 0 : 1 }} />
            {previewImage ? (
              <div className="capture-preview">
                <img src={previewImage} alt="Latest capture" />
                <div className="preview-actions">
                  <button type="button" className="primary" onClick={keepCapture}>
                    Keep capture
                  </button>
                  <button type="button" className="ghost" onClick={retakeCapture}>
                    Retake
                  </button>
                </div>
              </div>
            ) : (
              !isScannerOpen && (
                <div className="scanner-placeholder">
                  <p>Your live camera view appears here after you start the scanner.</p>
                  <p>For manual shutter, tap the circular button inside the Scanbot UI.</p>
                </div>
              )
            )}
          </div>
          <div className="status-bar">
            <span className={`status-chip ${sdk ? 'status-chip--success' : 'status-chip--warning'}`}>
              {sdk ? 'SDK ready' : 'SDK offline'}
            </span>
            <span className={`status-chip ${isScannerOpen ? 'status-chip--success' : ''}`}>
              {isScannerOpen ? 'Scanner live' : 'Scanner idle'}
            </span>
            <span className="status-chip status-chip--muted">
              Engine path: <code>{ENGINE_PATH}</code>
            </span>
          </div>
        </section>

        <section className="captures-card">
          <div className="captures-header">
            <div>
              <h2>Recent captures</h2>
              <p>Each capture below mirrors what is logged to the console as a base64 data URL.</p>
            </div>
          </div>
          {captures.length === 0 ? (
            <p className="empty-state">No captures yet. Snap an ID or prescription to populate this list.</p>
          ) : (
            <div className="capture-grid">
              {captures.map((image, index) => (
                <article key={`${image}-${index}`} className="capture-card">
                  <img src={image} alt={`Scan ${index + 1}`} loading="lazy" />
                  <div className="capture-meta">
                    <span>Base64 preview</span>
                    <code>{`${image.slice(0, 64)}…`}</code>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
