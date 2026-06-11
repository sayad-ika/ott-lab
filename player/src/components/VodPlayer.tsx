import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

interface VodPlayerProps {
  url: string    // e.g., "/vod/stream_2026-06-10_15-18-10/index.m3u8"
  title?: string
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VodPlayer({ url, title }: VodPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
    console.log('[VodPlayer] nativeHls:', nativeHls, 'Hls.isSupported:', Hls.isSupported())

    if (nativeHls && !Hls.isSupported()) {
      // Safari — native HLS
      video.src = url
    } else if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(url)
      hls.attachMedia(video)
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('[VodPlayer] HLS error:', data.type, data.details, data)
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('[VodPlayer] Fatal network error, attempting recovery...')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('[VodPlayer] Fatal media error, attempting recovery...')
              hls.recoverMediaError()
              break
            default:
              console.error('[VodPlayer] Unrecoverable error, destroying...')
              hls.destroy()
              break
          }
        }
      })
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onLoadedMetadata = () => setDuration(video.duration)
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
    }

    const onError = () => {
      const err = video.error
      console.error('[VodPlayer] Video error:', err?.code, err?.message)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('progress', onProgress)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('error', onError)
      hlsRef.current?.destroy()
    }
  }, [url])

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
        case 'ArrowRight': e.preventDefault(); seek(5); break
        case 'ArrowLeft': e.preventDefault(); seek(-5); break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showControlsTemporarily, duration])

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

  const seek = (delta: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + delta))
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
      {title && <div style={styles.titleBar}>{title}</div>}

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
        {/* Seek bar */}
        <div style={styles.seekRow}>
          <span style={styles.timeText}>{formatTime(currentTime)}</span>
          <div style={styles.seekContainer}>
            <div
              style={{
                ...styles.bufferedBar,
                width: duration > 0 ? `${(buffered / duration) * 100}%` : '0%',
              }}
            />
            <input
              type="range"
              className="vol-slider"
              min="0"
              max={duration || 0}
              step="0.1"
              value={currentTime}
              onChange={(e) => {
                const time = parseFloat(e.target.value)
                if (videoRef.current) videoRef.current.currentTime = time
                setCurrentTime(time)
              }}
              style={styles.seekSlider}
            />
          </div>
          <span style={styles.timeText}>{formatTime(duration)}</span>
        </div>

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

            <span style={styles.vodBadge}>VOD</span>
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
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '16px 20px',
    background: 'linear-gradient(rgba(0,0,0,0.7), transparent)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    zIndex: 2,
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
    zIndex: 1,
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
    zIndex: 2,
  },
  seekRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  seekContainer: {
    flex: 1,
    position: 'relative',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
  },
  bufferedBar: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    height: '4px',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: '2px',
    pointerEvents: 'none',
  },
  seekSlider: {
    width: '100%',
    height: '4px',
    cursor: 'pointer',
    accentColor: '#e50914',
    position: 'relative',
    zIndex: 1,
  },
  timeText: {
    fontSize: '12px',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
    color: 'rgba(255,255,255,0.7)',
    minWidth: '36px',
    textAlign: 'center',
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
  vodBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    color: '#4ade80',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.5px',
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
