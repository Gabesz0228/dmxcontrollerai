# AI Lighting Control System Prototype (Phase 2)

This project is a prototype for an AI-driven lighting control system that analyzes audio input in real-time and generates corresponding DMX lighting commands.

This version includes enhancements based on the Phase 2 roadmap:
- Real Audio Input (using `sounddevice`)
- Advanced Audio Analysis (using `librosa` for tempo, beats, onsets, RMS)
- State Machine AI Decision Engine (using `python-statemachine`)
- DMX Hardware Interfacing (using `DmxPy` with simulation fallback)
- Configuration File (using `config.yaml`)
- Basic Web User Interface (using `Flask` and `Flask-SocketIO`)

## Project Structure

```
ai_lighting_prototype/
├── audio_analysis/
│   ├── analyzer.py         # Main audio stream handler, integrates analysis, decision, output, UI updates
│   └── beat_detection.py   # Librosa-based feature extraction (tempo, beats, onsets, RMS)
├── ai_decision/
│   └── decision_engine.py  # State machine logic for lighting decisions
├── dmx_control/
│   └── dmx_output.py       # Handles DMX output via DmxPy or simulation
├── main_app/
│   └── main.py             # Main application entry point, starts UI and audio stream
├── ui/
│   ├── web_server.py       # Flask/SocketIO web server for the UI
│   ├── templates/
│   │   └── index.html      # HTML template for the web UI
│   └── static/             # (Optional) For CSS/JS files
├── config.yaml             # Configuration file for audio, analysis, AI, DMX
├── config_loader.py        # Loads the configuration from config.yaml
└── README.md               # This file
```

## Setup and Installation

1.  **Prerequisites:**
    *   Python 3.7+
    *   `pip` (Python package installer)
    *   **PortAudio:** Required by `sounddevice`. Installation varies by OS:
        *   **Linux (Debian/Ubuntu):** `sudo apt-get update && sudo apt-get install portaudio19-dev python3-pyaudio` (pyaudio often pulls in portaudio)
        *   **macOS:** `brew install portaudio`
        *   **Windows:** Download binaries or use a package manager like Chocolatey (`choco install portaudio`).
    *   **(Optional) DMX Hardware:** An Enttec DMX USB Pro compatible interface if using `DmxPy` for real hardware control.

2.  **Install Python Libraries:**
    Navigate to the project directory in your terminal and run:
    ```bash
    pip install -r requirements.txt 
    ```
    *(Note: A `requirements.txt` file will be created)*

## Configuration (`config.yaml`)

Before running, review and modify `config.yaml`:

*   **`audio.input_device`:** Set to the desired audio input device ID (use `python -m sounddevice` to list devices) or leave `null` for the default.
*   **`analysis`:** Adjust buffer duration, hop length, and onset thresholds if needed (requires experimentation).
*   **`ai_decision`:** Tune energy thresholds for state transitions.
*   **`dmx.interface_type`:** Choose `DmxPy` for hardware or `Simulation` for console output.
*   **`dmx.fixtures`:** Define your DMX lighting fixtures, their starting channels, and channel profiles (e.g., which channel offset corresponds to red, green, blue).

## Running the Application

1.  Navigate to the `ai_lighting_prototype` directory in your terminal.
2.  Run the main application script:
    ```bash
    python3 main_app/main.py
    ```
3.  The application will:
    *   Load the configuration.
    *   Start the Web UI server (usually accessible at `http://localhost:5000` or `http://<your-ip>:5000`).
    *   Initialize the DMX interface (or simulation).
    *   Start capturing and analyzing audio.
    *   Send DMX commands based on the analysis and AI decisions.
    *   Push status updates to the web UI.

4.  Open your web browser and navigate to the UI address printed in the console to see the real-time status.

5.  Press `Ctrl+C` in the terminal to stop the application.

## Testing

*   **Simulation Mode:** Set `dmx.interface_type` to `Simulation` in `config.yaml`. Run the application and observe the simulated DMX commands printed in the console and the status updates in the web UI.
*   **Hardware Mode (`DmxPy`):**
    *   Connect your Enttec DMX USB Pro compatible interface.
    *   Set `dmx.interface_type` to `DmxPy` in `config.yaml`.
    *   Configure the `dmx.fixtures` section to match your lighting setup.
    *   Run the application. Ensure the correct serial port is detected (or specify it in `config.yaml` if needed).
    *   Observe your lights reacting to the audio input.

## Next Steps / Potential Improvements

*   **More Sophisticated AI:** Implement more complex rules, patterns, or machine learning models in the decision engine.
*   **Advanced DMX Control:** Implement smoother fades, chases, and effects in the `dmx_output` module based on tempo and intensity.
*   **Fixture Profiles:** Create a more robust system for defining and loading different fixture types and capabilities.
*   **Error Handling:** Improve error handling for audio device issues, DMX disconnections, etc.
*   **UI Enhancements:** Add controls to the UI (e.g., start/stop, select input device, adjust sensitivity), visualize audio features.
*   **Performance Optimization:** Profile and optimize audio analysis and DMX rendering loops if needed for lower latency.
*   **ArtNet/sACN Support:** Implement DMX output via ArtNet or sACN network protocols.

