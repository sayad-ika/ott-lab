// ad-proxy.mjs -- HLS manifest proxy that injects ad breaks into live streams.
//
// Normal operation: proxies stream/<name>/stream.m3u8 from FFmpeg as-is.
// Ad break: injects #EXT-X-DISCONTINUITY + ad segments into the manifest,
// then returns to live after all ad segments have been served.
//
// Endpoints:
//   GET  /live/<name>/stream.m3u8   -> proxied or ad-injected manifest
//   GET  /live/<name>/<segment>.ts  -> proxied live segment
//   GET  /ads/<ad>/<segment>.ts     -> ad segment files
//   POST /ad-break/<stream>         -> start ad break  (body: {ad: "<name>"})
//   DELETE /ad-break/<stream>       -> cancel ad break
//   GET  /ad-break/status           -> JSON status of all streams

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STREAM_DIR = path.join(ROOT, 'stream')
const ADS_DIR = path.join(ROOT, 'ads', 'prepared')

const PORT = parseInt(process.env.AD_PROXY_PORT || '8081', 10)

// ── Ad break state per stream ──
const breaks = new Map()
// breaks.get(name) = {
//   state: 'live' | 'playing' | 'transition_out',
//   ad: string,
//   adSegments: [{file, duration}],
//   adTotalDuration: number,
//   adStartTime: number,          // Date.now() when ad break started
//   transitionOutTime: number,
//   adWindowStartSeq: number,     // MEDIA-SEQUENCE for lastLiveSegments[0]
//   frozenTargetDuration: number, // TARGETDURATION from live at break start
//   lastLiveSegments: [{file, duration}],  // last 3 live segments at break start
//   liveSegmentsAtBreakEnd: [{file, duration}],  // set when transitioning out
//   liveSeqAtBreakEnd: number,    // set when transitioning out
// }

// ── Helpers ──

function parseM3u8(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '')
  const segments = []
  let targetDuration = 6
  let mediaSequence = 0
  let currentDuration = 0

  for (const line of lines) {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseFloat(line.split(':')[1])
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.split(':')[1], 10)
    } else if (line.startsWith('#EXTINF:')) {
      currentDuration = parseFloat(line.split(':')[1].split(',')[0])
    } else if (line.endsWith('.ts') && !line.startsWith('#')) {
      segments.push({ file: line, duration: currentDuration })
      currentDuration = 0
    }
  }
  return { targetDuration, mediaSequence, segments }
}

function parseAdPlaylist(adDir) {
  const playlistPath = path.join(adDir, 'playlist.m3u8')
  if (!fs.existsSync(playlistPath)) return null
  const text = fs.readFileSync(playlistPath, 'utf-8')
  return parseM3u8(text)
}

function readLiveManifest(streamName) {
  const manifestPath = path.join(STREAM_DIR, streamName, 'stream.m3u8')
  if (!fs.existsSync(manifestPath)) return null
  return fs.readFileSync(manifestPath, 'utf-8')
}

// Build manifest during ad playback.
// Key: MEDIA-SEQUENCE is frozen, ad segments are progressively revealed.
function buildAdManifest(brk) {
  const elapsed = (Date.now() - brk.adStartTime) / 1000
  const segPrefix = `ads/${brk.ad}/`

  // Determine how many ad segments should be visible by now.
  // We reveal one segment at a time based on elapsed time, simulating a live stream.
  let cumulativeTime = 0
  let visibleAdCount = 0
  for (let i = 0; i < brk.adSegments.length; i++) {
    cumulativeTime += brk.adSegments[i].duration
    if (elapsed + brk.frozenTargetDuration >= cumulativeTime) {
      visibleAdCount = i + 1
    }
  }
  // Always show at least 1, at most all
  visibleAdCount = Math.max(1, Math.min(visibleAdCount, brk.adSegments.length))

  const visibleAd = brk.adSegments.slice(0, visibleAdCount)
  const adMaxDur = Math.max(...visibleAd.map(s => s.duration), brk.frozenTargetDuration)

  // Prefix ad segment paths so HLS.js resolves them correctly
  const adSegsPrefixed = visibleAd.map(s => ({ ...s, file: `ads/${brk.ad}/${s.file}` }))

  // Total segments: last 3 live + all visible ad segments
  const allSegments = [...brk.lastLiveSegments, ...adSegsPrefixed]
  const windowSize = 6 // keep a sliding window like FFmpeg's hls_list_size
  const windowed = allSegments.slice(-windowSize)
  const seqOffset = allSegments.length - windowed.length
  const currentSeq = brk.adWindowStartSeq + seqOffset

  const lines = []
  lines.push('#EXTM3U')
  lines.push('#EXT-X-VERSION:3')
  lines.push(`#EXT-X-TARGETDURATION:${adMaxDur}`)
  lines.push(`#EXT-X-MEDIA-SEQUENCE:${currentSeq}`)

  let pastLiveBoundary = false
  for (const seg of windowed) {
    // Insert DISCONTINUITY before the first ad segment
    if (!pastLiveBoundary && seg.file.startsWith('ads/')) {
      lines.push('#EXT-X-DISCONTINUITY')
      pastLiveBoundary = true
    }
    lines.push(`#EXTINF:${seg.duration},`)
    lines.push(seg.file)
  }

  return lines.join('\n') + '\n'
}

// Build manifest during transition back to live.
// Keep this as the current live manifest. The ad playlist already exposed the
// live -> ad discontinuity, and switching to the latest live edge avoids
// assigning live media sequence numbers to ad segments.
function buildTransitionOutManifest(brk) {
  const liveText = readLiveManifest(brk.streamName)
  if (!liveText) return null
  return liveText
}

// ── State machine ──

function getState(streamName) {
  if (!breaks.has(streamName)) {
    return { state: 'live' }
  }
  return breaks.get(streamName)
}

function startAdBreak(streamName, adName) {
  const adDir = path.join(ADS_DIR, adName)
  if (!fs.existsSync(path.join(adDir, 'playlist.m3u8'))) {
    return { error: `Ad '${adName}' not found in ${ADS_DIR}` }
  }

  const liveText = readLiveManifest(streamName)
  if (!liveText) {
    return { error: `No live manifest found for stream '${streamName}'` }
  }

  const live = parseM3u8(liveText)
  const adParsed = parseAdPlaylist(adDir)
  if (!adParsed) {
    return { error: `Could not parse ad playlist for '${adName}'` }
  }

  const adTotalDuration = adParsed.segments.reduce((sum, s) => sum + s.duration, 0)
  const retainedLiveSegments = live.segments.slice(-3)
  const adWindowStartSeq = live.mediaSequence + Math.max(0, live.segments.length - retainedLiveSegments.length)

  const brk = {
    state: 'playing',
    streamName,
    ad: adName,
    adSegments: adParsed.segments,
    adTotalDuration,
    adStartTime: Date.now(),
    transitionOutTime: 0,
    adWindowStartSeq,
    frozenTargetDuration: live.targetDuration,
    lastLiveSegments: retainedLiveSegments,
  }

  breaks.set(streamName, brk)
  return { ok: true, stream: streamName, ad: adName, duration: adTotalDuration }
}

function cancelAdBreak(streamName) {
  if (!breaks.has(streamName)) {
    return { error: `No active ad break for stream '${streamName}'` }
  }
  const brk = breaks.get(streamName)
  brk.state = 'transition_out'
  brk.transitionOutTime = Date.now()
  return { ok: true, stream: streamName }
}

function checkAdBreakExpiry(streamName) {
  const brk = breaks.get(streamName)
  if (!brk) return

  if (brk.state === 'playing') {
    const elapsed = (Date.now() - brk.adStartTime) / 1000
    if (elapsed >= brk.adTotalDuration + 2) {
      brk.state = 'transition_out'
      brk.transitionOutTime = Date.now()
    }
  }

  if (brk.state === 'transition_out') {
    const elapsed = (Date.now() - brk.transitionOutTime) / 1000
    // Stay long enough for HLS.js to fetch the DISCONTINUITY boundary
    // and buffer at least 2 live segments (~12s)
    if (elapsed >= 18) {
      brk.state = 'live'
      breaks.delete(streamName)
    }
  }
}

// ── HTTP handler ──

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

function sendM3u8(res, text) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(text)
}

function sendTsFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const stat = fs.statSync(filePath)
  res.writeHead(200, {
    'Content-Type': 'video/mp2t',
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
  })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // ── Ad break API ──
  const breakMatch = url.pathname.match(/^\/ad-break\/([^/]+)$/)
  if (breakMatch) {
    const streamName = breakMatch[1]

    if (req.method === 'POST') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        let params = {}
        try { params = JSON.parse(body) } catch {}
        const adName = params.ad || 'MW4'
        const result = startAdBreak(streamName, adName)
        sendJson(res, result.error ? 400 : 200, result)
      })
      return
    }

    if (req.method === 'DELETE') {
      const result = cancelAdBreak(streamName)
      sendJson(res, result.error ? 404 : 200, result)
      return
    }
  }

  // ── Status endpoint ──
  if (url.pathname === '/ad-break/status') {
    const status = {}
    for (const [name, brk] of breaks) {
      const elapsed = (Date.now() - brk.adStartTime) / 1000
      status[name] = {
        state: brk.state,
        ad: brk.ad,
        elapsed: Math.round(elapsed * 10) / 10,
        totalDuration: brk.adTotalDuration,
        remaining: Math.max(0, Math.round((brk.adTotalDuration - elapsed) * 10) / 10),
      }
    }
    sendJson(res, 200, status)
    return
  }

  // ── Ad segment files (root level or nested under /live/<stream>/ads/) ──
  // HLS.js resolves relative URLs against the manifest URL.
  // Manifest at /live/stream/stream.m3u8 + segment "ads/MW4/seg.ts"
  // => HLS.js requests /live/stream/ads/MW4/seg.ts
  const adsMatch = url.pathname.match(/(?:^\/ads|^\/live\/[^/]+\/ads)\/([^/]+)\/(.+\.ts)$/)
  if (adsMatch) {
    const [, adName, segFile] = adsMatch
    const filePath = path.join(ADS_DIR, adName, segFile)
    sendTsFile(res, filePath)
    return
  }

  // ── Live HLS proxy ──
  const liveMatch = url.pathname.match(/^\/live\/([^/]+)\/(.+)$/)
  if (liveMatch) {
    const [, streamName, fileName] = liveMatch

    if (fileName === 'stream.m3u8') {
      checkAdBreakExpiry(streamName)
      const brk = getState(streamName)
      const liveText = readLiveManifest(streamName)

      if (!liveText) {
        sendJson(res, 404, { error: 'Stream not found' })
        return
      }

      if (brk.state === 'playing') {
        const adManifest = buildAdManifest(brk)
        sendM3u8(res, adManifest)
        return
      }

      if (brk.state === 'transition_out') {
        const outManifest = buildTransitionOutManifest(brk)
        sendM3u8(res, outManifest || liveText)
        return
      }

      // Normal live
      sendM3u8(res, liveText)
      return
    }

    // Segment file
    if (fileName.endsWith('.ts')) {
      const filePath = path.join(STREAM_DIR, streamName, fileName)
      sendTsFile(res, filePath)
      return
    }
  }

  // ── 404 ──
  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`Ad proxy listening on http://localhost:${PORT}`)
  console.log(`  Live HLS:   GET  /live/<stream>/stream.m3u8`)
  console.log(`  Ad segments: GET  /ads/<ad>/<file>.ts`)
  console.log(`  Start break: POST /ad-break/<stream> {"ad":"<name>"}`)
  console.log(`  Stop break:  DELETE /ad-break/<stream>`)
  console.log(`  Status:      GET  /ad-break/status`)
})
