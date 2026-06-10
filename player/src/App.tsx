import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Player } from './components/Player'
import { Monitor } from './components/Monitor'

function App() {
  const location = useLocation()
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>▶</span>
            <span style={styles.logoText}>OTT Lab</span>
          </div>
          <nav style={styles.nav}>
            <Link
              to="/"
              style={{
                ...styles.navLink,
                color: location.pathname === '/' ? '#fff' : 'rgba(255,255,255,0.6)',
                backgroundColor: location.pathname === '/' ? 'rgba(255,255,255,0.1)' : 'transparent',
              }}
            >
              Stream (HLS)
            </Link>
            <Link
              to="/monitor"
              style={{
                ...styles.navLink,
                color: location.pathname === '/monitor' ? '#fff' : 'rgba(255,255,255,0.6)',
                backgroundColor: location.pathname === '/monitor' ? 'rgba(255,255,255,0.1)' : 'transparent',
              }}
            >
              Monitor (WebRTC)
            </Link>
          </nav>
          <span style={styles.clock}>
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>
      </header>
      <main style={styles.main}>
        <Routes>
          <Route path="/" element={<Player />} />
          <Route path="/monitor" element={<Monitor />} />
        </Routes>
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
    padding: '12px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
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
  nav: {
    display: 'flex',
    gap: '4px',
  },
  navLink: {
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: '6px',
    transition: 'color 0.2s, background-color 0.2s',
  },
  clock: {
    marginLeft: 'auto',
    fontSize: '13px',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.5px',
  },
  main: {
    padding: '32px 24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
}

export default App
