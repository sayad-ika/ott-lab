import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Hls from 'hls.js'

interface AdSchedule {
  adStart: string
  duration: number
  assetUri: string
  label?: string
}

// Inject an HLS interstitial tag into the live manifest so HLS.js plays the
// scheduled ad in-place, then returns to live. Idempotent and time-boxed: it
// only injects while the ad window is still relevant (not long after it played).
function injectAd(text: string, s: AdSchedule | null): string {
  if (!s || text.includes('ID="ad-1"')) return text
  const startMs = Date.parse(s.adStart)
  if (Number.isNaN(startMs) || Date.now() > startMs + s.duration * 1000 + 60000) return text
  const tag =
    '#EXT-X-DATERANGE:ID="ad-1",CLASS="com.apple.hls.interstitial",' +
    `START-DATE="${s.adStart}",DURATION=${s.duration},X-ASSET-URI="${s.assetUri}"`
  // ponytail: temp debug log - confirms the tag is injected on each playlist
  // load. Remove once ad playback is verified.
  console.log('[interstitial] injecting tag for', s.adStart)
  return text.replace(/^(#EXTM3U\r?\n)/, `$1${tag}\n`)
}

// Custom playlist loader: rewrites ONLY the /live/ manifest response to append
// the interstitial tag. The ad asset's own playlist (served from /ads/) is left
// untouched so we don't recurse into it.
function createAdPLoader(getSchedule: () => AdSchedule | null) {
  return class AdPLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config)
      const load = this.load.bind(this)
      this.load = (context: any, config: any, callbacks: any) => {
        const url = String(context?.url ?? '')
        console.log('[ad] pLoader.load type=' + context?.type + ' url=' + url)
        // Inject on BOTH the initial manifest and live playlist reloads. A live
        // stream reloads as type 'level' every few seconds; injecting only on
        // 'manifest' lets the tag vanish on reload, and HLS.js then drops the
        // interstitial from the schedule - so the ad never fires.
        if ((context?.type === 'manifest' || context?.type === 'level') && url.includes('/live/')) {
          const orig = callbacks.onSuccess
          callbacks.onSuccess = (response: any, stats: any) => {
            if (typeof response.data === 'string') {
              response.data = injectAd(response.data, getSchedule())
            }
            orig(response, stats, context)
          }
        }
        load(context, config, callbacks)
      }
    }
  }
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
  const [inAd, setInAd] = useState(false)
  const scheduleRef = useRef<AdSchedule | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null
    let badgeTimer: ReturnType<typeof setInterval> | null = null

    async function init() {
      // Best-effort: read the ad schedule written by start.ps1. Missing or
      // unreadable => no ad, plain live playback.
      scheduleRef.current = null
      try {
        const res = await fetch(`/live/${stream}/ads.json`)
        console.log('[ad] fetch /live/' + stream + '/ads.json -> HTTP', res.status)
        if (res.ok) scheduleRef.current = (await res.json()) as AdSchedule
      } catch {
        scheduleRef.current = null
      }
      console.log('[ad] schedule =', scheduleRef.current)

      // Re-narrow after the await above (TS drops the earlier null-check across it).
      if (!video) return

      // Prefer HLS.js whenever MSE is supported, even if the browser also has
      // native HLS (e.g. desktop Safari): we need the custom pLoader to inject
      // the interstitial tag, and native HLS can't be rewritten client-side.
      // Native HLS is only the fallback for browsers without MSE (e.g. iOS).
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          console.log('[ad] native HLS fallback (no MSE) - no interstitial injection')
          video.src = hlsUrl
          video.play()
        }
        return
      }

      const AdPLoader = createAdPLoader(() => scheduleRef.current)
      hls = new Hls({
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        pLoader: AdPLoader,
        interstitialAppendInPlace: true,
        interstitialLiveLookAhead: 30,
      } as any)
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
      })

      // Best-effort "ADVERTISEMENT" indicator from the interstitials manager.
      badgeTimer = setInterval(() => {
        try {
          const mgr = (hls as any)?.interstitialsManager
          setInAd(!!mgr?.interstitialPlayer)
        } catch {
          /* ignore */
        }
      }, 500)
    }

    init()

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      if (badgeTimer) clearInterval(badgeTimer)
      if (hls) hls.destroy()
      hlsRef.current = null
    }
  }, [hlsUrl, stream])

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

            {inAd ? (
              <span style={styles.adBadge}>ADVERTISEMENT</span>
            ) : (
              <span style={styles.liveBadge}>
                <span style={styles.liveDot} /> LIVE
              </span>
            )}
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
    color: '#ffb400',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: '2px 8px',
    borderRadius: '4px',
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
