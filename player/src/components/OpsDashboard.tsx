import { STREAMS } from '../config/streams'
import { OpsTile } from './OpsTile'

export function OpsDashboard() {
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>OPS Monitor</h1>
        <p style={styles.subtitle}>Real-time stream health overview</p>
      </div>
      <div style={styles.grid}>
        {STREAMS.map((s) => (
          <OpsTile key={s.name} streamName={s.name} streamLabel={s.label} />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
    gap: '16px',
  },
}
