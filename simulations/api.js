/**
 * Bluetooth/2.4GHz Mouse Simulation API
 * 
 * This API simulates how a wireless mouse would transmit position data
 * from our ultrasonic sensor system to a target device.
 */

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const { exec } = require('child_process');

// Configuration
const config = {
    // Server settings
    port: 8080,
    
    // Source (ultrasonic system) settings
    sourceScreenWidth: 200, // cm (from simulation.py)
    sourceScreenHeight: 150, // cm (from simulation.py)
    
    // Target device settings (standard 1080p screen by default)
    targetScreenWidth: 1920, // pixels
    targetScreenHeight: 1080, // pixels
    
    // Wireless simulation settings
    simulatedLatency: 0, // Set to 0 for immediate transmission
    packetLossRate: 0.00002, // packet loss to simulate real conditions
    connectionTimeouts: false, // Disable connection timeouts for development
    batterySimulation: true, // simulate battery level reporting
    
    // HID report rate (typical mouse polling rate)
    reportRate: 125, // Hz (reports per second)
};

// Initialize the application
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Battery level simulation
let batteryLevel = 85; // Start at 85%
let batteryDrainInterval;

// Track connected devices
let connectedClients = new Set();
let isConnected = false;
let reconnectAttempts = 0;

// Mouse state
let mouseState = {
    x: 0,
    y: 0,
    leftButton: false,
    rightButton: false,
    middleButton: false,
    lastPacketTime: Date.now()
};

// Simulated Bluetooth/2.4GHz packet structure (HID-like format)
class WirelessPacket {
    constructor(x, y, buttons = 0, batteryLevel = 100) {
        this.reportId = 0x01; // Mouse report ID
        this.buttons = buttons; // 0=none, 1=left, 2=right, 4=middle
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.wheel = 0; // No scroll
        this.batteryLevel = batteryLevel; // 0-100%
        this.timestamp = Date.now();
    }
    
    // Convert to buffer like a real HID device would
    toBuffer() {
        const buffer = Buffer.alloc(8);
        buffer[0] = this.reportId;
        buffer[1] = this.buttons;
        buffer[2] = this.x & 0xFF; // Low byte
        buffer[3] = (this.x >> 8) & 0xFF; // High byte
        buffer[4] = this.y & 0xFF; // Low byte
        buffer[5] = (this.y >> 8) & 0xFF; // High byte
        buffer[6] = this.wheel;
        buffer[7] = this.batteryLevel;
        return buffer;
    }
    
    // Simulate data corruption that can happen in wireless transmission
    simulateInterference() {
        // Random chance for packet loss
        if (Math.random() < config.packetLossRate) {
            return null; // Packet lost
        }
        
        // Very small chance of data corruption (flipping a bit)
        if (Math.random() < 0.0005) {
            const bitToFlip = Math.floor(Math.random() * 16);
            if (bitToFlip < 8) {
                this.x ^= (1 << bitToFlip); // Flip a bit in x
            } else {
                this.y ^= (1 << (bitToFlip - 8)); // Flip a bit in y
            }
        }
        
        return this;
    }
}

// Convert centimeters to pixels with more accurate screen sizing
function cmToPixels(x_cm, y_cm) {
    // More accurate measurement for a 15.6" 16:9 screen
    // Width ~34.5 cm, Height ~19.4 cm
    const sourceScreenWidth = 34.5; // cm
    const sourceScreenHeight = 19.4; // cm
    
    // Transform coordinates from source dimensions to target dimensions
    const x_pixel = Math.round((x_cm / sourceScreenWidth) * config.targetScreenWidth);
    const y_pixel = Math.round((y_cm / sourceScreenHeight) * config.targetScreenHeight);
    
    console.log(`Converting: (${x_cm.toFixed(1)}cm, ${y_cm.toFixed(1)}cm) → (${x_pixel}px, ${y_pixel}px)`);
    
    return { x: x_pixel, y: y_pixel };
}

// Check if position is within the screen bounds
function isWithinBounds(x_cm, y_cm) {
    return (
        x_cm >= 0 && 
        x_cm <= config.sourceScreenWidth && 
        y_cm >= 0 && 
        y_cm <= config.sourceScreenHeight
    );
}

// Modified simulateConnection for immediate connection
function simulateConnection() {
    console.log("Immediate connection established for development");
    isConnected = true;
    reconnectAttempts = 0;
    if (config.batterySimulation) {
        startBatterySimulation();
    }
    // Skipping artificial delays and timeouts.
}

// Simulate battery drain
function startBatterySimulation() {
    clearInterval(batteryDrainInterval);
    
    batteryDrainInterval = setInterval(() => {
        // Drain battery more when mouse is active, less when idle
        const timeSinceLastPacket = Date.now() - mouseState.lastPacketTime;
        
        if (timeSinceLastPacket < 1000) {
            // Active use drains battery faster
            batteryLevel -= 0.01;
        } else {
            // Idle state drains battery slower
            batteryLevel -= 0.001;
        }
        
        // Keep battery level in valid range
        batteryLevel = Math.max(0, Math.min(100, batteryLevel));
        
        // Low battery warning
        if (batteryLevel < 15 && batteryLevel > 14.9) {
            console.log("Warning: Mouse battery low (15%)");
        } else if (batteryLevel < 5 && batteryLevel > 4.9) {
            console.log("Critical: Mouse battery very low (5%)");
        }
        
        // When battery gets too low, simulate disconnection
        if (batteryLevel <= 0) {
            console.error("Connection lost: Mouse battery depleted");
            isConnected = false;
            clearInterval(batteryDrainInterval);
        }
    }, 5000); // Check every 5 seconds
}

// Simulate random connection timeouts
function scheduleRandomTimeout() {
    // Only schedule timeouts when connected
    if (!isConnected) return;
    
    // Random time between 60-240 seconds
    const timeoutDelay = 60000 + Math.random() * 180000;
    
    setTimeout(() => {
        // 5% chance of a connection timeout
        if (Math.random() < 0.05 && isConnected) {
            console.error("Connection timeout: Signal lost");
            isConnected = false;
            
            // Try to reconnect
            setTimeout(() => {
                console.log("Attempting to reconnect...");
                simulateConnection();
            }, 3000);
        } else {
            // Schedule next timeout check
            scheduleRandomTimeout();
        }
    }, timeoutDelay);
}

// Process position data from the Python simulation
function processPositionData(data) {
    // Don't process data if not connected
    if (!isConnected) {
        if (reconnectAttempts === 0) {
            simulateConnection();
        }
        return;
    }
    
    // Parse the position data
    try {
        const positionData = JSON.parse(data);
        const { x_cm, y_cm, is_click } = positionData;
        
        console.log(`Received: (${x_cm.toFixed(1)}, ${y_cm.toFixed(1)}) cm, Click: ${is_click}`);
        
        // Store last packet time for battery simulation
        mouseState.lastPacketTime = Date.now();
        
        // Convert cm to pixels using improved function
        const { x, y } = cmToPixels(x_cm, y_cm);
        
        // Update mouse state
        mouseState.x = x;
        mouseState.y = y;
        mouseState.leftButton = is_click ? 1 : 0;
        
        // Create wireless packet
        const packet = new WirelessPacket(
            x, 
            y, 
            mouseState.leftButton, 
            Math.round(batteryLevel)
        );
        
        // Simulate wireless interference
        const processedPacket = packet.simulateInterference();
        
        // Check if packet was lost
        if (processedPacket === null) {
            console.log("Packet lost due to interference");
            return;
        }
        
        // Send to all connected clients with simulated latency
        // setTimeout(() => {
            // Send to all connected clients
            console.log(`Sending to ${connectedClients.size} clients: (${processedPacket.x}, ${processedPacket.y})`);
            
            for (const client of connectedClients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'mouse_move',
                        x: processedPacket.x,
                        y: processedPacket.y,
                        leftButton: Boolean(processedPacket.buttons & 1),
                        batteryLevel: processedPacket.batteryLevel,
                        timestamp: processedPacket.timestamp
                    }));
                }
            }
        // }, config.simulatedLatency);
    } catch (error) {
        console.error("Error processing position data:", error);
    }
}

// Endpoint to receive position data from Python simulation
app.use(express.json());

// Add a simple root endpoint for testing connectivity
app.get('/', (req, res) => {
    res.status(200).send({ 
        status: 'running',
        connectedClients: connectedClients.size,
        isConnected: isConnected
    });
});

// Improve the position endpoint with better logging
app.post('/position', (req, res) => {
    console.log(`Received position: (${req.body.x_cm}, ${req.body.y_cm}) - Click: ${req.body.is_click}`);
    
    // Process position data
    processPositionData(JSON.stringify(req.body));
    res.sendStatus(200);
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Client connected');
    connectedClients.add(ws);
    
    // Send configuration to the client
    ws.send(JSON.stringify({
        type: 'config',
        targetWidth: config.targetScreenWidth,
        targetHeight: config.targetScreenHeight,
        reportRate: config.reportRate
    }));
    
    ws.on('close', () => {
        console.log('Client disconnected');
        connectedClients.delete(ws);
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'set_config') {
                // Allow clients to update configuration
                if (data.targetWidth) config.targetScreenWidth = data.targetWidth;
                if (data.targetHeight) config.targetScreenHeight = data.targetHeight;
                console.log(`Configuration updated: ${config.targetScreenWidth}x${config.targetScreenHeight}`);
            }
        } catch (e) {
            console.error('Invalid message:', e);
        }
    });
});

// Start the server
server.listen(config.port, '0.0.0.0', () => {
    console.log(`Bluetooth/2.4GHz Mouse Simulator running on port ${config.port}`);
    console.log(`Simulating wireless mouse with ${config.simulatedLatency}ms latency`);
    console.log(`Report rate: ${config.reportRate}Hz`);
    console.log(`Target screen: ${config.targetScreenWidth}x${config.targetScreenHeight} pixels`);
    
    // Automatically start connection simulation
    simulateConnection();
});

// Simple utility to simulate mouse clicks on the receiving system
// This could be used for testing locally
function simulateMouseClick(x, y, isLeft = true) {
    if (process.platform === 'win32') {
        const button = isLeft ? 'left' : 'right';
        exec(`powershell -command "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('{CAPSLOCK}'); Start-Sleep -Milliseconds 100; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); Start-Sleep -Milliseconds 100; $mouse = [System.Windows.Forms.MouseButtons]::${button.charAt(0).toUpperCase() + button.slice(1)}; [System.Windows.Forms.Application]::DoEvents();"`, 
            (error) => {
                if (error) {
                    console.error('Error simulating mouse click:', error);
                }
            }
        );
    } else if (process.platform === 'linux') {
        const button = isLeft ? '1' : '3';
        exec(`xdotool mousemove ${x} ${y} click ${button}`, 
            (error) => {
                if (error) {
                    console.error('Error simulating mouse click:', error);
                }
            }
        );
    } else if (process.platform === 'darwin') {
        const button = isLeft ? 'left' : 'right';
        exec(`osascript -e 'tell application "System Events" to set cursor position to {${x}, ${y}}' -e 'tell application "System Events" to click ${button} button of mouse'`,
            (error) => {
                if (error) {
                    console.error('Error simulating mouse click:', error);
                }
            }
        );
    }
}

module.exports = {
    processPositionData,
    simulateMouseClick,
    cmToPixels,
    isWithinBounds
};
