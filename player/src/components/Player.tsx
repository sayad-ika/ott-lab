import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Hls from 'hls.js'

interface AdBreakStatus {
  state: string
  ad: string
  elapsed: number
  totalDuration: number
  remaining: number
}

export function Player() {
  const { stream = 'stream' } = useParams<{ stream: string }>()
  const hlsUrl = `/live/${stream}/stream.m3u8`
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [adBreak, setAdBreak] = useState<AdBreakStatus | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl
      video.play()
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
      })
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
      })
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      hlsRef.current?.destroy()
    }
  }, [hlsUrl])

  // Poll ad break status
  useEffect(() => {
    const poll = () => {
      fetch(`/ad-break/status`)
        .then(r => r.json())
        .then(data => {
          const status = data[stream]
          setAdBreak(status && status.state !== 'live' ? status : null)
        })
        .catch(() => setAdBreak(null))
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [stream])

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      showControlsTemporarily()
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowUp': e.preventDefault(); changeVolume(0.05); break
        case 'ArrowDown': e.preventDefault(); changeVolume(-0.05); break
        case 'm': e.preventDefault(); toggleMute(); break
        case 'f': e.preventDefault(); toggleFullscreen(); break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showControlsTemporarily])

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

  return (
    <div ref={containerRef} style={styles.container}>
      <video ref={videoRef} style={styles.video} onClick={togglePlay} autoPlay muted />

      {!isPlaying && (
        <div style={styles.bigPlayOverlay} onClick={togglePlay}>
          <div style={styles.bigPlayButton}>▶</div>
        </div>
      )}

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

            <span style={adBreak ? styles.adBadge : styles.liveBadge}>
              {adBreak ? (
                <>
                  <span style={styles.adDot} /> AD ({Math.ceil(adBreak.remaining)}s)
                </>
              ) : (
                <>
                  <span style={styles.liveDot} /> LIVE
                </>
              )}
            </span>
          </div>

          <div style={styles.rightButtons}>
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
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: '1280px',
    margin: '0 auto',
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
    backgroundColor: '#e50914',
  },
  adBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    color: '#ffc107',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    backgroundColor: 'rgba(255,193,7,0.15)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  adDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#ffc107',
    animation: 'pulse 1s ease-in-out infinite',
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
    accentColor: '#e50914',
  },
}
