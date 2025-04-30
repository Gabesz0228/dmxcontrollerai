# Web Server for AI Lighting Control UI using Flask and SocketIO

from flask import Flask, render_template
from flask_socketio import SocketIO
import threading
import queue
import time
import sys
import os

# Add project root to Python path if needed (adjust path as necessary)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

# --- Flask App Setup ---
app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = os.urandom(24) # Simple secret key for session
socketio = SocketIO(app, async_mode="threading") # Use threading async mode
# -----------------------

# --- Status Queue ---
# Queue to receive status updates from the main application thread
status_queue = queue.Queue()
# --------------------

@app.route("/")
def index():
    """Serves the main HTML page."""
    return render_template("index.html")

@socketio.on("connect")
def handle_connect():
    print("UI Client connected")

@socketio.on("disconnect")
def handle_disconnect():
    print("UI Client disconnected")

def push_status_update(status_data):
    """Function to be called by the main application loop to send status updates."""
    # Add timestamp if needed
    # status_data["timestamp"] = time.time()
    status_queue.put(status_data)

def status_emitter_thread():
    """Background thread that reads from the queue and emits SocketIO events."""
    print("Starting status emitter thread...")
    while True:
        try:
            # Wait for a status update from the queue
            status_data = status_queue.get() # Blocks until an item is available
            # print(f"Emitting status: {status_data}") # Debug
            socketio.emit("status_update", status_data)
            status_queue.task_done() # Mark task as done
        except Exception as e:
            print(f"Error in status emitter thread: {e}", file=sys.stderr)
            time.sleep(1) # Avoid busy-looping on error

def start_web_server(host="0.0.0.0", port=5000):
    """Starts the Flask-SocketIO web server in a separate thread."""
    print(f"Starting Web UI Server on http://{host}:{port}")
    
    # Start the status emitter thread
    emitter = threading.Thread(target=status_emitter_thread, daemon=True)
    emitter.start()
    
    # Start the Flask-SocketIO server
    # Use a thread to avoid blocking the main application
    server_thread = threading.Thread(
        target=lambda: socketio.run(app, host=host, port=port, allow_unsafe_werkzeug=True), 
        daemon=True
    )
    server_thread.start()
    print("Web server thread started.")
    # Note: The main application thread needs to keep running for the server to stay alive.

# Example Usage (for testing if run directly)
if __name__ == "__main__":
    start_web_server()
    print("Web server started for testing. Sending dummy updates...")
    # Simulate status updates
    count = 0
    states = ["Idle", "Ambient", "BeatPulse", "Ambient", "OnsetFlash", "Ambient", "HighEnergy"]
    while True:
        dummy_status = {
            "system_status": "Running Test",
            "ai_state": states[count % len(states)],
            "tempo": 120.0 + (count % 10),
            "rms": 0.1 + (count % 5) * 0.1,
            "beat_now": (count % 4 == 0),
            "onset_now": (count % 7 == 0),
            "dmx_status": f"Simulated R={count%255} G={(count+85)%255} B={(count+170)%255}"
        }
        push_status_update(dummy_status)
        count += 1
        time.sleep(0.5)

