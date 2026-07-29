"""
Debug Tool for Testing Ultrasonic Mouse Connection

This simple script sends test movements to verify the API is working.
"""
import requests
import time
import math
import pyautogui

API_URL = "http://localhost:8080/position"

def send_test_movement():
    """Send a circular movement pattern to test the API connection"""
    print("Sending test movements to API server...")
    
    # Get actual screen resolution
    screen_width, screen_height = pyautogui.size()
    print(f"Detected screen resolution: {screen_width}x{screen_height} pixels")
    
    # For 15.6-inch 16:9 laptop screen, typical measurements in cm are:
    # Width ~34.5 cm, Height ~19.4 cm
    screen_width_cm = 34.5
    screen_height_cm = 19.4
    
    # Center coordinates (in cm)
    center_x = screen_width_cm / 2  # Center X position
    center_y = screen_height_cm / 2  # Center Y position
    
    # Radius that ensures we stay on screen (30% of the smaller dimension)
    radius = min(center_x, center_y) * 0.7
    
    print(f"Using screen size: {screen_width_cm}x{screen_height_cm} cm")
    print(f"Center point: ({center_x}, {center_y}) cm")
    print(f"Circle radius: {radius} cm")
    
    try:
        # Test the API connection
        test_response = requests.post(API_URL, json={"x_cm": center_x, "y_cm": center_y, "is_click": False})
        print(f"Initial test response: {test_response.status_code}")
        
        if test_response.status_code != 200:
            print("API server not responding correctly. Check if it's running.")
            return False
    except requests.RequestException as e:
        print(f"Error connecting to API: {e}")
        print("Make sure api.js is running on port 8080!")
        return False
    
    # Send movements in a circle
    for i in range(200):  # Send 200 test points
        # Calculate position on a circle
        angle = i * 0.1
        x = center_x + radius * math.cos(angle)
        y = center_y + radius * math.sin(angle)
        
        # Every 20 points, send a click
        is_click = (i % 20 == 0)
        
        data = {
            "x_cm": x,
            "y_cm": y,
            "is_click": is_click
        }
        
        try:
            response = requests.post(API_URL, json=data)
            status = "✓" if response.status_code == 200 else "✗"
            action = "click" if is_click else "move"
            print(f"{status} Sent {action} at ({x:.1f}, {y:.1f}) - Status: {response.status_code}")
            
            # Slow down to better observe the movement
            time.sleep(0.1)  # 100ms delay between points
            
        except requests.RequestException as e:
            print(f"Error connecting to API: {e}")
            return False
    
    print("Test complete! Did you see the mouse move in a circle?")
    return True

if __name__ == "__main__":
    print("Ultrasonic Mouse Connection Tester")
    print("==================================")
    print("1. Make sure api.js is running")
    print("2. Make sure receiver.js is running")
    print("3. This test will move your mouse in a circle")
    input("Press Enter to start the test...")
    
    send_test_movement()
