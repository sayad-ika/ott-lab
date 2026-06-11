# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Greenfield OTT (Over-The-Top) platform built incrementally through chapters. Each chapter adds a new capability to the streaming pipeline, starting from a simple live stream and scaling to a cloud-ready architecture.

## Repository Structure

```
ott-lab/
├── scripts/
│   ├── start.cmd                  # One-command pipeline startup
│   ├── start.ps1                  # Full pipeline launcher
│   ├── stop.cmd                   # One-command pipeline shutdown
│   ├── stop.ps1                   # Full pipeline teardown
│   ├── package-vod.cmd            # Package recording as VOD with pre-roll (Chapter 5)
│   ├── package-vod.ps1            # (backend for package-vod.cmd)
│   └── start-nginx.cmd            # Start nginx server
├── mediamtx/                      # RTMP ingest + WebRTC server config
├── ffmpeg/                        # Encoding + HLS packaging scripts
├── nginx/                         # HTTP delivery + caching config
├── stream/                        # HLS output (segments + manifests)
├── recordings/                    # Stream recordings (MKV, timestamped)
├── ads/                           # Ad source + prepared clips (Chapter 5)
│   ├── source/                    # Raw ad videos (drop MP4s here)
│   └── prepared/                  # Transcoded ad HLS segments
├── vod/                           # VOD HLS output (Chapter 5)
│   ├── manifest.json              # Auto-generated VOD listing (package-vod.ps1 updates this)
│   └── <name>/                    # Combined playlist + ad/recording segments
├── player/                        # React + Vite + HLS.js + WebRTC player app
│   └── src/
│       ├── App.tsx                # Routing: / (gallery), /stream/:stream, /monitor/:stream, /vod
│       ├── config/
│       │   ├── streams.ts         # Stream definitions (name + label)
│       │   └── vod.ts             # VOD recording manifest (fallback, used when manifest.json unavailable)
│       ├── hooks/
│       │   └── useVodRecordings.ts  # Fetches /vod/manifest.json at runtime, falls back to vod.ts
│       └── components/
│           ├── Gallery.tsx        # Stream listing page (Chapter 3)
│           ├── Player.tsx         # HLS player (Chapter 1, multi-stream Chapter 3)
│           ├── Monitor.tsx        # WebRTC low-latency monitor (Chapter 2, multi-stream Chapter 3)
│           ├── VodPlayer.tsx      # VOD player with seek bar (Chapter 5)
│           └── VodLibrary.tsx     # Recording browser (Chapter 5)
└── .claude/plan/                  # Implementation plans
```

## Architecture (Chapter 3 — Multi-Stream)

```
Device A ──[RTMP:1935/live/stream]──► MediaMTX ──┬──► FFmpeg #1 ──► stream/stream/  ──► Nginx:8080 ──► /stream/stream (HLS)
                                                  └──► WebRTC      ──► /monitor/stream (WHEP)

Device B ──[RTMP:1935/live/camera1]──► MediaMTX ──┬──► FFmpeg #2 ──► stream/camera1/ ──► Nginx:8080 ──► /stream/camera1 (HLS)
                                                   └──► WebRTC       ──► /monitor/camera1 (WHEP)
```

N input streams, each with three outputs:
- **HLS path** (Chapter 1): ~18-30s latency, scalable to many viewers
- **WebRTC path** (Chapter 2): ~0.3-1s latency, for OPS team (2-3 viewers on LAN)
- **Recording path** (Chapter 3): full stream saved as MKV to `recordings/<name>/`

### VOD Pipeline (Chapter 5)

```
Recording MKV ──► package-vod.ps1 ──┬──► ads/prepared/<name>/ (auto-prepares ad if needed)
 Ad MP4 ────────────────────────────┘           │
                                                ▼
                                        vod/<name>/
                                        ├── ad/*.ts
                                        ├── recording/*.ts
                                        └── index.m3u8 (combined with EXT-X-DISCONTINUITY)
                                                │
                                        vod/manifest.json (auto-updated by package-vod.ps1)
                                                │
                                        Nginx:8080/vod/
                                                │
                                        useVodRecordings() hook fetches manifest.json
                                                │
                                        VodLibrary + VodPlayer (HLS.js, seek bar)
```

Stream names are configured in `player/src/config/streams.ts` and `scripts/start.ps1`.

### Key Technologies

- **RTMP Ingest:** MediaMTX on port 1935
- **WebRTC Signaling:** MediaMTX WHEP on port 8889 (TCP)
- **WebRTC Media:** MediaMTX ICE/DTLS on port 8189 (UDP)
- **Encoder:** FFmpeg (H.264/AAC, 720p30, HLS 6s segments)
- **HTTP Server:** Nginx on port 8080
- **Player:** React + TypeScript + Vite on port 5173

## Tool Paths

| Tool     | Path                                   | In PATH            |
| -------- | -------------------------------------- | ------------------ |
| ffmpeg   | `C:\ProgramData\chocolatey\bin\ffmpeg` | ✅                 |
| mediamtx | `C:\Users\Craftsmen\bin\mediamtx`      | ✅                 |
| nginx    | `C:\tools\nginx-1.31.1\nginx.exe`      | ❌ (use full path) |
| node/npm | `C:\Program Files\nodejs\`             | ✅                 |

## Commands

### Quick Start (single command)

```powershell
# Start all services (opens separate windows, requests admin for firewall)
.\scripts\start.cmd

# Stop all services (removes firewall rules)
.\scripts\stop.cmd
```

### LAN Access

After running `start.cmd`, it prints your LAN URLs:
- **HLS player:** `http://<ip>:8080` — viewer-facing stream
- **OPS monitor:** `http://<ip>:8080/monitor` — low-latency WebRTC feed

### Start the Pipeline (manual, in order)

```bash
# Terminal 1: MediaMTX (RTMP ingest + WebRTC)
cd mediamtx
mediamtx mediamtx.yml

# Terminal 2: FFmpeg Encoder + HLS Packager
cd ffmpeg
bash stream.sh

# Terminal 3: Nginx (HTTP delivery)
cd nginx
start-nginx.cmd

# Terminal 4: Player Dev Server
cd player
npm run dev
```

### Player App

```bash
cd player
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Build for production (output to dist/)
```

### Routes

| Route                | Component   | Protocol | Latency  | Use Case                |
| -------------------- | ----------- | -------- | -------- | ----------------------- |
| `/`                  | Gallery     | —        | —        | Stream listing          |
| `/stream/:stream`    | Player      | HLS.js   | ~18-30s  | Viewer-facing stream    |
| `/monitor/:stream`   | Monitor     | WebRTC   | ~0.3-1s  | OPS team monitoring     |
| `/vod`               | VodLibrary  | —        | —        | Recording browser       |
| `/vod/:id`           | VodPlayer   | HLS.js   | VOD      | On-demand playback      |

### VOD Packaging Commands

```powershell
# Package a recording with pre-roll ad (auto-prepares ad if not already done)
.\scripts\package-vod.cmd -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv" -AdName "promo15" -AdFile "ads\source\promo.mp4"

# Package a recording with already-prepared ad (no -AdFile needed)
.\scripts\package-vod.cmd -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv" -AdName "promo15"

# Package a recording without ad
.\scripts\package-vod.cmd -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv"
```

## OBS Studio Configuration

- **Stream Type:** Custom
- **Server:** `rtmp://localhost:1935/live`
- **Stream Key:** `stream`

## Key Implementation Details

- **Always use `.cmd` wrappers to run `.ps1` scripts** — never run `.ps1` files directly (they may open in a text editor instead of executing). Use `.\scripts\<name>.cmd` which calls `powershell -ExecutionPolicy Bypass -File` internally.
- Stream names are defined in `player/src/config/streams.ts` (shared config for the player app)
- `start.ps1` has a matching `$streams` array — keep both in sync when adding/removing streams
- Each stream gets its own FFmpeg process, HLS output directory (`stream/<name>/`), and recording (`recordings/<name>/`)
- MediaMTX auto-creates paths for any stream key pushed to `rtmp://<host>:1935/live/<key>`
- Nginx `alias D:/ott-lab/stream/` serves `stream/<name>/stream.m3u8` at `/live/<name>/stream.m3u8`
- Player and Monitor accept `:stream` URL param to dynamically build HLS/WHEP URLs
- HLS.js handles playback in browsers without native HLS support
- MediaMTX WebRTC uses WHEP protocol — browser connects to `http://<host>:8889/live/<name>/whep`
- Monitor component uses `window.location.hostname` for WHEP URL — auto-adapts to localhost or LAN IP
- React Router handles client-side routing — nginx falls back to `index.html` for SPA routes
- VOD playlists use `#EXT-X-DISCONTINUITY` to stitch ad and recording segments -- HLS.js handles this natively
- **PowerShell encoding:** `.ps1` scripts must use ASCII-safe strings only — no em-dash (`—`), curly quotes, or other Unicode punctuation. PowerShell 5.1 will fail to parse these characters.
- `package-vod.ps1` auto-prepares ads (1920x1080, 60fps, H.264, AAC) when `-AdFile` is provided, skips if already prepared
- `package-vod.ps1` uses `-c:v copy` for recordings (already H.264) and `-c:a aac` for audio (Vorbis→AAC)
- `package-vod.ps1` auto-updates `vod/manifest.json` after each packaging run — the player fetches this at runtime via `useVodRecordings()` hook
- `player/src/config/vod.ts` is the fallback manifest (hardcoded) — only used if `manifest.json` fetch fails
- When adding VOD support for a new recording, run `package-vod.cmd` — no manual edits needed

## Nginx Notes

- Use `start-nginx.cmd` or run with `-p` prefix flag from the nginx directory
- nginx config uses flat `location` blocks (no nested `if` blocks)
- nginx requires `logs/` directory for pid and error logs
- nginx requires `temp/` directory for client body and proxy temp files
- SPA routing works via `try_files $uri $uri/ /index.html` — all SPA routes served by React Router

## MediaMTX Notes

- Config uses `paths:` format (v1.x+), not the old `pathMapping`
- Auto-generates `auto.crt` and `auto.key` on first run (ignored in `.gitignore`)
- Creates `mediamtx.log` in the working directory
- WebRTC is enabled with `webrtc: yes` — no additional software needed
- WHEP endpoint: `http://<host>:8889/<path>/whep`
- For LAN, no STUN/TURN needed — static UDP port 8189 with `webrtcIPsFromInterfaces`
- Built-in player available at `http://<host>:8889/<path>` (navigate in browser)

## Firewall Ports

| Port | Protocol | Service           | Purpose                   |
| ---- | -------- | ----------------- | ------------------------- |
| 8080 | TCP      | Nginx             | HTTP delivery (HLS + SPA) |
| 8889 | TCP      | MediaMTX          | WHEP signaling            |
| 8189 | UDP      | MediaMTX          | WebRTC media transport    |
| 1935 | TCP      | MediaMTX          | RTMP ingest (LAN)         |
| 5173 | TCP      | Vite dev server   | Dev only (not in prod)    |

## Chapter Progression

1. **Chapter 1:** Live streaming pipeline (HLS) ✅
2. **Chapter 2:** Low-latency OPS monitoring feed (WebRTC) ✅
3. **Chapter 3:** Multi-stream pipeline — multiple input sources, stream gallery
4. **Chapter 4:** Cloud-ready architecture
5. **Chapter 5:** On-demand video service + ad capabilities
