import { useWhepStream, type ConnectionState } from '../hooks/useWhepStream'

interface OpsTileProps {
  streamName: string
  streamLabel: string
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`
  return `${bps} bps`
}

function stateColor(state: ConnectionState): string {
  switch (state) {
    case 'connected': return '#22c55e'
    case 'connecting': return '#f59e0b'
    case 'disconnected': return '#f59e0b'
    case 'failed': return '#ef4444'
    case 'closed': return '#6b7280'
    default: return '#6b7280'
  }
}

function stateLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected': return 'LIVE'
    case 'connecting': return 'CONNECTING'
    case 'disconnected': return 'RECONNECTING'
    case 'failed': return 'FAILED'
    case 'closed': return 'CLOSED'
    default: return 'INIT'
  }
}

export function OpsTile({ streamName, streamLabel }: OpsTileProps) {
  const { videoRef, connectionState, metrics, errorDetail, connect } = useWhepStream({ streamName })

  return (
    <div style={styles.tile}>
      {/* Video container */}
      <div style={styles.videoContainer}>
        <video ref={videoRef as React.RefObject<HTMLVideoElement>} style={styles.video} autoPlay muted playsInline />

        {/* State overlay for connecting/failed */}
        {connectionState === 'connecting' && (
          <div style={styles.stateOverlay}>
            <div style={styles.spinner} />
          </div>
        )}

        {connectionState === 'failed' && (
          <div style={styles.stateOverlay}>
            <div style={styles.failedIcon}>✕</div>
            <span style={styles.failedText}>{errorDetail ?? 'Stream unavailable'}</span>
            <button style={styles.retryButton} onClick={connect}>Retry</button>
          </div>
        )}

        {/* Top-left: stream label + state dot */}
        <div style={styles.topLeft}>
          <span style={{ ...styles.stateDot, backgroundColor: stateColor(connectionState) }} />
          <span style={styles.streamLabel}>{streamLabel}</span>
        </div>

        {/* Top-right: connection badge */}
        <div style={styles.topRight}>
          <span style={styles.connBadge}>
            <span style={{ ...styles.connDot, backgroundColor: stateColor(connectionState) }} />
            {stateLabel(connectionState)}
          </span>
        </div>

        {/* Bottom: compact metrics */}
        {metrics && connectionState === 'connected' && (
          <div style={styles.metricsBar}>
            <MetricItem label="RES" value={metrics.resolution} />
            <MetricItem label="FPS" value={`${metrics.fps}`} />
            <MetricItem label="BIT" value={formatBitrate(metrics.bitrate)} />
            <MetricItem label="RTT" value={`${(metrics.rtt * 1000).toFixed(0)}ms`} />
          </div>
        )}
      </div>
    </div>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metricItem}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={styles.metricValue}>{value}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  tile: {
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#000',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    display: 'block',
  },
  stateOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    background: 'rgba(0,0,0,0.75)',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: '#22c55e',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  failedIcon: {
    fontSize: '28px',
    color: '#ef4444',
    fontWeight: 700,
  },
  failedText: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center' as const,
    maxWidth: '240px',
    lineHeight: '1.4',
  },
  retryButton: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  topLeft: {
    position: 'absolute',
    top: '10px',
    left: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  stateDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  streamLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },
  topRight: {
    position: 'absolute',
    top: '10px',
    right: '10px',
  },
  connBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '3px 8px',
    borderRadius: '4px',
    backdropFilter: 'blur(4px)',
  },
  connDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  metricsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    gap: '2px',
    padding: '6px 10px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
  },
  metricItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: '3px',
  },
  metricLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.3px',
  },
  metricValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
}
