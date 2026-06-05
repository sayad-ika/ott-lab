# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Greenfield OTT (Over-The-Top) platform built incrementally through chapters. Each chapter adds a new capability to the streaming pipeline, starting from a simple live stream and scaling to a cloud-ready architecture.

## Repository Structure

```
ott-lab/
├── project-scope.md           # Full project requirements and milestones
├── mediamtx/                  # RTMP ingest server config
├── ffmpeg/                    # Encoding + HLS packaging scripts
├── nginx/                     # HTTP delivery + caching config
├── stream/                    # HLS output (segments + manifests)
├── player/                    # React + Vite + HLS.js player app
└── .claude/plan/              # Implementation plans
    └── chapter-1-implementation.md
```

## Architecture (Chapter 1)

```
OBS Studio → MediaMTX (RTMP ingest) → FFmpeg (encode + HLS) → Nginx (HTTP delivery) → React Player (HLS.js)
```

### Key Technologies

- **RTMP Ingest:** MediaMTX on port 1935
- **Encoder:** FFmpeg (H.264/AAC, 720p30, HLS 6s segments)
- **HTTP Server:** Nginx on port 8080
- **Player:** React + TypeScript + Vite + HLS.js on port 5173

## Tool Paths

| Tool     | Path                                   | In PATH            |
| -------- | -------------------------------------- | ------------------ |
| ffmpeg   | `C:\ProgramData\chocolatey\bin\ffmpeg` | ✅                 |
| mediamtx | `C:\Users\Craftsmen\bin\mediamtx`      | ✅                 |
| nginx    | `C:\tools\nginx-1.31.1\nginx.exe`      | ❌ (use full path) |
| node/npm | `C:\Program Files\nodejs\`             | ✅                 |

## Commands (Chapter 1)

### Start the Pipeline (in order)

```bash
# Terminal 1: RTMP Ingest Server
cd mediamtx
mediamtx mediamtx.yml

# Terminal 2: FFmpeg Encoder + HLS Packager
cd ffmpeg
bash stream.sh

# Terminal 3: HTTP Delivery Server
cd nginx
start-nginx.cmd          # PowerShell/Command Prompt
# or from Git Bash:
/c/tools/nginx-1.31.1/nginx.exe -p "D:/ott-lab/nginx/" -c "D:/ott-lab/nginx/nginx.conf"

# Terminal 4: Player Dev Server
cd player
npm run dev
```

### Stop the Pipeline (reverse order)

```bash
# Stop in reverse: OBS → Player (Ctrl+C) → Nginx (Ctrl+C) → FFmpeg (Ctrl+C) → MediaMTX (Ctrl+C)
```

### Player App

```bash
cd player
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Build for production
```

## OBS Studio Configuration

- **Stream Type:** Custom
- **Server:** `rtmp://localhost:1935/live`
- **Stream Key:** `stream`

## Key Implementation Details

- FFmpeg outputs HLS segments to `stream/`
- Nginx serves HLS files from that directory on port 8080
- Player fetches manifest from `http://localhost:8080/live/stream.m3u8`
- HLS.js handles playback in browsers without native HLS support
- FFmpeg uses `temp_file` flag to work around Windows file locking
- Nginx requires `mime.types` in the config directory (copied from `C:\tools\nginx-1.31.1\conf\`)

## Nginx Notes

- Use `start-nginx.cmd` or run with `-p` prefix flag from the nginx directory
- nginx config uses flat `location` blocks (no nested `if` blocks)
- nginx requires `logs/` directory for pid and error logs
- nginx requires `temp/` directory for client body and proxy temp files

## MediaMTX Notes

- Config uses `paths:` format (v1.x+), not the old `pathMapping`
- Auto-generates `auto.crt` and `auto.key` on first run (ignored in `.gitignore`)
- Creates `mediamtx.log` in the working directory

## Chapter Progression

1. **Chapter 1:** Live streaming pipeline (current)
2. **Chapter 2:** Low-latency monitoring feed
3. **Chapter 3:** Cloud-ready architecture
4. **Chapter 4:** On-demand video service + ad capabilities
