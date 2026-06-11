import { useEffect, useRef, useState, useCallback } from 'react'

export interface StreamMetrics {
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

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

interface UseWhepStreamOptions {
  streamName: string
}

interface UseWhepStreamReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  connectionState: ConnectionState
  metrics: StreamMetrics | null
  errorDetail: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

export function useWhepStream({ streamName }: UseWhepStreamOptions): UseWhepStreamReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const sessionUrlRef = useRef<string | null>(null)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastBytesRef = useRef<{ bytes: number; timestamp: number } | null>(null)

  const [connectionState, setConnectionState] = useState<ConnectionState>('new')
  const [metrics, setMetrics] = useState<StreamMetrics | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const errorSetRef = useRef(false)

  const whepUrl = `http://${window.location.hostname}:8889/live/${streamName}/whep`

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

  const connect = useCallback(async () => {
    disconnect()
    setErrorDetail(null)
    errorSetRef.current = false

    const pc = new RTCPeerConnection()
    peerConnectionRef.current = pc
    setConnectionState('connecting')

    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    pc.ontrack = (evt) => {
      if (videoRef.current && evt.streams[0]) {
        videoRef.current.srcObject = evt.streams[0]
        videoRef.current.play().catch(() => { /* autoplay may be blocked */ })
      }
    }

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState as ConnectionState)
    }

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })

      if (response.status !== 201) {
        const errBody = await response.text()
        let friendlyError = `Server returned HTTP ${response.status}`
        try {
          const parsed = JSON.parse(errBody)
          if (parsed.error) {
            friendlyError = parsed.error
            if (parsed.error.includes('no stream')) {
              friendlyError = `No stream available — is a device streaming to rtmp://<host>:1935/live/${streamName}?`
            }
          }
        } catch { /* not JSON */ }

        setErrorDetail(friendlyError)
        throw new Error(friendlyError)
      }

      const answerSdp = await response.text()
      const locationHeader = response.headers.get('location')
      sessionUrlRef.current = new URL(locationHeader!, whepUrl).toString()

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
      )

      pc.onicecandidate = (evt) => {
        if (evt.candidate && sessionUrlRef.current) {
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
          }).catch(() => { /* best effort */ })
        }
      }

      startStatsCollection(pc)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!errorSetRef.current) {
        setErrorDetail(msg)
        errorSetRef.current = true
      }
      setConnectionState('failed')
    }
  }, [disconnect, startStatsCollection, whepUrl, streamName])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    videoRef,
    connectionState,
    metrics,
    errorDetail,
    connect,
    disconnect,
  }
}
