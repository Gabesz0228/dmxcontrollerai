# Implements beat, tempo, and onset detection using Librosa and configuration

import librosa
import numpy as np
import sys
import os

# Add project root to Python path if needed (adjust path as necessary)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from config_loader import get_config

# --- Load Configuration ---
config = get_config()
analysis_config = config.get("analysis", {})
# -------------------------

# --- Configuration Values ---
_buffer_target_duration = analysis_config.get("buffer_duration", 0.5) # seconds
_hop_length_analysis = analysis_config.get("hop_length", 256)
_onset_threshold_factor_mean = analysis_config.get("onset_threshold_factor_mean", 0.5)
_onset_threshold_factor_std = analysis_config.get("onset_threshold_factor_std", 0.5)
# ---------------------------

# Store previous audio block to have enough context for analysis
_audio_buffer = np.array([], dtype=np.float32)

def analyze_audio_features(audio_chunk, sample_rate):
    """Analyzes an audio chunk using Librosa to extract features.

    Args:
        audio_chunk (np.ndarray): The current audio chunk (float32).
        sample_rate (int): The sample rate of the audio.

    Returns:
        dict: A dictionary containing extracted audio features:
              { "tempo": float, "beats": np.ndarray, "onset_strengths": np.ndarray, 
                "rms": float, "beat_now": bool, "onset_now": bool }
    """
    global _audio_buffer
    
    # Append new chunk to buffer
    _audio_buffer = np.concatenate((_audio_buffer, audio_chunk))
    
    # Trim buffer if it exceeds target duration significantly (e.g., > 2x)
    max_buffer_len = int(_buffer_target_duration * sample_rate * 2)
    if len(_audio_buffer) > max_buffer_len:
        _audio_buffer = _audio_buffer[-max_buffer_len:]
        
    # Check if buffer is long enough for analysis
    min_buffer_len = int(_buffer_target_duration * sample_rate)
    if len(_audio_buffer) < min_buffer_len:
        # Not enough data yet, return default/empty values
        return {
            "tempo": 0.0,
            "beats": np.array([]),
            "onset_strengths": np.array([]),
            "rms": np.mean(librosa.feature.rms(y=audio_chunk)[0]) if len(audio_chunk) > 0 else 0.0,
            "beat_now": False,
            "onset_now": False
        }
        
    # --- Perform Librosa Analysis on the buffer ---
    try:
        # Tempo and Beats
        tempo, beats = librosa.beat.beat_track(y=_audio_buffer, sr=sample_rate, hop_length=_hop_length_analysis)
        
        # Onset Strength Envelope
        onset_env = librosa.onset.onset_strength(y=_audio_buffer, sr=sample_rate, hop_length=_hop_length_analysis)
        
        # RMS Energy (using the whole buffer for a more stable value)
        rms = np.mean(librosa.feature.rms(y=_audio_buffer)[0])
        
        # --- Check if a beat or significant onset occurs *now* ---
        current_chunk_start_time = (len(_audio_buffer) - len(audio_chunk)) / sample_rate
        
        beat_now = False
        beat_times = librosa.frames_to_time(beats, sr=sample_rate, hop_length=_hop_length_analysis)
        if len(beat_times) > 0 and beat_times[-1] >= current_chunk_start_time:
             beat_now = True
             
        # Simple onset detection check
        onset_start_frame = librosa.time_to_frames(current_chunk_start_time, sr=sample_rate, hop_length=_hop_length_analysis)
        onset_now = False
        if len(onset_env) > onset_start_frame:
            current_onset_segment = onset_env[onset_start_frame:]
            # Use configured threshold factors
            onset_threshold = (_onset_threshold_factor_mean * np.mean(onset_env) + 
                               _onset_threshold_factor_std * np.std(onset_env))
            if np.max(current_onset_segment) > onset_threshold:
                 onset_now = True

        # Trim buffer slightly
        keep_len = int(_buffer_target_duration * sample_rate * 1.1) 
        _audio_buffer = _audio_buffer[-keep_len:]
        
        return {
            "tempo": float(tempo) if tempo else 0.0,
            "beats": beat_times,
            "onset_strengths": onset_env,
            "rms": float(rms),
            "beat_now": beat_now,
            "onset_now": onset_now
        }

    except Exception as e:
        print(f"Librosa analysis error: {e}", file=sys.stderr)
        return {
            "tempo": 0.0,
            "beats": np.array([]),
            "onset_strengths": np.array([]),
            "rms": np.mean(librosa.feature.rms(y=audio_chunk)[0]) if len(audio_chunk) > 0 else 0.0,
            "beat_now": False,
            "onset_now": False
        }

