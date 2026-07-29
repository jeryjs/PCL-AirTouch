import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Wedge, Rectangle, Circle
import ipywidgets as widgets
from IPython.display import display
import time
import matplotlib.animation as animation

# --- Simulation parameters ---
screen_width = 200   # 200 cm wide screen
screen_height = int(screen_width * 9 / 16)  # 16:9 aspect ratio (approx 112 cm height)

# --- Sensor mounting points ---
# Place horizontal sensors at top left and vertical sensors at top right of the screen.
screen_offset = np.array([10, 10])
sensor_origin_h = screen_offset.copy()  # top left 
sensor_origin_v = screen_offset + np.array([screen_width, 0])  # top right

# Sensor groups: each sensor has a 30° full cone (±15°)
h_sensor_centers = np.array([15,45,75])    # For horizontal measurement (near 0°)
v_sensor_centers = np.array([105, 135, 165])    # For vertical measurement (downwards)

half_fov = 15  # each sensor ±15°

# Global variables for the finger and log
finger_pos = np.array([100, 100], dtype=float)  # initial finger position
click_log = []  # list of (timestamp, finger_pos, estimated_pos)
refresh_rate_ms = 100

# --- Functions ---
def simulate_sensor_group(finger, sensor_angles, sensor_origin):
    """
    For a given sensor group (with given origin) and finger position,
    simulate the sensor outputs.
    Returns:
      - d: true distance from sensor_origin to finger (cm)
      - theta_true: true polar angle from sensor_origin (deg)
      - active_angles: sensor centers that "detect" the finger.
      - weights: 1 - error/half_fov.
    """
    delta = finger - sensor_origin
    d = np.linalg.norm(delta)
    theta_true = np.degrees(np.arctan2(delta[1], delta[0]))
    
    active_angles = []
    weights = []
    for angle in sensor_angles:
        if abs(theta_true - angle) <= half_fov:
            weight = 1 - abs(theta_true - angle) / half_fov
            active_angles.append(angle)
            weights.append(weight)
    return d, theta_true, np.array(active_angles), np.array(weights)

def estimate_position(finger):
    """
    Computes the estimated (x, y) for the finger.
    For each sensor group:
      - Horizontal: estimated angle is the weighted average from sensor_origin_h.
      - Vertical: estimated angle is computed from sensor_origin_v.
    The estimated position is computed by:
       x_est = sensor_origin_h[0] + d_h * cos(theta_h_est)
       y_est = sensor_origin_v[1] + d_v * sin(theta_v_est)
    """
    # Horizontal sensors (for x-coordinate)
    d_h, theta_true_h, h_active, h_weights = simulate_sensor_group(finger, h_sensor_centers, sensor_origin_h)
    if len(h_active) > 0 and np.sum(h_weights) > 0:
        theta_h_est = np.average(h_active, weights=h_weights)
        x_est = sensor_origin_h[0] + d_h * np.cos(np.radians(theta_h_est))
    else:
        theta_h_est = None
        x_est = None

    # Vertical sensors (for y-coordinate)
    d_v, theta_true_v, v_active, v_weights = simulate_sensor_group(finger, v_sensor_centers, sensor_origin_v)
    if len(v_active) > 0 and np.sum(v_weights) > 0:
        theta_v_est = np.average(v_active, weights=v_weights)
        y_est = sensor_origin_v[1] + d_v * np.sin(np.radians(theta_v_est))
    else:
        theta_v_est = None
        y_est = None

    est = None if (x_est is None or y_est is None) else np.array([x_est, y_est])
    return {
        'd_h': d_h,
        'theta_true_h': theta_true_h,
        'h_est': theta_h_est,
        'x_est': x_est,
        'd_v': d_v,
        'theta_true_v': theta_true_v,
        'v_est': theta_v_est,
        'y_est': y_est,
        'est_pos': est
    }

# --- Setup the figure ---
plt.close('all')
fig, ax = plt.subplots(figsize=(8,6))
ax.set_aspect('equal')
ax.set_xlim(-20, screen_width + 70)
ax.set_ylim(-20, screen_height + 70)
ax.set_title("HC-SR04 Sensor Array Simulation\n(Hover with mouse; click to simulate touch)")

# Draw the screen
screen_rect = Rectangle(screen_offset, screen_width, screen_height,
                        edgecolor='black', facecolor='lightgray', lw=2)
ax.add_patch(screen_rect)
ax.text(screen_offset[0] + screen_width/2, screen_offset[1] + screen_height + 5,
        f"Screen (200 cm x {screen_height} cm)", ha='center', va='bottom')

# Draw sensor mounting points
sensor_marker_h = Circle(sensor_origin_h, 3, color='blue')
ax.add_patch(sensor_marker_h)
ax.text(sensor_origin_h[0]-5, sensor_origin_h[1]-5, "Horizontal Sensor", color='blue', fontsize=8)

sensor_marker_v = Circle(sensor_origin_v, 3, color='purple')
ax.add_patch(sensor_marker_v)
ax.text(sensor_origin_v[0]-20, sensor_origin_v[1]-5, "Vertical Sensor", color='purple', fontsize=8)

# Pre-draw sensor cones for horizontal sensors (from sensor_origin_h)
h_cones = []
for angle in h_sensor_centers:
    wedge = Wedge(sensor_origin_h, 250, angle - half_fov, angle + half_fov,
                  facecolor='orange', alpha=0.15, edgecolor='orange')
    h_cones.append(wedge)
    ax.add_patch(wedge)
    ax.text(sensor_origin_h[0] + np.cos(np.radians(angle))*30,
            sensor_origin_h[1] + np.sin(np.radians(angle))*30,
            f"{angle}°", color='darkorange', fontsize=8)

# Pre-draw sensor cones for vertical sensors (from sensor_origin_v)
v_cones = []
for angle in v_sensor_centers:
    wedge = Wedge(sensor_origin_v, 250, angle - half_fov, angle + half_fov,
                  facecolor='green', alpha=0.15, edgecolor='green')
    v_cones.append(wedge)
    ax.add_patch(wedge)
    ax.text(sensor_origin_v[0] + np.cos(np.radians(angle))*30,
            sensor_origin_v[1] + np.sin(np.radians(angle))*30,
            f"{angle}°", color='darkgreen', fontsize=8)

# Markers for finger position (true and estimated)
true_marker, = ax.plot([], [], 'bo', ms=8, label="True Finger Pos")
est_marker, = ax.plot([], [], 'ro', ms=8, label="Estimated Pos")
info_text = ax.text(0, screen_height + 30, "", fontsize=10, va='bottom')

# --- Event handling ---
def on_mouse_move(event):
    global finger_pos
    if event.inaxes == ax:
        finger_pos = np.array([event.xdata, event.ydata])
on_move_cid = fig.canvas.mpl_connect('motion_notify_event', on_mouse_move)

def on_mouse_click(event):
    if event.inaxes == ax:
        data = estimate_position(finger_pos)
        timestamp = time.strftime("%H:%M:%S")
        click_log.append((timestamp, finger_pos.copy(), data.get('est_pos')))
        print(f"Touch at {timestamp}: True pos = {finger_pos.round(1)}, Estimated = {np.round(data.get('est_pos'),1) if data.get('est_pos') is not None else 'N/A'}")
on_click_cid = fig.canvas.mpl_connect('button_press_event', on_mouse_click)

def update(_):
    sensor_data = estimate_position(finger_pos)
    true_marker.set_data([finger_pos[0]], [finger_pos[1]])
    if sensor_data['est_pos'] is not None:
        est_marker.set_data([sensor_data['est_pos'][0]], [sensor_data['est_pos'][1]])
    else:
        est_marker.set_data([], [])

    h_est_str = f"{sensor_data['h_est']}°" if sensor_data['h_est'] is not None else "N/A"
    x_est_str = f"{sensor_data['x_est']:.1f} cm" if sensor_data['x_est'] is not None else "N/A"
    if sensor_data['v_est'] is not None:
        v_est_str = f"{sensor_data['v_est']}°"
        y_est_str = f"{sensor_data['y_est']:.1f} cm"
    else:
        v_est_str = "N/A"
        y_est_str = "N/A"

    info = (f"Horizontal sensor: d={sensor_data['d_h']:.1f} cm, true angle={sensor_data['theta_true_h']:.1f}°, est angle={h_est_str}, x: {x_est_str}\n"
            f"Vertical sensor: d={sensor_data['d_v']:.1f} cm, true angle={sensor_data['theta_true_v']:.1f}°, est angle={v_est_str}, y: {y_est_str}")
    info_text.set_text(info)
    
    # Visual cue: if the estimated position is within the screen bounds
    if sensor_data['est_pos'] is not None:
        x_est, y_est = sensor_data['est_pos']
        if screen_offset[0] <= x_est <= screen_offset[0]+screen_width and screen_offset[1] <= y_est <= screen_offset[1]+screen_height:
            screen_rect.set_edgecolor('black')
            screen_rect.set_linewidth(2)
        else:
            screen_rect.set_edgecolor('red')
            screen_rect.set_linewidth(4)
    fig.canvas.draw_idle()

def on_rate_change(change):
    global refresh_rate_ms
    refresh_rate_ms = change['new']
rate_slider = widgets.IntSlider(value=100, min=50, max=500, step=50, description='Refresh (ms):')
rate_slider.observe(on_rate_change, names='value')
display(rate_slider)

ani = animation.FuncAnimation(fig, update, interval=refresh_rate_ms)
plt.legend()
plt.show()
