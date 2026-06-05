# Chapter 1 — "We Need to Go Live"

## Overview

The first chapter of the OTT platform: a live streaming pipeline running on a single LAN machine. OBS Studio streams to 5-10 browser-based viewers via an end-to-end path.

---

## Architecture

```
┌─────────────────┐      RTMP         ┌─────────────┐      RTMP         ┌─────────────┐
│  OBS Studio     │ ──────────────►   │  MediaMTX   │ ──────────────►   │   FFmpeg    │
│  (Publisher)    │   rtmp://localhost │  (RTMP      │   rtmp://localhost │  (Encoder + │
│                 │   :1935/live/     │   Ingest)   │   :1935/live/     │   Packager) │
│                 │   stream          │             │   stream          │             │
└─────────────────┘                   └─────────────┘                   └──────┬──────┘
                                                                              │
                                                                              │ HLS
                                                                              │ /live/stream.m3u8
                                                                              │ /live/*.ts
                                                                              ▼
┌─────────────────┐      HTTP        ┌─────────────┐      HTTP        ┌──────────────┐
│  Browser        │ ◄──────────────  │  React App  │ ◄──────────────  │   Nginx     │
│  (Viewer)       │   :5173          │  (HLS.js)   │   :8080          │  (HTTP      │
│                 │   Player UI      │  (Vite Dev) │   /live/*        │   Delivery) │
└─────────────────┘                   └─────────────┘                   └──────────────┘
```

### Data Flow

1. OBS Studio captures screen/camera and encodes to H.264/AAC
2. OBS pushes RTMP stream to MediaMTX at `rtmp://localhost:1935/live/stream`
3. MediaMTX receives the RTMP stream and re-publishes it
4. FFmpeg reads from MediaMTX via `rtmp://localhost:1935/live/stream`
5. FFmpeg re-encodes/transcodes to H.264/AAC (720p30, 2-4 Mbps)
6. FFmpeg packages output as HLS: 6-second `.ts` segments + `.m3u8` manifest
7. Segments written to `stream/`
8. Nginx serves static HLS files from that directory on port 8080
9. React app (Vite dev server on `:5173`) fetches manifest from Nginx
10. HLS.js in browser reads manifest, downloads segments, plays video

### Components

| Component | Technology | Purpose | Port |
|-----------|------------|---------|------|
| **Source** | OBS Studio | Screen/camera capture, RTMP publish | N/A (client) |
| **RTMP Ingest** | MediaMTX v1.x | Receive and re-publish RTMP stream | 1935 (RTMP) |
| **Encoder/Packager** | FFmpeg 6.x+ | Re-encode + HLS packaging | N/A (process) |
| **HTTP Delivery** | Nginx 1.24+ | Static file serving + caching | 8080 (HTTP) |
| **Player** | React + Vite + HLS.js | Browser-based video playback | 5173 (dev) |

---

## Setup Instructions

### Prerequisites

- **OBS Studio** — Download from [obsproject.com](https://obsproject.com/)
- **FFmpeg** — Download from [ffmpeg.org](https://ffmpeg.org/download.html) (add to PATH)
- **Nginx** — Download from [nginx.org](https://nginx.org/en/download.html)
- **MediaMTX** — Download from [GitHub releases](https://github.com/bluenviron/mediamtx/releases)
- **Node.js** — v18+ required for React player

### 1. Install Dependencies

```bash
cd player
npm install
```

### 2. Start MediaMTX (RTMP Ingest)

```bash
cd mediamtx
mediamtx mediamtx.yml
```

MediaMTX will start listening on port 1935 for RTMP connections.

### 3. Start FFmpeg (Encoder + Packager)

```bash
cd ffmpeg
bash stream.sh
```

FFmpeg waits for an RTMP stream from MediaMTX.

### 4. Start Nginx (HTTP Delivery)

PowerShell / Command Prompt:

```powershell
cd nginx
start-nginx.cmd
```

Git Bash:

```bash
cd nginx
/c/tools/nginx-1.31.1/nginx.exe -p "D:/ott-lab/nginx/" -c "D:/ott-lab/nginx/nginx.conf"
```

Nginx serves HLS files on port 8080.

### 5. Start React Player

```bash
cd player
npm run dev
```

Vite dev server starts on port 5173.

### 6. Configure OBS Studio

1. Open OBS Studio
2. Go to **Settings → Stream**
3. Set **Stream Type** to `Custom`
4. Set **Server** to `rtmp://localhost:1935/live`
5. Set **Stream Key** to `stream`
6. Click **Apply** and **OK**
7. Click **Start Streaming**

### 7. View the Stream

Open your browser to [http://localhost:5173](http://localhost:5173)

The video should auto-play with a 6-12 second delay from OBS.

---

## Encoding Parameters

```bash
ffmpeg -i rtmp://localhost:1935/live/stream \
  -c:v libx264 \
  -preset veryfast \
  -tune zerolatency \
  -b:v 3500k \
  -maxrate 4000k \
  -bufsize 6000k \
  -c:a aac \
  -b:a 128k \
  -ar 44100 \
  -f hls \
  -hls_time 6 \
  -hls_list_size 10 \
  -hls_flags delete_segments+append_list+temp_file \
  -hls_segment_filename "stream/segment_%03d.ts" \
  "stream/stream.m3u8"
```

**Key FFmpeg Flags:**
- `-preset veryfast` — fast encoding, minimal latency
- `-tune zerolatency` — optimize for live streaming
- `-hls_time 6` — 6-second segments
- `-hls_list_size 10` — keep 10 segments in playlist (60s window)
- `-hls_flags delete_segments` — remove old segments automatically
- `-hls_flags append_list` — append to playlist (not overwrite)
- `-hls_flags temp_file` — write to `.tmp` then rename (fixes Windows file locking)

---

## Key Decisions & Trade-offs

### HLS vs DASH

| | HLS | DASH |
|---|---|---|
| **Decision** | ✅ Selected | |
| **Why** | Industry standard for OTT, native Safari support, widely adopted | |
| **Trade-off** | Higher latency (6-30s) | Lower latency (2-5s with LL-DASH) |

### Segment Duration (6s vs shorter)

| | 6 seconds | 2-4 seconds |
|---|---|---|
| **Decision** | ✅ Selected | |
| **Why** | Standard for HLS, good balance of latency and overhead | |
| **Trade-off** | 6s latency | More HTTP requests, higher overhead |

### MediaMTX vs Nginx-RTMP

| | MediaMTX | Nginx-RTMP |
|---|---|---|
| **Decision** | ✅ Selected | |
| **Why** | Modern, actively maintained, lightweight, easy configuration | |
| **Trade-off** | Extra process | More complex Nginx config |

### Single Quality vs ABR

| | Single 720p | Adaptive Bitrate |
|---|---|---|
| **Decision** | ✅ Selected | |
| **Why** | Simplicity for Chapter 1, demonstrates core pipeline | |
| **Trade-off** | No adaptive streaming | Multiple quality levels (more complex) |

### Bare-metal vs Docker

| | Bare-metal | Docker |
|---|---|---|
| **Decision** | ✅ Selected | |
| **Why** | Simplicity for Chapter 1, no Docker overhead | |
| **Trade-off** | Manual setup | Reproducible Docker environment |

---

## Troubleshooting

### MediaMTX won't start
- Check if port 1935 is already in use: `netstat -an | grep 1935`
- Ensure the `mediamtx.yml` config is in the same directory as the binary

### FFmpeg can't connect to RTMP
- Ensure MediaMTX is running and accepting connections
- Check OBS is configured with correct RTMP URL and stream key

### Nginx returns 404 for HLS files
- Verify the `stream/` directory contains `.m3u8` and `.ts` files
- Check Nginx config path aliases are correct

### Player shows black screen
- Ensure Nginx is running on port 8080
- Open browser DevTools → Console for HLS.js errors
- Check Network tab for failed segment requests

### Video buffers or stutters
- Reduce FFmpeg bitrate: change `-b:v 3500k` to `-b:v 2000k`
- Increase `hls_list_size` for more buffer: `-hls_list_size 10`

### Manifest not updating (stale segments)
- FFmpeg may be writing to `.tmp` file due to Windows file locking
- This is normal — the `temp_file` flag handles this automatically

---

## Checkpoint Validation

- [ ] Live stream plays in browser
- [ ] Holds up with 5-10 viewers
- [ ] Full path traceable: OBS → MediaMTX → FFmpeg → Nginx → Browser
- [ ] Half-page write-up complete
