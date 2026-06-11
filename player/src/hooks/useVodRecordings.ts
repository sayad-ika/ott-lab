import { useEffect, useState } from 'react'
import { VOD_RECORDINGS, VodRecording } from '../config/vod'

/**
 * Fetches the VOD manifest from /vod/manifest.json at runtime.
 * Falls back to the hardcoded VOD_RECORDINGS if the fetch fails
 * (e.g. no manifest.json exists yet, server is down).
 */
export function useVodRecordings(): { recordings: VodRecording[]; loading: boolean } {
  const [recordings, setRecordings] = useState<VodRecording[]>(VOD_RECORDINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('/vod/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: VodRecording[]) => {
        if (!cancelled) {
          setRecordings(Array.isArray(data) ? data : [data])
        }
      })
      .catch(() => {
        // Silently fall back to hardcoded list
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { recordings, loading }
}
