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
│   └── stop.ps1                   # Full pipeline teardown
├── mediamtx/                      # RTMP ingest + WebRTC server config
├── ffmpeg/                        # Encoding + HLS packaging scripts
├── nginx/                         # HTTP delivery + caching config
├── stream/                        # HLS output (segments + manifests)
├── player/                        # React + Vite + HLS.js + WebRTC player app
│   └── src/
│       ├── App.tsx                # Routing: / (gallery), /stream/:stream, /monitor/:stream
│       ├── config/
│       │   └── streams.ts         # Stream definitions (name + label)
│       └── components/
│           ├── Gallery.tsx        # Stream listing page (Chapter 3)
│           ├── Player.tsx         # HLS player (Chapter 1, multi-stream Chapter 3)
│           └── Monitor.tsx        # WebRTC low-latency monitor (Chapter 2, multi-stream Chapter 3)
└── .claude/plan/                  # Implementation plans
```

## Architecture (Chapter 3 — Multi-Stream)

```
Device A ──[RTMP:1935/live/stream]──► MediaMTX ──┬──► FFmpeg #1 ──► stream/stream/  ──► Nginx:8080 ──► /stream/stream (HLS)
                                                  └──► WebRTC      ──► /monitor/stream (WHEP)

Device B ──[RTMP:1935/live/camera1]──► MediaMTX ──┬──► FFmpeg #2 ──► stream/camera1/ ──► Nginx:8080 ──► /stream/camera1 (HLS)
                                                   └──► WebRTC       ──► /monitor/camera1 (WHEP)
```

N input streams, each with two outputs:
- **HLS path** (Chapter 1): ~18-30s latency, scalable to many viewers
- **WebRTC path** (Chapter 2): ~0.3-1s latency, for OPS team (2-3 viewers on LAN)

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

| Route                | Component  | Protocol | Latency  | Use Case                |
| -------------------- | ---------- | -------- | -------- | ----------------------- |
| `/`                  | Gallery    | —        | —        | Stream listing          |
| `/stream/:stream`    | Player     | HLS.js   | ~18-30s  | Viewer-facing stream    |
| `/monitor/:stream`   | Monitor    | WebRTC   | ~0.3-1s  | OPS team monitoring     |

## OBS Studio Configuration

- **Stream Type:** Custom
- **Server:** `rtmp://localhost:1935/live`
- **Stream Key:** `stream`

## Key Implementation Details

- Stream names are defined in `player/src/config/streams.ts` (shared config for the player app)
- `start.ps1` has a matching `$streams` array — keep both in sync when adding/removing streams
- Each stream gets its own FFmpeg process and HLS output directory (`stream/<name>/`)
- MediaMTX auto-creates paths for any stream key pushed to `rtmp://<host>:1935/live/<key>`
- Nginx `alias D:/ott-lab/stream/` serves `stream/<name>/stream.m3u8` at `/live/<name>/stream.m3u8`
- Player and Monitor accept `:stream` URL param to dynamically build HLS/WHEP URLs
- HLS.js handles playback in browsers without native HLS support
- MediaMTX WebRTC uses WHEP protocol — browser connects to `http://<host>:8889/live/<name>/whep`
- Monitor component uses `window.location.hostname` for WHEP URL — auto-adapts to localhost or LAN IP
- React Router handles client-side routing — nginx falls back to `index.html` for SPA routes

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
