import { Link } from 'react-router-dom'
import { useVodRecordings } from '../hooks/useVodRecordings'

export function VodLibrary() {
  const { recordings } = useVodRecordings()

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>On Demand</h1>
        <p style={styles.subtitle}>Select a recording to watch</p>
      </div>
      <div style={styles.grid}>
        {recordings.map((r) => (
          <div key={r.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.badge}>VOD</span>
              <span style={styles.streamName}>{r.label}</span>
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
              <div style={styles.meta}>
                <span style={styles.metaItem}>
                  {new Date(r.recordedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {r.duration && <span style={styles.metaItem}>{r.duration}</span>}
              </div>
            </div>
            <div style={styles.cardActions}>
              <Link to={`/vod/${r.id}`} style={styles.actionLink}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Watch
              </Link>
            </div>
          </div>
        ))}
        {recordings.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyText}>No recordings available yet.</p>
            <p style={styles.emptyHint}>Recordings will appear here after packaging with package-vod.ps1</p>
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
    marginBottom: '32px',
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
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#000',
    backgroundColor: '#4ade80',
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
  meta: {
    display: 'flex',
    gap: '16px',
    marginTop: '12px',
  },
  metaItem: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.4)',
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
