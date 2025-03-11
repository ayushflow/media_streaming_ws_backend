const WebSocket = require("ws");
const express = require("express");
const fs = require("fs");
const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');

const app = express();
const server = app.listen(8080, () => console.log("\n🚀 Server running on port 8080...\n"));
const wss = new WebSocket.Server({ server });

// Create directories for storing media if they don't exist
const mediaDir = path.join(__dirname, 'media');
const tempDir = path.join(mediaDir, 'temp');
[
    mediaDir,
    path.join(mediaDir, 'video'),
    path.join(mediaDir, 'audio'),
    tempDir
].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Audio configuration
const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

// Keep track of audio data, video frames and file streams
const mediaStreams = new Map();
const audioData = new Map();
const frameDirectories = new Map();
const frameCounters = new Map();
const processingClients = new Set(); // Track clients being processed

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

function createFrameDirectory(clientId) {
    const frameDir = path.join(tempDir, `frames_${clientId}`);
    if (!fs.existsSync(frameDir)) {
        fs.mkdirSync(frameDir);
    }
    frameDirectories.set(clientId, frameDir);
    frameCounters.set(clientId, 0);
    return frameDir;
}

function saveVideoFrame(clientId, frameData) {
    const frameDir = frameDirectories.get(clientId) || createFrameDirectory(clientId);
    const frameCount = frameCounters.get(clientId);
    const framePath = path.join(frameDir, `frame_${String(frameCount).padStart(8, '0')}.jpg`);
    
    fs.writeFileSync(framePath, frameData);
    frameCounters.set(clientId, frameCount + 1);
}

async function assembleVideo(clientId) {
    const frameDir = frameDirectories.get(clientId);
    if (!frameDir || !fs.existsSync(frameDir)) return;

    const frameCount = frameCounters.get(clientId);
    if (frameCount === 0) {
        console.log('No frames to assemble');
        return;
    }

    const outputPath = path.join(mediaDir, 'video', `${clientId}_${Date.now()}.mp4`);
    
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(path.join(frameDir, 'frame_%08d.jpg'))
            .inputFPS(15)
            .videoCodec('libx264')
            .outputOptions([
                '-pix_fmt yuv420p',
                '-preset ultrafast',
                '-movflags +faststart',
                '-crf 23'
            ])
            .on('start', () => {
                console.log('Started assembling video...');
            })
            .on('progress', (progress) => {
                console.log(`Processing: ${progress.percent}% done`);
            })
            .on('end', () => {
                console.log('Video assembly complete');
                // Clean up frame directory
                fs.rmSync(frameDir, { recursive: true, force: true });
                frameDirectories.delete(clientId);
                frameCounters.delete(clientId);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('Error assembling video:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

function getMediaFileName(clientId, mediaType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = mediaType === 'VIDEO' ? 'mp4' : 'wav';
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

    let ffmpeg;

    ws.on("message", (message) => {
        try {
            let data = JSON.parse(message);
            console.log(`📩 Message received: ${data.eventType}`);

            switch (data.eventType) {
                case "CONNECT":
                    console.log(`📢 User joined Space: "${data.id}"`);
                    break;

                case "STREAM":
                    const chunk = Buffer.from(data.encodedMediaChunk, 'base64');
                    
                    if (data.mediaSourceType === 'VIDEO') {
                        saveVideoFrame(ws.clientId, chunk);
                    } else if (data.mediaSourceType === 'AUDIO') {
                        const streamKey = `${ws.clientId}_AUDIO`;
                        let writeStream = mediaStreams.get(streamKey);

                        if (!writeStream) {
                            writeStream = initializeMediaStream(ws.clientId, 'AUDIO');
                            mediaStreams.set(streamKey, writeStream);
                        }

                        if (audioData.has(ws.clientId)) {
                            audioData.get(ws.clientId).push(chunk);
                        }
                        writeStream.write(chunk);
                    }
                    break;
                
                case "REQUEST_AUDIO_STREAM_PLAYBACK":
                    console.log(`📢 User requested audio stream playback`);

                    // Spawn ffmpeg to read mysong.mp3 (any format) and output raw PCM16 at 24 kHz, mono
                    ffmpeg = spawn('ffmpeg', [
                        '-i', 'mysong.mp3',    // your source audio file
                        '-f', 's16le',         // raw PCM16 format
                        '-acodec', 'pcm_s16le',
                        '-ar', '24000',        // sample rate
                        '-ac', '1',            // mono
                        'pipe:1'               // write to STDOUT
                    ]);

                    // Whenever ffmpeg produces a chunk of PCM data, base64-encode and send to the client
                    ffmpeg.stdout.on('data', (chunk) => {
                        // chunk is a Buffer of raw PCM16
                        const b64 = chunk.toString('base64');
                        ws.send(JSON.stringify({
                            eventType: "AUDIO_STREAM_PAYLOAD",
                            audioChunk: b64,
                        }));
                    });

                    // Optional: log ffmpeg errors
                    ffmpeg.stderr.on('data', (err) => {
                        console.error('FFmpeg error:', err.toString());
                    });

                    ffmpeg.on('close', (code) => {
                        console.log('FFmpeg exited with code:', code);
                        
                    });

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

    async function finalizeAudioFile(clientId) {
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

    async function closeClientStreams(clientId) {
        // Prevent duplicate processing
        if (processingClients.has(clientId)) {
            console.log('Client cleanup already in progress');
            return;
        }
        processingClients.add(clientId);

        // Handle video frames
        if (frameDirectories.has(clientId)) {
            try {
                console.log('Starting video assembly...');
                await assembleVideo(clientId);
                console.log('Video assembly completed successfully');
            } catch (err) {
                console.error('Failed to assemble video:', err);
            }
        }

        // Handle audio
        const audioStreamKey = `${clientId}_AUDIO`;
        if (mediaStreams.has(audioStreamKey)) {
            await finalizeAudioFile(clientId);
            mediaStreams.get(audioStreamKey).end();
            mediaStreams.delete(audioStreamKey);
            console.log(`📁 Closed audio stream for client: ${clientId}`);
        }
    }

    ws.on("close", () => {
        console.log("❌ Client disconnected!");
        if (ffmpeg) {
            ffmpeg.kill('SIGKILL');
        }
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

console.log("\n🎧 WebSocket Server Ready! Listening for Audio, Video, and Audio Stream Playback Requests...\n");