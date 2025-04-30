# AI Decision Engine Module using State Machine and Configuration

from statemachine import StateMachine, State
import random
import sys
import os

# Add project root to Python path if needed (adjust path as necessary)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from config_loader import get_config

# --- Load Configuration ---
config = get_config()
ai_config = config.get("ai_decision", {})
# -------------------------

# --- Configuration Values ---
ENERGY_THRESHOLD_HIGH = ai_config.get("energy_threshold_high", 0.3)
ENERGY_THRESHOLD_LOW = ai_config.get("energy_threshold_low", 0.1)
# ---------------------------

class LightingStateMachine(StateMachine):
    """Defines the states and transitions for the lighting control."""
    
    # --- States ---
    idle = State("Idle", initial=True)
    ambient = State("Ambient")
    beat_pulse = State("BeatPulse")
    onset_flash = State("OnsetFlash")
    high_energy = State("HighEnergy")
    
    # --- Transitions ---
    start_music = idle.to(ambient)
    stop_music = (
        ambient.to(idle) |
        beat_pulse.to(idle) |
        onset_flash.to(idle) |
        high_energy.to(idle)
    )
    
    detect_beat = (
        ambient.to(beat_pulse) |
        high_energy.to(beat_pulse) |
        beat_pulse.to(beat_pulse) # Stay in beat pulse on subsequent beats
    )
    
    detect_onset = (
        ambient.to(onset_flash) |
        beat_pulse.to(onset_flash) |
        high_energy.to(onset_flash)
    )
    
    increase_energy = (
        ambient.to(beat_pulse) |
        beat_pulse.to(high_energy)
    )
    
    decrease_energy = high_energy.to(ambient)
    
    pulse_finished = beat_pulse.to(ambient)
    flash_finished = onset_flash.to(ambient)
    
    # --- State Actions (simplified examples) ---
    def on_enter_idle(self):
        # print("State: Idle - Lights Off/Dim")
        self.current_command = {"action": "set_color", "color": (0, 0, 0), "brightness": 0.0}
        
    def on_enter_ambient(self):
        color = random.choice([(0, 0, 255), (0, 255, 0), (255, 0, 255)])
        # print(f"State: Ambient - Slow fade/static {color}")
        self.current_command = {"action": "set_color", "color": color, "brightness": 0.5}
        
    def on_enter_beat_pulse(self):
        color = (255, 255, 255)
        # print(f"State: BeatPulse - Bright pulse {color}")
        self.current_command = {"action": "pulse", "color": color, "brightness": 1.0}
        self.send("pulse_finished") 
        
    def on_enter_onset_flash(self):
        color = random.choice([(255, 0, 0), (255, 255, 0)])
        # print(f"State: OnsetFlash - Quick flash {color}")
        self.current_command = {"action": "flash", "color": color, "brightness": 1.0}
        self.send("flash_finished")
        
    def on_enter_high_energy(self):
        color = random.choice([(255, 0, 0), (0, 255, 255), (255, 100, 0)])
        # print(f"State: HighEnergy - Active state {color}")
        self.current_command = {"action": "set_color", "color": color, "brightness": 0.8}
        
    # --- Initialization ---
    def __init__(self):
        super().__init__()
        self.current_command = {"action": "set_color", "color": (0, 0, 0), "brightness": 0.0}
        self.last_rms = 0.0
        # Use configured thresholds
        self.energy_threshold_high = ENERGY_THRESHOLD_HIGH
        self.energy_threshold_low = ENERGY_THRESHOLD_LOW

# Instantiate the state machine
lighting_sm = LightingStateMachine()

def make_lighting_decision(analysis_results):
    """Makes lighting decisions based on audio analysis using the state machine."""
    global lighting_sm
    
    rms = analysis_results.get("rms", 0.0)
    beat_now = analysis_results.get("beat_now", False)
    onset_now = analysis_results.get("onset_now", False)
    tempo = analysis_results.get("tempo", 0.0)
    
    # --- Determine Triggers based on analysis --- 
    trigger = None
    
    # Energy level changes (using configured thresholds)
    if rms > lighting_sm.energy_threshold_high and lighting_sm.last_rms <= lighting_sm.energy_threshold_high:
        if lighting_sm.can_increase_energy():
            trigger = "increase_energy"
    elif rms < lighting_sm.energy_threshold_low and lighting_sm.last_rms >= lighting_sm.energy_threshold_low:
        if lighting_sm.can_decrease_energy():
            trigger = "decrease_energy"
            
    # Prioritize onset/beat triggers if energy didn\t change state
    if trigger is None:
        if onset_now and lighting_sm.can_detect_onset():
             trigger = "detect_onset"
        elif beat_now and lighting_sm.can_detect_beat():
             trigger = "detect_beat"
             
    # Handle starting/stopping (basic RMS check for silence)
    if rms > 0.01 and lighting_sm.is_idle:
        trigger = "start_music"
    elif rms < 0.01 and not lighting_sm.is_idle:
        trigger = "stop_music"
        
    # --- Send trigger to state machine --- 
    if trigger:
        try:
            lighting_sm.send(trigger)
        except Exception as e:
            print(f"State machine error sending trigger ", trigger, ": ", e, file=sys.stderr)
            
    # Update last RMS for next comparison
    lighting_sm.last_rms = rms
    
    # Return the command set by the state machine\s actions
    command = lighting_sm.current_command.copy()
    command["tempo"] = tempo
    command["intensity"] = rms 
    return command

# Example Usage (for testing if run directly)
if __name__ == "__main__":
    print("Testing State Machine Logic with Configured Thresholds...")
    print(f"High Energy Threshold: {lighting_sm.energy_threshold_high}")
    print(f"Low Energy Threshold: {lighting_sm.energy_threshold_low}")
    print(f"Initial State: {lighting_sm.current_state.id}")
    
    # Simulate some analysis results
    test_analysis_1 = {"rms": 0.1, "beat_now": False, "onset_now": False, "tempo": 120.0}
    decision1 = make_lighting_decision(test_analysis_1)
    print("Decision 1 (low RMS):", decision1, "State:", lighting_sm.current_state.id)
    
    test_analysis_2 = {"rms": 0.4, "beat_now": False, "onset_now": False, "tempo": 120.0}
    decision2 = make_lighting_decision(test_analysis_2)
    print("Decision 2 (high RMS):", decision2, "State:", lighting_sm.current_state.id)

    test_analysis_3 = {"rms": 0.4, "beat_now": True, "onset_now": False, "tempo": 120.0}
    decision3 = make_lighting_decision(test_analysis_3)
    print("Decision 3 (beat):", decision3, "State:", lighting_sm.current_state.id)
    print("State after immediate transition:", lighting_sm.current_state.id)

    test_analysis_4 = {"rms": 0.4, "beat_now": False, "onset_now": True, "tempo": 120.0}
    decision4 = make_lighting_decision(test_analysis_4)
    print("Decision 4 (onset):", decision4, "State:", lighting_sm.current_state.id)
    print("State after immediate transition:", lighting_sm.current_state.id)
    
    test_analysis_5 = {"rms": 0.05, "beat_now": False, "onset_now": False, "tempo": 120.0}
    decision5 = make_lighting_decision(test_analysis_5)
    print("Decision 5 (low RMS again):", decision5, "State:", lighting_sm.current_state.id)

    test_analysis_6 = {"rms": 0.0, "beat_now": False, "onset_now": False, "tempo": 0.0}
    decision6 = make_lighting_decision(test_analysis_6)
    print("Decision 6 (silence):", decision6, "State:", lighting_sm.current_state.id)

