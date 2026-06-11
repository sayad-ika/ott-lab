import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation, useParams } from 'react-router-dom'
import { Player } from './components/Player'
import { Monitor } from './components/Monitor'
import { Gallery } from './components/Gallery'
import { VodLibrary } from './components/VodLibrary'
import { VodPlayer } from './components/VodPlayer'
import { VOD_RECORDINGS } from './config/vod'

function VodPlayerPage() {
  const { id } = useParams<{ id: string }>()
  const recording = VOD_RECORDINGS.find((r) => r.id === id)
  if (!recording) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.5)' }}>
        <h2>Recording not found</h2>
        <p><Link to="/vod" style={{ color: '#e50914' }}>Back to On Demand</Link></p>
      </div>
    )
  }
  return <VodPlayer url={`/vod/${recording.id}/index.m3u8`} title={recording.label} />
}

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
        <Link
          to="/vod"
          style={{
            ...styles.link,
            ...(location.pathname.startsWith('/vod') ? styles.linkActive : {}),
          }}
        >
          On Demand
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
          <Route path="/vod" element={<VodLibrary />} />
          <Route path="/vod/:id" element={<VodPlayerPage />} />
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
