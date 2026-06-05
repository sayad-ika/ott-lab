#!/bin/bash
# FFmpeg Encoder + HLS Packager for OTT Lab - Chapter 1
# Reads RTMP from MediaMTX and outputs HLS segments

# Get the project root (one level up from this script)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STREAM_DIR="${PROJECT_ROOT}/stream"

echo "Starting FFmpeg encoder..."
echo "Input: rtmp://localhost:1935/live/stream"
echo "Output: ${STREAM_DIR}/stream.m3u8"
echo "Encoding: H.264 720p30, AAC 128k, HLS 6s segments"
echo ""

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
  -hls_flags delete_segments+append_list \
  -hls_segment_filename "${STREAM_DIR}/segment_%03d.ts" \
  "${STREAM_DIR}/stream.m3u8"
