
# Live Stream Server

This project is a Node.js-based live stream server that uses WebSocket and Express to handle audio and video streams from clients. The server saves the media streams to files and provides an endpoint to list the recorded files.

## Features

- WebSocket server for handling audio and video streams
- Express server for serving HTTP requests
- Stores media streams in the `media` directory
  - Audio files are saved in `media/audio`
  - Video files are saved in `media/video`
- Provides an endpoint to list recorded media files

## Setup

1. Clone the repository:
    ```sh
    git clone <repository-url>
    cd live-stream-server
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

3. Create the necessary directories for storing media files:
    ```sh
    mkdir -p media/audio media/video
    ```

4. Start the server:
    ```sh
    node index.js
    ```

## Usage

### WebSocket

- Connect to the WebSocket server at `ws://localhost:8080`
- Send JSON messages with the following structure:

  - **CONNECT**: Notify the server that a client has connected
    ```json
    {
      "eventType": "CONNECT",
      "id": "client-id"
    }
    ```

  - **STREAM**: Send media chunks to the server
    ```json
    {
      "eventType": "STREAM",
      "mediaSourceType": "AUDIO" | "VIDEO",
      "encodedMediaChunk": "<base64-encoded-media-chunk>"
    }
    ```

  - **CLOSE**: Notify the server that a client has disconnected
    ```json
    {
      "eventType": "CLOSE"
    }
    ```

### HTTP

- List recorded media files:
  ```sh
  curl http://localhost:8080/recordings
  ```

  The response will be a JSON object containing lists of audio and video files:
  ```json
  {
    "video": ["clientId_timestamp.webm", ...],
    "audio": ["clientId_timestamp.wav", ...]
  }
  ```
