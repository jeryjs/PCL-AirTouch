"""
Python Bridge for the Ultrasonic Sensor interaction Simulation

This script connects the simulation.py with the API.js by sending position data
when the finger is detected.
"""

import requests
import json
import time
import threading
import numpy as np

# Configuration
SERVER_URL = 'http://localhost:8080/position'
UPDATE_RATE_HZ = 125  # interaction update rate (typical 125Hz for wireless interaction)
SIMULATION_RUNNING = True

class UltrasonicinteractionBridge:
    """Bridge between ultrasonic sensor simulation and the API.js"""
    
    def __init__(self, server_url=SERVER_URL, update_rate=UPDATE_RATE_HZ):
        self.server_url = server_url
        self.update_rate = update_rate
        self.last_position = None
        self.last_send_time = 0
        self.connected = False
        self.position_log = []
        self.min_distance_threshold = 3  # minimum movement in px to send update
    
    def connect(self):
        """Attempt to connect to the Node.js server"""
        try:
            # Send a test message
            response = requests.post(
                self.server_url, 
                json={"x_cm": 0, "y_cm": 0, "is_click": False, "test": True}
            )
            if response.status_code == 200:
                self.connected = True
                print("Connected to Node.js API server")
                return True
            else:
                print(f"Failed to connect to server. Status: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"Connection error: {e}")
            return False
    
    def send_position(self, x_cm, y_cm, is_click=False):
        """Send position data to the Node.js server"""
        if not self.connected:
            if not self.connect():
                return False
        
        # Calculate time since last update
        current_time = time.time()
        time_diff = current_time - self.last_send_time
        
        # Only send if sufficient time has elapsed (based on update rate)
        # or it's a interaction click event (those should be sent immediately)
        if time_diff < (1.0 / self.update_rate) and not is_click:
            return True
        
        # Check if position has changed enough to send an update
        if self.last_position is not None:
            distance = np.sqrt((x_cm - self.last_position[0])**2 + 
                             (y_cm - self.last_position[1])**2)
            if distance < self.min_distance_threshold and not is_click:
                return True  # Skip sending if movement is too small
        
        # Prepare the data packet
        data = {
            "x_cm": float(x_cm),
            "y_cm": float(y_cm),
            "is_click": bool(is_click),
            "timestamp": current_time
        }
        
        try:
            print(f"Sending position: {data}")
            # Send the data to the server
            response = requests.post(self.server_url, json=data)
            if response.status_code == 200:
                self.last_position = (x_cm, y_cm)
                self.last_send_time = current_time
                self.position_log.append(data)
                return True
            else:
                print(f"Failed to send position. Status: {response.status_code}")
                self.connected = False
                return False
        except requests.exceptions.RequestException as e:
            print(f"Error sending position: {e}")
            self.connected = False
            return False

# Function to integrate with simulation.py
def register_interaction_bridge(update_plot_function):
    """
    Creates a bridge and modifies the update_plot function to send position data
    
    Args:
        update_plot_function: The original update_plot function from simulation.py
    
    Returns:
        Modified update_plot function that also sends position data
    """
    bridge = UltrasonicinteractionBridge()
    
    def wrapped_update_plot(event=None):
        # Call the original function
        result = update_plot_function(event)
        
        # If event contains position data, send it to the bridge
        if event is not None and event.inaxes is not None:
            x_cm = event.xdata
            y_cm = (event.ydata)
            is_click = hasattr(event, 'button') and event.button == 1
            
            # Send in a non-blocking way
            threading.Thread(
                target=bridge.send_position,
                args=(x_cm, y_cm, is_click)
            ).start()
            
        return result
    
    # Try to connect immediately
    bridge.connect()
    
    return wrapped_update_plot

# When imported, print instructions
print("""
Ultrasonic Sensor Interaction Bridge loaded.
To use with simulation.py, add these lines after creating update_plot:

from python_bridge import register_interaction_bridge
update_plot = register_interaction_bridge(update_plot)

This will automatically send position data to the Node.js API.
Make sure the API server (api.js) is running first.
""")
