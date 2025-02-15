const WebSocket = require("ws");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const server = app.listen(8080, () => console.log("\n🚀 Server running on port 8080...\n"));
const wss = new WebSocket.Server({ server });

// Create directories for storing media if they don't exist
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir);
    fs.mkdirSync(path.join(mediaDir, 'video'));
    fs.mkdirSync(path.join(mediaDir, 'audio'));
}

// Audio configuration
const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

// Keep track of audio data and file streams
const mediaStreams = new Map();
const audioData = new Map(); // Store audio chunks for each client

function writeWavHeader(fd, dataLength) {
    const buffer = Buffer.alloc(44);
    
    // RIFF identifier
    buffer.write('RIFF', 0);
    
    // File length
    buffer.writeUInt32LE(36 + dataLength, 4);
    
    // WAVE identifier
    buffer.write('WAVE', 8);
    
    // Format chunk marker
    buffer.write('fmt ', 12);
    
    // Format chunk length
    buffer.writeUInt32LE(16, 16);
    
    // Sample format (PCM)
    buffer.writeUInt16LE(1, 20);
    
    // Channels
    buffer.writeUInt16LE(NUM_CHANNELS, 22);
    
    // Sample rate
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    
    // Byte rate
    buffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8, 28);
    
    // Block align
    buffer.writeUInt16LE(NUM_CHANNELS * BITS_PER_SAMPLE / 8, 32);
    
    // Bits per sample
    buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
    
    // Data chunk marker
    buffer.write('data', 36);
    
    // Data chunk length
    buffer.writeUInt32LE(dataLength, 40);
    
    // Write the header
    fs.writeSync(fd, buffer, 0, 44, 0);
}

function getMediaFileName(clientId, mediaType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = mediaType === 'VIDEO' ? 'webm' : 'wav';
    return path.join(mediaDir, mediaType.toLowerCase(), `${clientId}_${timestamp}.${extension}`);
}

function initializeMediaStream(clientId, mediaType) {
    const fileName = getMediaFileName(clientId, mediaType);
    const writeStream = fs.createWriteStream(fileName);
    
    if (mediaType === 'AUDIO') {
        // Initialize audio data array and write placeholder WAV header
        audioData.set(clientId, []);
        writeStream.write(Buffer.alloc(44)); // Placeholder for WAV header
    }
    
    console.log(`📁 Created new ${mediaType} file: ${fileName}`);
    return writeStream;
}

wss.on("connection", (ws) => {
    console.log("✅ New client connected!");
    const clientId = Date.now().toString();
    ws.clientId = clientId;

    ws.on("message", (message) => {
        try {
            let data = JSON.parse(message);
            console.log(`📩 Message received: ${data.eventType}`);

            switch (data.eventType) {
                case "CONNECT":
                    console.log(`📢 User joined Space: "${data.id}"`);
                    break;

                case "STREAM":
                    const streamKey = `${ws.clientId}_${data.mediaSourceType}`;
                    let writeStream = mediaStreams.get(streamKey);

                    if (!writeStream) {
                        writeStream = initializeMediaStream(ws.clientId, data.mediaSourceType);
                        mediaStreams.set(streamKey, writeStream);
                    }

                    const chunk = Buffer.from(data.encodedMediaChunk, 'base64');
                    
                    if (data.mediaSourceType === 'AUDIO') {
                        // Store audio chunks
                        if (audioData.has(ws.clientId)) {
                            audioData.get(ws.clientId).push(chunk);
                        }
                    }
                    
                    writeStream.write(chunk);
                    break;

                case "CLOSE":
                    console.log(`👋 User left Space`);
                    closeClientStreams(ws.clientId);
                    break;

                default:
                    console.warn(`⚠️ Unknown message type: ${data.type}`);
            }
        } catch (error) {
            console.error(`❌ Error processing message: ${error.message}`);
        }
    });

    function finalizeAudioFile(clientId) {
        const audioStreamKey = `${clientId}_AUDIO`;
        const writeStream = mediaStreams.get(audioStreamKey);
        
        if (writeStream && audioData.has(clientId)) {
            const chunks = audioData.get(clientId);
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            
            // Open file for writing header
            const fd = fs.openSync(writeStream.path, 'r+');
            writeWavHeader(fd, totalLength);
            fs.closeSync(fd);
            
            audioData.delete(clientId);
        }
    }

    function closeClientStreams(clientId) {
        const videoStreamKey = `${clientId}_VIDEO`;
        if (mediaStreams.has(videoStreamKey)) {
            mediaStreams.get(videoStreamKey).end();
            mediaStreams.delete(videoStreamKey);
            console.log(`📁 Closed video stream for client: ${clientId}`);
        }

        const audioStreamKey = `${clientId}_AUDIO`;
        if (mediaStreams.has(audioStreamKey)) {
            finalizeAudioFile(clientId);
            mediaStreams.get(audioStreamKey).end();
            mediaStreams.delete(audioStreamKey);
            console.log(`📁 Closed audio stream for client: ${clientId}`);
        }
    }

    ws.on("close", () => {
        console.log("❌ Client disconnected!");
        closeClientStreams(ws.clientId);
    });

    ws.on("error", (error) => {
        console.error(`🚨 WebSocket error: ${error.message}`);
        closeClientStreams(ws.clientId);
    });
});

app.get('/recordings', (req, res) => {
    const videoFiles = fs.readdirSync(path.join(mediaDir, 'video'));
    const audioFiles = fs.readdirSync(path.join(mediaDir, 'audio'));
    
    res.json({
        video: videoFiles,
        audio: audioFiles
    });
});

console.log("\n🎧 WebSocket Server Ready! Listening for Audio & Video Streams...\n");