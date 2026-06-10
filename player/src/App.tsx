import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Player } from './components/Player'
import { Monitor } from './components/Monitor'
import { Gallery } from './components/Gallery'

export default function App() {
  const location = useLocation()
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <span style={styles.logo}>OTT Lab</span>
        <Link
          to="/"
          style={{
            ...styles.link,
            ...(location.pathname === '/' ? styles.linkActive : {}),
          }}
        >
          Streams
        </Link>
        <span style={styles.clock}>
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </nav>

      <main style={styles.main}>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/stream/:stream" element={<Player />} />
          <Route path="/monitor/:stream" element={<Monitor />} />
        </Routes>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#fff',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '12px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontWeight: 700,
    fontSize: '16px',
    color: '#fff',
    letterSpacing: '-0.3px',
  },
  link: {
    color: 'rgba(255,255,255,0.5)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'color 0.2s',
  },
  linkActive: {
    color: '#fff',
  },
  clock: {
    marginLeft: 'auto',
    fontSize: '13px',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
    color: 'rgba(255,255,255,0.4)',
  },
  main: {
    padding: '24px',
  },
}
