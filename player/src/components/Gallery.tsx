import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAllStreams } from '../hooks/useLiveStreams'

export function Gallery() {
  const navigate = useNavigate()
  const { streams, live, loading } = useAllStreams()
  const [keyInput, setKeyInput] = useState('')

  const watchByKey = (e: React.FormEvent) => {
    e.preventDefault()
    const key = keyInput
      .trim()
      .replace(/^\/live\//, '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
    if (!key) return
    navigate(`/stream/${key}`)
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Live Streams</h1>
        <p style={styles.subtitle}>Select a stream to watch</p>
      </div>

      <form style={styles.watchForm} onSubmit={watchByKey}>
        <input
          style={styles.watchInput}
          type="text"
          placeholder="Watch by stream key (e.g. backstage)"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
        />
        <button style={styles.watchButton} type="submit">Watch</button>
      </form>

      <div style={styles.grid}>
        {streams.map((s) => {
          const isLive = live.has(s.name)
          return (
            <div key={s.name} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={isLive ? styles.liveBadge : styles.idleBadge}>
                  {isLive ? 'LIVE' : 'IDLE'}
                </span>
                <span style={styles.streamName}>{s.label}</span>
              </div>
              <div style={styles.cardBody}>
                <div style={styles.placeholder}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8" />
                    <path d="M12 17v4" />
                    <polygon points="10,8 16,11 10,14" fill="rgba(255,255,255,0.2)" />
                  </svg>
                </div>
              </div>
              <div style={styles.cardActions}>
                <Link to={`/stream/${s.name}`} style={styles.actionLink}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  HLS Player
                </Link>
                <Link to={`/monitor/${s.name}`} style={{ ...styles.actionLink, ...styles.actionLinkSecondary }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  OPS Monitor
                </Link>
              </div>
            </div>
          )
        })}
        {streams.length === 0 && !loading && (
          <div style={styles.empty}>
            <p style={styles.emptyText}>No streams available.</p>
            <p style={styles.emptyHint}>Start OBS and push to rtmp://&lt;host&gt;:1935/live/&lt;key&gt;</p>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '1280px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.4)',
    margin: '8px 0 0 0',
  },
  watchForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
  },
  watchInput: {
    flex: 1,
    maxWidth: '360px',
    padding: '10px 14px',
    fontSize: '14px',
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    outline: 'none',
  },
  watchButton: {
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#000',
    backgroundColor: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 20px 0',
  },
  liveBadge: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#fff',
    backgroundColor: '#e50914',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  idleBadge: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  streamName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },
  cardBody: {
    padding: '20px',
  },
  placeholder: {
    aspectRatio: '16/9',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    padding: '0 20px 20px',
  },
  actionLink: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    color: '#000',
    backgroundColor: '#fff',
    transition: 'opacity 0.2s',
  },
  actionLinkSecondary: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center' as const,
    padding: '60px 20px',
  },
  emptyText: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.5)',
    margin: 0,
  },
  emptyHint: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.3)',
    margin: '8px 0 0 0',
  },
}
