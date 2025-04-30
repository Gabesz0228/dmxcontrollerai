# Main Application - AI Lighting Control System Prototype (Phase 2 - Full)

import sys
import os
import time

# Add project root to Python path to allow importing modules
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

# Import the function that starts the real-time analysis stream
from audio_analysis.analyzer import start_analysis_stream
# Import the function to start the web server
from ui.web_server import start_web_server

def run_lighting_system():
    """Runs the main loop of the AI lighting control system by starting the web UI and audio stream."""
    print("Starting AI Lighting Control System Prototype (Phase 2 - Full System)...")
    
    # Start the Web UI server in a background thread
    start_web_server() # Runs on http://0.0.0.0:5000 by default
    
    # Give the web server a moment to start up
    time.sleep(1)
    
    # Start the audio analysis stream (this will block the main thread)
    # Status updates will be pushed to the UI from the audio callback
    start_analysis_stream()
    
    print("System stopped.")

if __name__ == "__main__":
    run_lighting_system()

