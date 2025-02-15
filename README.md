# Live Stream Server

A Node.js-based live stream server that captures, processes, and stores audio/video streams. It uses WebSocket for real-time streaming, processes video frames individually, and assembles them into MP4 files using FFmpeg.

## Features

- WebSocket server for real-time media streaming
- Video frame-by-frame processing and MP4 assembly
- WAV audio recording with proper headers
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

### 3. Close Connection
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
- Video settings: H.264 codec, YUV420P format
- Temporary frames are automatically cleaned up

### Audio Processing
- Format: WAV (PCM)
- Sample Rate: 44.1kHz
- Bit Depth: 16-bit
- Channels: Mono

## Error Handling
- Automatic cleanup on client disconnection
- Duplicate processing prevention
- Temporary file cleanup
- Error logging for failed operations
