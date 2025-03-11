# Live Stream Server

A Node.js-based live stream server that captures, processes, and stores audio/video streams. It uses WebSocket for real-time streaming, processes video frames individually, and assembles them into MP4 files using FFmpeg. Additionally, it supports audio stream playback functionality.

## Features

- WebSocket server for real-time media streaming
- Video frame-by-frame processing and MP4 assembly
- WAV audio recording with proper headers
- Audio stream playback support
- Temporary frame storage and cleanup
- Express endpoint for listing recordings
- Automatic media directory structure:
  - `media/audio`: WAV audio recordings
  - `media/video`: MP4 video recordings
  - `media/temp`: Temporary frame storage

## Prerequisites

- Node.js
- FFmpeg installed on your system
- npm packages: `ws`, `express`, `fluent-ffmpeg`

## Setup

1. Install FFmpeg on your system:
    ```sh
    # For MacOS
    brew install ffmpeg

    # For Ubuntu
    sudo apt-get install ffmpeg
    ```

2. Install Node.js dependencies:
    ```sh
    npm install ws express fluent-ffmpeg
    ```

3. Start the server:
    ```sh
    node index.js
    ```

## WebSocket API

Connect to `ws://localhost:8080` and send JSON messages in the following format:

### 1. Connect to Space
```json
{
    "eventType": "CONNECT",
    "id": "client-id"
}
```

### 2. Stream Media
```json
{
    "eventType": "STREAM",
    "mediaSourceType": "AUDIO" | "VIDEO",
    "encodedMediaChunk": "<base64-encoded-media-chunk>"
}
```
- For video: Send individual frames as base64-encoded JPG images
- For audio: Send raw PCM audio data (44.1kHz, 16-bit, mono)

### 3. Request Audio Stream Playback
```json
{
    "eventType": "REQUEST_AUDIO_STREAM_PLAYBACK"
}
```
Server responds with:
```json
{
    "eventType": "AUDIO_STREAM_PAYLOAD",
    "audioChunk": "<base64-encoded-audio-chunk>"
}
```
- Audio stream is delivered as PCM16 format (24kHz, mono)

### 4. Close Connection
```json
{
    "eventType": "CLOSE"
}
```

## HTTP Endpoints

### List Recordings
```sh
GET http://localhost:8080/recordings
```

Response:
```json
{
    "video": ["clientId_timestamp.mp4", ...],
    "audio": ["clientId_timestamp.wav", ...]
}
```

## Technical Details

### Video Processing
- Frames are saved individually as JPG files
- FFmpeg assembles frames into MP4 files at 15 FPS
- Video settings: H.264 codec, YUV420P format, CRF 23
- Ultrafast preset with faststart flag enabled
- Temporary frames are automatically cleaned up

### Audio Recording
- Format: WAV (PCM)
- Sample Rate: 44.1kHz
- Bit Depth: 16-bit
- Channels: Mono

### Audio Stream Playback
- Format: PCM16
- Sample Rate: 24kHz
- Channels: Mono
- Delivered in base64-encoded chunks

## Error Handling
- Automatic cleanup on client disconnection
- Duplicate processing prevention
- Temporary file cleanup
- Error logging for failed operations
- Graceful termination of FFmpeg processes
