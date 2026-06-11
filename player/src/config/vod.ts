export interface VodRecording {
  id: string         // Directory name in vod/ (e.g., "stream_2026-06-10_15-18-10")
  stream: string     // Source stream name
  label: string      // Human-readable title
  recordedAt: string // ISO date string for display
  duration?: string  // Approximate duration (optional, for display)
}

export const VOD_RECORDINGS: VodRecording[] = [
  {
    id: 'stream_2026-06-10_15-18-10',
    stream: 'stream',
    label: 'Main Camera — Jun 10, 2026',
    recordedAt: '2026-06-10T15:18:10',
  },
]
