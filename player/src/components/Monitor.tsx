import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'

interface StreamMetrics {
  resolution: string
  fps: number
  bitrate: number
  rtt: number
  packetsLost: number
  jitter: number
  codec: string
  framesDropped: number
  bytesReceived: number
}

interface DebugEntry {
  time: string
  level: 'info' | 'warn' | 'error'
  msg: string
}

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

export function Monitor() {
  const { stream = 'stream' } = useParams<{ stream: string }>()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const sessionUrlRef = useRef<string | null>(null)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastBytesRef = useRef<{ bytes: number; timestamp: number } | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [connectionState, setConnectionState] = useState<ConnectionState>('new')
  const [metrics, setMetrics] = useState<StreamMetrics | null>(null)
  const [showMetrics, setShowMetrics] = useState(true)
  const [showDebug, setShowDebug] = useState(false)
  const [debugLog, setDebugLog] = useState<DebugEntry[]>([])
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const whepUrl = `http://${window.location.hostname}:8889/live/${stream}/whep`

  // Debug logger — writes to both console and on-screen panel
  const debug = useCallback((level: DebugEntry['level'], msg: string) => {
    const entry: DebugEntry = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level,
      msg,
    }
    setDebugLog(prev => [...prev.slice(-99), entry]) // keep last 100 entries
    const prefix = `[Monitor] ${msg}`
    if (level === 'error') console.error(prefix)
    else if (level === 'warn') console.warn(prefix)
    else console.log(prefix)
  }, [])

  // Disconnect and clean up
  const disconnect = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }

    if (sessionUrlRef.current) {
      fetch(sessionUrlRef.current, { method: 'DELETE' }).catch(() => { /* best effort */ })
      sessionUrlRef.current = null
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    lastBytesRef.current = null
    setConnectionState('new')
    setMetrics(null)
  }, [])

  // Poll RTCStatsReport every second
  const startStatsCollection = useCallback((pc: RTCPeerConnection) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)

    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState === 'closed') return

      try {
        const stats = await pc.getStats()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let videoStats: any = null
        let codecMimeType: string | null = null
        let rtt: number | null = null

        for (const [, report] of stats.entries()) {
          const r = report as Record<string, unknown>
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            videoStats = r
          }
          if (r.type === 'codec' && typeof r.mimeType === 'string' && r.mimeType.startsWith('video/')) {
            codecMimeType = r.mimeType as string
          }
          if (r.type === 'candidate-pair' && r.nominated) {
            rtt = (r.currentRoundTripTime as number) ?? null
          }
        }

        if (videoStats) {
          const bytesReceived = (videoStats.bytesReceived as number) ?? 0
          const timestamp = (videoStats.timestamp as number) ?? 0
          let bitrate = 0

          if (lastBytesRef.current) {
            const deltaBytes = bytesReceived - lastBytesRef.current.bytes
            const deltaMs = timestamp - lastBytesRef.current.timestamp
            if (deltaMs > 0) {
              bitrate = Math.round((deltaBytes * 8) / (deltaMs / 1000))
            }
          }
          lastBytesRef.current = { bytes: bytesReceived, timestamp }

          const frameWidth = videoStats.frameWidth as number | undefined
          const frameHeight = videoStats.frameHeight as number | undefined

          setMetrics({
            resolution: frameWidth && frameHeight ? `${frameWidth}×${frameHeight}` : '—',
            fps: (videoStats.framesPerSecond as number) ?? 0,
            bitrate,
            rtt: rtt ?? 0,
            packetsLost: (videoStats.packetsLost as number) ?? 0,
            jitter: (videoStats.jitter as number) ?? 0,
            codec: codecMimeType ?? '—',
            framesDropped: (videoStats.framesDropped as number) ?? 0,
            bytesReceived,
          })
        }
      } catch {
        // Stats collection may fail during connection teardown
      }
    }, 1000)
  }, [])

  // Connect to MediaMTX via WHEP protocol
  const connect = useCallback(async () => {
    disconnect()
    setErrorDetail(null)

    const pc = new RTCPeerConnection()
    peerConnectionRef.current = pc
    setConnectionState('connecting')

    debug('info', `Connecting to ${whepUrl}`)

    // Request video and audio tracks from the server
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    // Attach incoming tracks to the video element
    pc.ontrack = (evt) => {
      debug('info', `ontrack: ${evt.track.kind} track, ${evt.streams.length} stream(s)`)
      if (videoRef.current && evt.streams[0]) {
        videoRef.current.srcObject = evt.streams[0]
        videoRef.current.play()
          .then(() => debug('info', 'Video playback started'))
          .catch((err) => debug('warn', `Autoplay blocked: ${err}`))
      }
    }

    // Track connection state changes
    pc.onconnectionstatechange = () => {
      debug('info', `connectionState: ${pc.connectionState}`)
      setConnectionState(pc.connectionState as ConnectionState)
    }

    pc.oniceconnectionstatechange = () => {
      debug('info', `iceConnectionState: ${pc.iceConnectionState}`)
    }

    pc.onsignalingstatechange = () => {
      debug('info', `signalingState: ${pc.signalingState}`)
    }

    pc.onicegatheringstatechange = () => {
      debug('info', `iceGatheringState: ${pc.iceGatheringState}`)
    }

    try {
      // Step 1: Create SDP offer
      debug('info', 'Creating SDP offer...')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      debug('info', `Local description set (${offer.sdp?.length ?? 0} bytes)`)

      // Step 2: POST offer to WHEP endpoint
      debug('info', `POSTing SDP offer to WHEP endpoint...`)
      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })

      debug('info', `WHEP response: ${response.status} ${response.statusText}`)

      if (response.status !== 201) {
        const errBody = await response.text()
        debug('error', `WHEP error (${response.status}): ${errBody}`)

        // Parse common errors into user-friendly messages
        let friendlyError = `Server returned HTTP ${response.status}`
        try {
          const parsed = JSON.parse(errBody)
          if (parsed.error) {
            friendlyError = parsed.error
            if (parsed.error.includes('no stream')) {
              friendlyError = `No stream available — is a device streaming to rtmp://<host>:1935/live/${stream}?`
            }
          }
        } catch { /* not JSON */ }

        setErrorDetail(friendlyError)
        throw new Error(friendlyError)
      }

      // Step 3: Set the SDP answer from the server
      const answerSdp = await response.text()
      const locationHeader = response.headers.get('location')
      debug('info', `Got SDP answer (${answerSdp.length} bytes), session: ${locationHeader}`)

      sessionUrlRef.current = new URL(locationHeader!, whepUrl).toString()

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
      )
      debug('info', 'Remote description set — ICE connectivity checks starting')

      // Step 4: Send trickle ICE candidates as they arrive
      pc.onicecandidate = (evt) => {
        if (evt.candidate && sessionUrlRef.current) {
          debug('info', `ICE candidate: ${evt.candidate.type} ${evt.candidate.protocol} ${evt.candidate.address}:${evt.candidate.port}`)
          const candidate = evt.candidate
          const frag =
            `a=ice-ufrag:${candidate.usernameFragment}\r\n` +
            `a=candidate:${candidate.foundation} ${candidate.component} ${candidate.protocol} ` +
            `${candidate.priority} ${candidate.address} ${candidate.port} typ ${candidate.type}\r\n`

          fetch(sessionUrlRef.current, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/trickle-ice-sdpfrag',
              'If-Match': '*',
            },
            body: frag,
          }).catch((err) => debug('warn', `ICE trickle failed: ${err}`))
        } else if (!evt.candidate) {
          debug('info', 'ICE gathering complete')
        }
      }

      // Start collecting stats
      startStatsCollection(pc)
      debug('info', 'Waiting for media tracks...')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      debug('error', `Connection failed: ${msg}`)
      setConnectionState('failed')
    }
  }, [disconnect, startStatsCollection, debug, whepUrl])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect, stream])

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMouseMove = () => showControlsTemporarily()
    const onMouseLeave = () => { if (isPlaying) setShowControls(false) }
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseleave', onMouseLeave)
    return () => {
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [isPlaying, showControlsTemporarily])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      showControlsTemporarily()
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(-0.05)
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showControlsTemporarily])

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    video.paused ? video.play() : video.pause()
  }

  const changeVolume = (delta: number) => {
    const video = videoRef.current
    if (!video) return
    const newVol = Math.max(0, Math.min(1, video.volume + delta))
    video.volume = newVol
    setVolume(newVol)
    if (newVol > 0 && video.muted) {
      video.muted = false
      setIsMuted(false)
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return
    if (!document.fullscreenElement) {
      container.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const formatBitrate = (bps: number): string => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`
    return `${bps} bps`
  }

  const connectionLabel = (): { text: string; color: string } => {
    switch (connectionState) {
      case 'connecting': return { text: 'Connecting...', color: '#f59e0b' }
      case 'connected': return { text: 'Connected', color: '#22c55e' }
      case 'disconnected': return { text: 'Disconnected', color: '#f59e0b' }
      case 'failed': return { text: 'Connection Failed', color: '#ef4444' }
      case 'closed': return { text: 'Closed', color: '#6b7280' }
      default: return { text: 'Initializing', color: '#6b7280' }
    }
  }

  const status = connectionLabel()

  return (
    <div style={styles.page}>
      {/* Status bar */}
      <div style={styles.statusBar}>
        <div style={styles.statusLeft}>
          <span style={styles.badge}>WebRTC</span>
          <span style={{ ...styles.statusDot, backgroundColor: status.color }} />
          <span style={styles.statusText}>{status.text}</span>
        </div>
        <div style={styles.statusRight}>
          <button
            style={styles.debugToggle}
            onClick={() => setShowDebug(!showDebug)}
          >
            {showDebug ? 'Hide Debug' : 'Show Debug'}
          </button>
          {connectionState === 'failed' && (
            <button style={styles.retryButton} onClick={connect}>
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Video container */}
      <div ref={containerRef} style={styles.container}>
        <video ref={videoRef} style={styles.video} onClick={togglePlay} autoPlay muted playsInline />

        {connectionState === 'connecting' && (
          <div style={styles.overlay}>
            <div style={styles.spinner} />
            <span style={styles.overlayText}>Connecting to stream...</span>
          </div>
        )}

        {connectionState === 'failed' && (
          <div style={styles.overlay}>
            <div style={styles.failedIcon}>✕</div>
            <span style={styles.overlayText}>
              {errorDetail ?? 'Stream unavailable'}
            </span>
            <button style={styles.retryButtonLarge} onClick={connect}>
              Retry Connection
            </button>
          </div>
        )}

        {!isPlaying && connectionState === 'connected' && (
          <div style={styles.bigPlayOverlay} onClick={togglePlay}>
            <div style={styles.bigPlayButton}>▶</div>
          </div>
        )}

        {/* Controls */}
        <div
          style={{
            ...styles.controls,
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? 'auto' : 'none',
          }}
        >
          <div style={styles.buttonsRow}>
            <div style={styles.leftButtons}>
              <button style={styles.iconButton} onClick={togglePlay}>
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                )}
              </button>

              <div style={styles.volumeGroup}>
                <button style={styles.iconButton} onClick={toggleMute}>
                  {isMuted || volume === 0 ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="white" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="white" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="white" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  className="vol-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const newVol = parseFloat(e.target.value)
                    setVolume(newVol)
                    if (videoRef.current) {
                      videoRef.current.volume = newVol
                      videoRef.current.muted = newVol === 0
                      setIsMuted(newVol === 0)
                    }
                  }}
                  style={styles.volumeSlider}
                />
              </div>

              <span style={styles.liveBadge}>
                <span style={{ ...styles.liveDot, backgroundColor: connectionState === 'connected' ? '#22c55e' : '#f59e0b' }} />
                {connectionState === 'connected' ? 'LIVE' : 'CONNECTING'}
              </span>
            </div>

            <div style={styles.rightButtons}>
              <button
                style={{
                  ...styles.iconButton,
                  opacity: showMetrics ? 1 : 0.5,
                }}
                onClick={() => setShowMetrics(!showMetrics)}
                title="Toggle metrics"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M7 16l4-8 4 4 4-6" />
                </svg>
              </button>

              <button style={styles.iconButton} onClick={toggleFullscreen}>
                {isFullscreen ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <polyline points="14,2 20,2 20,8" />
                    <polyline points="10,22 4,22 4,16" />
                    <polyline points="20,8 14,14" />
                    <polyline points="4,16 10,10" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <polyline points="15,3 21,3 21,9" />
                    <polyline points="9,21 3,21 3,15" />
                    <polyline points="21,3 14,10" />
                    <polyline points="3,21 10,14" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics panel — below the video */}
      {metrics && showMetrics && (
        <div style={styles.metricsPanel}>
          <div style={styles.metricsTitle}>Stream Metrics</div>
          <div style={styles.metricsGrid}>
            <MetricCell label="Resolution" value={metrics.resolution} />
            <MetricCell label="FPS" value={`${metrics.fps}`} />
            <MetricCell label="Bitrate" value={formatBitrate(metrics.bitrate)} />
            <MetricCell label="Latency (RTT)" value={`${(metrics.rtt * 1000).toFixed(0)} ms`} />
            <MetricCell label="Packets Lost" value={`${metrics.packetsLost}`} />
            <MetricCell label="Jitter" value={`${(metrics.jitter * 1000).toFixed(1)} ms`} />
            <MetricCell label="Codec" value={metrics.codec.split('/')[1] ?? metrics.codec} />
            <MetricCell label="Frames Dropped" value={`${metrics.framesDropped}`} />
          </div>
        </div>
      )}

      {/* Debug console */}
      {showDebug && (
        <div style={styles.debugPanel}>
          <div style={styles.debugHeader}>
            <span style={styles.debugTitle}>Debug Console</span>
            <button style={styles.debugClear} onClick={() => setDebugLog([])}>
              Clear
            </button>
          </div>
          <div style={styles.debugScroll}>
            {debugLog.length === 0 ? (
              <div style={styles.debugEmpty}>No log entries yet</div>
            ) : (
              debugLog.map((entry, i) => (
                <div key={i} style={styles.debugLine}>
                  <span style={styles.debugTime}>{entry.time}</span>
                  <span style={{
                    ...styles.debugLevel,
                    color: entry.level === 'error' ? '#ef4444' : entry.level === 'warn' ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                  }}>
                    {entry.level.toUpperCase()}
                  </span>
                  <span style={styles.debugMsg}>{entry.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyles.cell}>
      <div style={metricStyles.label}>{label}</div>
      <div style={metricStyles.value}>{value}</div>
    </div>
  )
}

const metricStyles: Record<string, React.CSSProperties> = {
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.4)',
  },
  value: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '1280px',
    margin: '0 auto',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    marginBottom: '8px',
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#0a0a0a',
    backgroundColor: '#22c55e',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
  },
  debugToggle: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.5)',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'ui-monospace, "SF Mono", monospace',
  },
  retryButton: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  container: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#000',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  video: {
    width: '100%',
    display: 'block',
    cursor: 'pointer',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    background: 'rgba(0,0,0,0.7)',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: '#22c55e',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  overlayText: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center' as const,
    maxWidth: '400px',
    lineHeight: '1.5',
  },
  failedIcon: {
    fontSize: '36px',
    color: '#ef4444',
    fontWeight: 700,
  },
  retryButtonLarge: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  bigPlayOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'rgba(0,0,0,0.3)',
  },
  bigPlayButton: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    color: '#000',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
    padding: '30px 16px 12px',
    transition: 'opacity 0.3s ease',
  },
  buttonsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  rightButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    color: '#e50914',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  volumeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  volumeSlider: {
    width: '70px',
    height: '3px',
    cursor: 'pointer',
    accentColor: '#22c55e',
  },
  metricsPanel: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  metricsTitle: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '12px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  debugPanel: {
    marginTop: '16px',
    backgroundColor: '#0d1117',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  debugHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  debugTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.4)',
  },
  debugClear: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.4)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    cursor: 'pointer',
  },
  debugScroll: {
    maxHeight: '240px',
    overflowY: 'auto' as const,
    padding: '8px 0',
  },
  debugEmpty: {
    padding: '16px',
    textAlign: 'center' as const,
    color: 'rgba(255,255,255,0.2)',
    fontSize: '12px',
  },
  debugLine: {
    display: 'flex',
    gap: '8px',
    padding: '2px 12px',
    fontSize: '11px',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
    lineHeight: '1.6',
  },
  debugTime: {
    color: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  debugLevel: {
    fontWeight: 600,
    width: '40px',
    flexShrink: 0,
  },
  debugMsg: {
    color: 'rgba(255,255,255,0.7)',
    wordBreak: 'break-all' as const,
  },
}
