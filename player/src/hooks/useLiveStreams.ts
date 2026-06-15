import { useEffect, useState } from 'react'
import { STREAMS, StreamConfig } from '../config/streams'

interface PathItem {
  name: string
}

interface PathsListResponse {
  items?: PathItem[]
}

/**
 * Polls the MediaMTX REST API (proxied through nginx at /api/) to discover
 * which stream keys are currently being published.
 *
 * Tries the v3 API first, falls back to v2 (both expose `.items[].name`).
 * On error, keeps the last known set so a transient blip doesn't blank the UI.
 */
export function useLiveStreams(intervalMs = 3000): { live: Set<string>; loading: boolean } {
  const [live, setLive] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const endpoints = ['/api/v3/paths/list', '/api/v2/paths/list']

    const poll = async () => {
      let names: string[] | null = null
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { headers: { Accept: 'application/json' } })
          if (!res.ok) continue
          const data = (await res.json()) as PathsListResponse
          if (Array.isArray(data.items)) {
            names = data.items
              .map((it) => it?.name)
              .filter((n): n is string => typeof n === 'string' && n.length > 0)
            break
          }
        } catch {
          // try next endpoint
        }
      }

      if (!cancelled) {
        if (names) setLive(new Set(names))
        setLoading(false)
        timer = setTimeout(poll, intervalMs)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])

  return { live, loading }
}

/**
 * Merges the configured streams (always shown, even when offline) with any
 * additional stream keys that are currently being published. Dynamic keys
 * use the raw key as their label.
 */
export function useAllStreams(intervalMs = 3000): {
  streams: StreamConfig[]
  live: Set<string>
  loading: boolean
} {
  const { live, loading } = useLiveStreams(intervalMs)
  const dynamic = [...live].filter((n) => !STREAMS.some((s) => s.name === n))
  const streams: StreamConfig[] = [
    ...STREAMS,
    ...dynamic.map((name) => ({ name, label: name })),
  ]
  return { streams, live, loading }
}
