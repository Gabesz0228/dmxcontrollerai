# Integrates real audio input, analysis, and UI updates using configuration

import sounddevice as sd
import numpy as np
import time
import sys
import os

# Add project root to Python path if needed (adjust path as necessary)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

# Import necessary components from other modules
from config_loader import get_config
from audio_analysis.beat_detection import analyze_audio_features
from ai_decision.decision_engine import make_lighting_decision, lighting_sm # Import state machine instance
from dmx_control.dmx_output import send_dmx_command, initialize_dmx, DMX_AVAILABLE, INTERFACE_TYPE # Import DMX status
from ui.web_server import push_status_update # Import function to send status to UI

# --- Load Configuration ---
config = get_config()
audio_config = config.get("audio", {})
analysis_config = config.get("analysis", {})
# -------------------------

# --- Configuration Values ---
DEVICE = audio_config.get("input_device", None)
CHANNELS = audio_config.get("channels", 1)
SAMPLE_RATE = audio_config.get("sample_rate", 44100)
BLOCK_DURATION_MS = audio_config.get("block_duration_ms", 50)
BLOCKSIZE = int(SAMPLE_RATE * BLOCK_DURATION_MS / 1000)
# ---------------------------

def audio_callback(indata, frames, time_info, status):
    """This function is called by sounddevice for each new audio block."""
    if status:
        print(f"Audio Callback Status: {status}", file=sys.stderr)
        
    # Ensure input data is 1D (mono)
    audio_chunk = indata[:, 0] if indata.ndim > 1 else indata
    
    # --- Analysis Step ---
    analysis_results = analyze_audio_features(audio_chunk, SAMPLE_RATE)
    
    # --- Decision Step ---
    lighting_decision = make_lighting_decision(analysis_results)
    
    # --- Output Step ---
    send_dmx_command(lighting_decision)
    
    # --- UI Status Update ---
    try:
        dmx_status_str = f"{INTERFACE_TYPE}{'' if DMX_AVAILABLE else ' (Simulated)'}"
        status_data = {
            "system_status": "Running",
            "ai_state": lighting_sm.current_state.id,
            "tempo": analysis_results.get("tempo", 0.0),
            "rms": analysis_results.get("rms", 0.0),
            "beat_now": analysis_results.get("beat_now", False),
            "onset_now": analysis_results.get("onset_now", False),
            "dmx_status": dmx_status_str
        }
        push_status_update(status_data)
    except Exception as ui_err:
        print(f"Error pushing status update to UI: {ui_err}", file=sys.stderr)

def start_analysis_stream():
    """Starts the real-time audio analysis stream."""
    print("Starting Real-time Audio Analysis Stream...")
    print(f"Using device: {DEVICE if DEVICE is not None else \"Default\"}")
    print(f"Sample Rate: {SAMPLE_RATE}, Blocksize: {BLOCKSIZE}, Channels: {CHANNELS}")
    
    # Initialize DMX based on config before starting audio stream
    initialize_dmx()
    
    try:
        with sd.InputStream(
            device=DEVICE,
            channels=CHANNELS,
            samplerate=SAMPLE_RATE,
            blocksize=BLOCKSIZE,
            dtype=\"float32\", # Librosa prefers float32
            callback=audio_callback
        ):
            print("Stream started. Press Ctrl+C to stop.")
            # Keep the main thread alive (the web server runs in its own thread)
            while True:
                time.sleep(1) 
                
    except KeyboardInterrupt:
        print("\nStream stopped by user.")
        push_status_update({"system_status": "Stopped"}) # Notify UI
    except Exception as e:
        print(f"An error occurred in audio stream: {e}", file=sys.stderr)
        push_status_update({"system_status": "Error", "error_message": str(e)})
        try:
            print("\nAvailable audio devices:")
            print(sd.query_devices())
        except Exception as sd_err:
            print(f"Could not query sound devices: {sd_err}", file=sys.stderr)
    finally:
        print("Audio stream closed.")

# Note: The main execution logic is now in main.py
# if __name__ == \"__main__\":
#     start_analysis_stream()

