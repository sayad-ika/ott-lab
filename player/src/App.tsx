import { Player } from './components/Player'

function App() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>▶</span>
          <span style={styles.logoText}>OTT Lab</span>
        </div>
      </header>
      <main style={styles.main}>
        <Player />
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    fontSize: '18px',
    color: '#e50914',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
  },
  main: {
    padding: '32px 24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
}

export default App
