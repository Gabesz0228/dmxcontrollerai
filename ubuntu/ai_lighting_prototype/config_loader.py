# Configuration Loader Module

import yaml
import os
import sys

CONFIG_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".", "config.yaml"))

_config = None

def load_config():
    """Loads the configuration from config.yaml."""
    global _config
    if _config is not None:
        return _config
        
    print(f"Loading configuration from: {CONFIG_FILE}")
    try:
        with open(CONFIG_FILE, "r") as f:
            _config = yaml.safe_load(f)
        if _config is None:
            print("Warning: config.yaml is empty or invalid.", file=sys.stderr)
            _config = {} # Return empty dict to avoid errors
        print("Configuration loaded successfully.")
        return _config
    except FileNotFoundError:
        print(f"Error: Configuration file not found at {CONFIG_FILE}", file=sys.stderr)
        print("Please ensure config.yaml exists in the project root.")
        # Fallback to a minimal default config to allow basic operation (simulation)
        _config = {
            "audio": {"input_device": None, "channels": 1, "sample_rate": 44100, "block_duration_ms": 50},
            "analysis": {"buffer_duration": 0.5, "hop_length": 256, "onset_threshold_factor_mean": 0.5, "onset_threshold_factor_std": 0.5},
            "ai_decision": {"energy_threshold_high": 0.3, "energy_threshold_low": 0.1},
            "dmx": {"interface_type": "Simulation", "fixtures": []}
        }
        print("Warning: Using fallback default configuration.", file=sys.stderr)
        return _config
    except yaml.YAMLError as e:
        print(f"Error parsing configuration file {CONFIG_FILE}: {e}", file=sys.stderr)
        sys.exit(1) # Exit if config is malformed
    except Exception as e:
        print(f"An unexpected error occurred loading configuration: {e}", file=sys.stderr)
        sys.exit(1)

def get_config():
    """Returns the loaded configuration dictionary."""
    if _config is None:
        return load_config()
    return _config

# Example Usage (for testing if run directly)
if __name__ == "__main__":
    config = get_config()
    print("\nLoaded Configuration:")
    import json
    print(json.dumps(config, indent=2))
    
    # Access example values
    print("\nExample Access:")
    print(f"Audio Device: {config.get(\"audio\", {}).get(\"input_device\")}")
    print(f"DMX Interface: {config.get(\"dmx\", {}).get(\"interface_type\")}")
    fixtures = config.get("dmx", {}).get("fixtures", [])
    if fixtures:
        print(f"First Fixture Start Channel: {fixtures[0].get(\"start_channel\")}")

