/**
 * Debuggable receiver with more verbose output
 */

const WebSocket = require('ws');
const robot = require('robotjs');

// Configuration
const config = {
    serverAddress: 'ws://192.168.195.146:8080',
    screenWidth: 1920,  
    screenHeight: 1080, 
    smoothingFactor: 1.0,
    debugMode: true
};

// Get actual screen size
const actualScreenSize = robot.getScreenSize();
config.screenWidth = actualScreenSize.width;
config.screenHeight = actualScreenSize.height;
console.log(`Detected screen size: ${config.screenWidth}x${config.screenHeight}`);

let isConnected = false;
let lastPosition = { x: 0, y: 0 };
const positionQueue = [];
const QUEUE_MAX_SIZE = 5;

// Function to limit value to min/max range
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Process mouse movement with improved debugging
function processMouseMovement(x, y, isClick, batteryLevel) {
    if (config.debugMode) {
        console.log(`Received: (${x}, ${y}) px, Click: ${isClick}`);
    }
    
    // Ensure coordinates are within screen bounds
    const clampedX = clamp(x, 0, config.screenWidth);
    const clampedY = clamp(y, 0, config.screenHeight);
    
    if (x !== clampedX || y !== clampedY) {
        console.log(`Coordinates adjusted from (${x},${y}) to (${clampedX},${clampedY})`);
    }
    
    // Apply smoothing
    positionQueue.push({ x: clampedX, y: clampedY });
    if (positionQueue.length > QUEUE_MAX_SIZE) {
        positionQueue.shift();
    }
    
    // Calculate smoothed position
    let smoothX = 0, smoothY = 0;
    for (const pos of positionQueue) {
        smoothX += pos.x;
        smoothY += pos.y;
    }
    smoothX /= positionQueue.length;
    smoothY /= positionQueue.length;
    
    const finalX = Math.round(lastPosition.x * (1 - config.smoothingFactor) + smoothX * config.smoothingFactor);
    const finalY = Math.round(lastPosition.y * (1 - config.smoothingFactor) + smoothY * config.smoothingFactor);
    
    // Only update if the change is significant or it's a click
    const distance = Math.sqrt(Math.pow(finalX - lastPosition.x, 2) + Math.pow(finalY - lastPosition.y, 2));
    
    if (distance > 1 || isClick) {
        // Safety check before moving mouse
        const safeX = clamp(finalX, 0, config.screenWidth - 1);
        const safeY = clamp(finalY, 0, config.screenHeight - 1);
        
        try {
            if (config.debugMode) {
                console.log(`Moving mouse to: (${safeX}, ${safeY}) px`);
            }
            
            robot.moveMouse(safeX, safeY);
            
            if (isClick) {
                console.log(`Click at (${safeX}, ${safeY})`);
                robot.mouseClick();
            }
            
            lastPosition.x = safeX;
            lastPosition.y = safeY;
        } catch (err) {
            console.error('Error controlling mouse:', err);
        }
    }
}

// Connect to the server with better error handling
function connectToServer() {
    console.log(`Connecting to ${config.serverAddress}...`);
    
    const ws = new WebSocket(config.serverAddress);
    
    ws.on('open', () => {
        console.log('Connected to ultrasonic mouse server');
        isConnected = true;
        
        // Send our screen dimensions to the server
        ws.send(JSON.stringify({
            type: 'set_config',
            targetWidth: config.screenWidth,
            targetHeight: config.screenHeight
        }));
        
        console.log(`Screen dimensions: ${config.screenWidth}x${config.screenHeight}`);
        console.log('Waiting for mouse movements...');
    });
    
    ws.on('message', (data) => {
        try {
            // Try to parse as JSON
            const message = JSON.parse(data);
            
            if (message.type === 'config') {
                // Update configuration if needed
                console.log('Received config:', message);
            } 
            else if (message.type === 'mouse_move') {
                // Process the mouse movement
                processMouseMovement(
                    message.x, 
                    message.y, 
                    message.leftButton,
                    message.batteryLevel
                );
            }
        } catch (err) {
            console.error('Error processing message:', err);
            console.log('Raw data:', data);
        }
    });
    
    ws.on('close', () => {
        console.log('Disconnected from server. Trying to reconnect...');
        isConnected = false;
        setTimeout(connectToServer, 3000);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
    });
}

// Start the connection
connectToServer();
console.log('Ultrasonic Mouse Receiver started (Debug Mode)');
