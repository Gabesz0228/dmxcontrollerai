# DMX Control Module - Output using DmxPy and Configuration

import time
import sys
import os

# Add project root to Python path if needed (adjust path as necessary)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from config_loader import get_config

# --- Load Configuration ---
config = get_config()
dmx_config = config.get("dmx", {})
# -------------------------

# --- Configuration Values ---
INTERFACE_TYPE = dmx_config.get("interface_type", "Simulation")
FIXTURES = dmx_config.get("fixtures", [])
# DmxPy specific
DMXPY_SERIAL_PORT = dmx_config.get("serial_port", None) 
# ArtNet specific (add later)
# ARTNET_TARGET_IP = dmx_config.get("target_ip", None)
# ARTNET_UNIVERSE = dmx_config.get("universe", 0)
# sACN specific (add later)
# SACN_UNIVERSE = dmx_config.get("sacn_universe", 1)
# ---------------------------

dmx = None
DMX_AVAILABLE = False

def initialize_dmx():
    """Initializes the DMX interface based on configuration."""
    global dmx, DMX_AVAILABLE
    
    if dmx is not None: # Already initialized
        return
        
    print(f"Initializing DMX Interface: {INTERFACE_TYPE}")
    
    if INTERFACE_TYPE == "DmxPy":
        try:
            from DmxPy import DmxPy
            dmx = DmxPy(serial_port=DMXPY_SERIAL_PORT) # Pass port if specified
            DMX_AVAILABLE = True
            print("DMX Interface Initialized (using DmxPy).")
        except ImportError:
            print("DmxPy library not found. DMX output will be simulated.", file=sys.stderr)
            DMX_AVAILABLE = False
        except Exception as e:
            print(f"Error initializing DmxPy: {e}. DMX output will be simulated.", file=sys.stderr)
            DMX_AVAILABLE = False
            
    # TODO: Add initialization for ArtNet, sACN based on config
    # elif INTERFACE_TYPE == "ArtNet":
    #     # Initialize ArtNet library
    #     pass
    # elif INTERFACE_TYPE == "sACN":
    #     # Initialize sACN library
    #     pass
        
    else: # Default to Simulation
        print("DMX Interface Type set to Simulation or invalid.")
        DMX_AVAILABLE = False

def send_dmx_command(lighting_decision):
    """Sends the lighting command to the DMX interface or simulates it."""
    global dmx, DMX_AVAILABLE, FIXTURES
    
    if not DMX_AVAILABLE and INTERFACE_TYPE != "Simulation":
        # print("Attempting DMX initialization before sending command...")
        initialize_dmx() # Try to initialize if not already done
        
    action = lighting_decision.get("action", "set_color")
    color = lighting_decision.get("color", (0, 0, 0))
    brightness = lighting_decision.get("brightness", 0.0)
    
    # Apply brightness to color
    r = int(color[0] * brightness)
    g = int(color[1] * brightness)
    b = int(color[2] * brightness)
    
    # Clamp values to 0-255
    r = max(0, min(255, r))
    g = max(0, min(255, g))
    b = max(0, min(255, b))
    
    if DMX_AVAILABLE and dmx:
        try:
            # --- Apply command to DMX channels based on fixture profiles ---
            for fixture in FIXTURES:
                start_channel = fixture.get("start_channel", 1)
                profile = fixture.get("profile", {})
                
                # Basic RGB profile handling
                ch_r = profile.get("red")
                ch_g = profile.get("green")
                ch_b = profile.get("blue")
                
                if ch_r is not None: dmx.set_channel(start_channel + ch_r, r)
                if ch_g is not None: dmx.set_channel(start_channel + ch_g, g)
                if ch_b is not None: dmx.set_channel(start_channel + ch_b, b)
                
                # TODO: Add handling for other profile channels (dimmer, strobe, etc.)
                # ch_dimmer = profile.get("dimmer")
                # if ch_dimmer is not None: dmx.set_channel(start_channel + ch_dimmer, int(brightness * 255))

            dmx.render()
            
        except Exception as e:
            print(f"Error sending DMX command: {e}", file=sys.stderr)
    else:
        # --- Simulation --- 
        fixture_details = f" for {len(FIXTURES)} fixture(s)" if FIXTURES else ""
        print(f"Simulated DMX Output{fixture_details}: Action={action}, Color={color}, Brightness={brightness:.2f} -> R={r}, G={g}, B={b}")

# Example Usage (for testing if run directly)
if __name__ == "__main__":
    print("Testing DMX Output Module with Configuration...")
    initialize_dmx() # Initialize based on config
    
    if DMX_AVAILABLE:
        print("Attempting to send test sequence via configured interface...")
    else:
        print("DMX Hardware/Library not available or Simulation mode. Running simulation test:")
        
    test_commands = [
        {"action": "set_color", "color": (255, 0, 0), "brightness": 0.5}, # Red
        {"action": "set_color", "color": (0, 255, 0), "brightness": 0.5}, # Green
        {"action": "set_color", "color": (0, 0, 255), "brightness": 0.5}, # Blue
        {"action": "set_color", "color": (255, 255, 255), "brightness": 1.0}, # White Full
        {"action": "set_color", "color": (0, 0, 0), "brightness": 0.0},     # Off
    ]
    for cmd in test_commands:
        send_dmx_command(cmd)
        time.sleep(1)
    print("Test sequence complete.")

