import React, { useEffect, useRef, useState } from 'react';

const AudioVisualizer = () => {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);
  const previousVolumeRef = useRef([]);
  const beatHistoryRef = useRef([]);
  const energyHistoryRef = useRef([]);
  const structureHistoryRef = useRef([]);
  const onsetDetectorRef = useRef(null);
  const tempoEstimatorRef = useRef(null);
  const keyEstimatorRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState({
    volume: 0,
    frequencies: [],
    waveform: [],
    beatDetected: false,
    dropDetected: false,
    musicPhase: 'ambient',
    frequencyBands: {
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0
    },
    energyLevel: 0,
    bpm: 0,
    musicalKey: 'Unknown',
    dynamics: 0,
    brightness: 0,
    chordComplexity: 0,
    rhythmCoherence: 0
  });
  const [visualizationType, setVisualizationType] = useState('waveform');
  const [showAdvancedAnalysis, setShowAdvancedAnalysis] = useState(false);
  const [audioFeatures, setAudioFeatures] = useState({
    spectralCentroid: 0,
    spectralFlux: 0,
    spectralFlatness: 0,
    zeroCrossingRate: 0,
    percussiveness: 0,
    harmonicity: 0
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 16384; // Even higher resolution
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      
      previousVolumeRef.current = [];
      beatHistoryRef.current = [];
      energyHistoryRef.current = [];
      structureHistoryRef.current = [];
      
      initializeAdvancedAnalysis(audioContext);
      
      setIsRecording(true);
      draw();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Error accessing microphone. Please make sure you've granted permission.");
    }
  };
  
  const initializeAdvancedAnalysis = (audioContext) => {
    onsetDetectorRef.current = createOnsetDetector(audioContext);
    tempoEstimatorRef.current = createTempoEstimator();
    keyEstimatorRef.current = createKeyEstimator();
  };
  
  const createOnsetDetector = (audioContext) => {
    const bufferSize = 2048;
    const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    const energyHistory = new Float32Array(8);
    let energyHistoryPos = 0;
    let lastOnsetTime = 0;
    
    scriptNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      let energy = 0;
      
      for (let i = 0; i < bufferSize; i++) {
        energy += input[i] * input[i];
      }
      energy = Math.sqrt(energy / bufferSize);
      
      energyHistory[energyHistoryPos] = energy;
      energyHistoryPos = (energyHistoryPos + 1) % energyHistory.length;
      
      let meanEnergy = 0;
      for (let i = 0; i < energyHistory.length; i++) {
        meanEnergy += energyHistory[i];
      }
      meanEnergy /= energyHistory.length;
      
      const now = audioContext.currentTime;
      if (energy > 1.5 * meanEnergy && energy > 0.01 && now - lastOnsetTime > 0.05) {
        const onsetInfo = { time: now, energy: energy };
        tempoEstimatorRef.current.addOnset(onsetInfo);
        lastOnsetTime = now;
      }
    };
    
    analyserRef.current.connect(scriptNode);
    scriptNode.connect(audioContext.destination);
    
    return scriptNode;
  };
  
  const createTempoEstimator = () => {
    const tempoEstimator = {
      onsets: [],
      interOnsetIntervals: [],
      tempoCandidates: new Map(),
      
      addOnset(onsetInfo) {
        const now = onsetInfo.time;
        if (this.onsets.length > 0) {
          const lastOnsetTime = this.onsets[this.onsets.length - 1].time;
          const ioi = now - lastOnsetTime;
          
          if (ioi > 0.1 && ioi < 2.0) {
            this.interOnsetIntervals.push(ioi);
            this.updateTempoCandidates(ioi);
          }
        }
        
        this.onsets.push(onsetInfo);
        if (this.onsets.length > 200) {
          this.onsets.shift();
        }
        
        if (this.interOnsetIntervals.length > 100) {
          this.interOnsetIntervals.shift();
        }
      },
      
      updateTempoCandidates(ioi) {
        const bpm = Math.round(60 / ioi);
        if (bpm >= 50 && bpm <= 250) {
          if (this.tempoCandidates.has(bpm)) {
            this.tempoCandidates.set(bpm, this.tempoCandidates.get(bpm) + 1);
          } else {
            this.tempoCandidates.set(bpm, 1);
          }
          
          const multiples = [0.5, 2];
          for (const multiple of multiples) {
            const relatedBpm = Math.round(bpm * multiple);
            if (relatedBpm >= 50 && relatedBpm <= 250) {
              if (this.tempoCandidates.has(relatedBpm)) {
                this.tempoCandidates.set(relatedBpm, this.tempoCandidates.get(relatedBpm) + 0.5);
              } else {
                this.tempoCandidates.set(relatedBpm, 0.5);
              }
            }
          }
        }
        
        if (this.tempoCandidates.size > 40) {
          const entries = Array.from(this.tempoCandidates.entries());
          entries.sort((a, b) => a[1] - b[1]);
          for (let i = 0; i < 10; i++) {
            if (entries[i]) {
              this.tempoCandidates.delete(entries[i][0]);
            }
          }
        }
      },
      
      getBestTempo() {
        if (this.tempoCandidates.size === 0) return 0; 
        
        let bestBpm = 0;
        let bestScore = 0;
        
        this.tempoCandidates.forEach((score, bpm) => {
          if (score > bestScore) {
            bestScore = score;
            bestBpm = bpm;
          }
        });
        
        return bestBpm;
      },
      
      getCurrentIOIs() {
        return this.interOnsetIntervals.slice(-20);
      }
    };
    
    return tempoEstimator;
  };
  
  const createKeyEstimator = () => {
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    
    return {
      chromaHistory: Array(12).fill(0),
      pitchClasses: Array(12).fill(0),
      
      updateChroma(frequencyData, sampleRate, fftSize) {
        const binSize = sampleRate / fftSize;
        const chromaFrame = Array(12).fill(0);
        
        for (let i = 0; i < frequencyData.length; i++) {
          const frequency = i * binSize;
          if (frequency > 60 && frequency < 4000) { // Focus on musically relevant range
            const amplitude = frequencyData[i] / 256;
            if (amplitude > 0.01) { // Threshold to reduce noise
              const pitchClass = this.frequencyToPitchClass(frequency);
              chromaFrame[pitchClass] += amplitude;
            }
          }
        }
        
        this.normalizeChroma(chromaFrame);
        
        for (let i = 0; i < 12; i++) {
          this.chromaHistory[i] = this.chromaHistory[i] * 0.8 + chromaFrame[i] * 0.2;
        }
        
        this.normalizeChroma(this.chromaHistory);
        this.pitchClasses = [...this.chromaHistory];
      },
      
      frequencyToPitchClass(frequency) {
        const A4 = 440.0;
        const A4_INDEX = 69;
        const SEMITONES_IN_OCTAVE = 12;
        
        if (frequency <= 0) return 0;
        
        // Convert frequency to MIDI note number
        const noteNumber = SEMITONES_IN_OCTAVE * Math.log2(frequency / A4) + A4_INDEX;
        
        // Convert MIDI note number to pitch class (0-11)
        return Math.round(noteNumber) % SEMITONES_IN_OCTAVE;
      },
      
      normalizeChroma(chroma) {
        const sum = chroma.reduce((acc, val) => acc + val, 0);
        if (sum > 0) {
          for (let i = 0; i < chroma.length; i++) {
            chroma[i] /= sum;
          }
        }
      },
      
      estimateKey() {
        if (this.pitchClasses.every(val => val === 0)) return 'Unknown';
        
        let bestKeyIndex = 0;
        let bestKeyScore = -Infinity;
        let isMajor = true;
        
        // Check correlation with all possible major and minor keys
        for (let i = 0; i < 12; i++) {
          // Calculate correlation for major key
          let majorCorrelation = 0;
          for (let j = 0; j < 12; j++) {
            majorCorrelation += this.pitchClasses[j] * MAJOR_PROFILE[(j - i + 12) % 12];
          }
          
          // Calculate correlation for minor key
          let minorCorrelation = 0;
          for (let j = 0; j < 12; j++) {
            minorCorrelation += this.pitchClasses[j] * MINOR_PROFILE[(j - i + 12) % 12];
          }
          
          // Find the best correlation
          if (majorCorrelation > bestKeyScore) {
            bestKeyScore = majorCorrelation;
            bestKeyIndex = i;
            isMajor = true;
          }
          
          if (minorCorrelation > bestKeyScore) {
            bestKeyScore = minorCorrelation;
            bestKeyIndex = i;
            isMajor = false;
          }
        }
        
        return `${NOTE_NAMES[bestKeyIndex]} ${isMajor ? 'Major' : 'minor'}`;
      },
      
      getChordComplexity() {
        const sorted = [...this.pitchClasses].sort((a, b) => b - a);
        const topNotes = sorted.slice(0, 4);
        const bottomNotes = sorted.slice(4);
        
        const topSum = topNotes.reduce((sum, val) => sum + val, 0);
        const bottomSum = bottomNotes.reduce((sum, val) => sum + val, 0);
        
        if (topSum === 0) return 0;
        
        const complexity = bottomSum / topSum;
        return Math.min(1, complexity * 3); // Scale to 0-1 range
      }
    };
  };
  
  const stopRecording = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (onsetDetectorRef.current) {
      onsetDetectorRef.current.disconnect();
      onsetDetectorRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    setIsRecording(false);
  };
  
  const calculateImprovedBPM = () => {
    if (!tempoEstimatorRef.current) return 0;
    return tempoEstimatorRef.current.getBestTempo();
  };
  
  const detectBeat = (volume, frequencyBands, waveform) => {
    const prevVol = previousVolumeRef.current;
    
    if (prevVol.length < 8) {
      previousVolumeRef.current = [...prevVol, volume].slice(-20);
      return false;
    }
    
    const recentWeight = 0.65;
    const olderWeight = 0.35;
    const recentAvg = prevVol.slice(-4).reduce((sum, v) => sum + v, 0) / 4;
    const olderAvg = prevVol.slice(-12, -4).reduce((sum, v) => sum + v, 0) / 8;
    const weightedAvg = recentAvg * recentWeight + olderAvg * olderWeight;
    
    previousVolumeRef.current = [...prevVol, volume].slice(-20);
    
    const bassPunch = frequencyBands.bass > 0.7 && frequencyBands.bass > weightedAvg * 1.3;
    
    let transientStrength = 0;
    if (waveform && waveform.length > 10) {
      for (let i = 5; i < waveform.length - 5; i++) {
        const before = Math.abs((waveform[i-5] / 128.0) - 1);
        const current = Math.abs((waveform[i] / 128.0) - 1);
        if (current > 0.3 && current > before * 2.0) {
          transientStrength = Math.max(transientStrength, current);
        }
      }
    }
    
    const volumeSpike = volume > weightedAvg * 1.20 && volume > 0.15;
    const strongTransient = transientStrength > 0.4;
    
    // Multi-factor beat detection
    const isBeat = volumeSpike || bassPunch || strongTransient;
    
    if (isBeat) {
      const now = Date.now();
      const minBeatInterval = beatHistoryRef.current.length > 4 ? 
        60000 / (calculateImprovedBPM() * 2.5) : 200;
      
      if (beatHistoryRef.current.length === 0 || now - beatHistoryRef.current[beatHistoryRef.current.length - 1] > minBeatInterval) {
        beatHistoryRef.current = [...beatHistoryRef.current, now].slice(-40);
      }
    }
    
    return isBeat;
  };
  
  // Analyze frequency bands
  const analyzeFrequencyBands = (frequencyData, sampleRate, fftSize) => {
    const bands = {
      bass: [20, 250],
      lowMid: [250, 500],
      mid: [500, 2000],
      highMid: [2000, 6000],
      treble: [6000, 20000]
    };
    
    const binSize = sampleRate / fftSize;
    const result = {};
    let totalEnergy = 0;
    
    Object.keys(bands).forEach(band => {
      const [lowFreq, highFreq] = bands[band];
      const lowBin = Math.floor(lowFreq / binSize);
      const highBin = Math.min(Math.ceil(highFreq / binSize), frequencyData.length - 1);
      
      let sum = 0;
      let count = 0;
      let peak = 0;
      
      for (let i = lowBin; i <= highBin; i++) {
        sum += frequencyData[i];
        count++;
        peak = Math.max(peak, frequencyData[i]);
      }
      
      const avg = count > 0 ? sum / (count * 256) : 0;
      const peakNormalized = peak / 256;
      
      const value = avg * 0.7 + peakNormalized * 0.3;
      
      result[band] = value;
      totalEnergy += value;
    });
    
    const normalizedEnergy = totalEnergy / Object.keys(bands).length;
    
    return {
      bands: result,
      totalEnergy: normalizedEnergy
    };
  };

  const analyzeMusicStructure = (currentAudio, energyHistory) => {
    const result = {
      dropDetected: false,
      musicPhase: 'ambient'
    };
    
    if (energyHistory.length < 30) {
      return result;
    }
    
    const { frequencyBands, volume, energyLevel } = currentAudio;
    
    const recentEnergyAvg = energyHistory.slice(-15).reduce((sum, e) => sum + e.total, 0) / 15;
    const mediumEnergyAvg = energyHistory.slice(-30).reduce((sum, e) => sum + e.total, 0) / 30;
    const longEnergyAvg = energyHistory.slice(-90).reduce((sum, e) => sum + e.total, 0) / Math.min(90, energyHistory.length);
    
    const recentBassAvg = energyHistory.slice(-15).reduce((sum, e) => sum + e.bass, 0) / 15;
    const mediumBassAvg = energyHistory.slice(-30).reduce((sum, e) => sum + e.bass, 0) / 30;
    const longBassAvg = energyHistory.slice(-90).reduce((sum, e) => sum + e.bass, 0) / Math.min(90, energyHistory.length);
    
    const shortTermTrend = recentEnergyAvg - mediumEnergyAvg;
    const longTermTrend = mediumEnergyAvg - longEnergyAvg;
    
    const currentBass = frequencyBands.bass;
    const currentEnergy = energyLevel;
    
    const energyRising = shortTermTrend > 0.05;
    const energyFalling = shortTermTrend < -0.05;
    const sustainedHighEnergy = recentEnergyAvg > 0.6 && Math.abs(shortTermTrend) < 0.03;
    const suddenEnergyDrop = shortTermTrend < -0.1 && recentEnergyAvg < mediumEnergyAvg * 0.7;
    const suddenEnergyRise = recentEnergyAvg > mediumEnergyAvg * 1.3 && recentEnergyAvg > 0.5;
    const suddenBassImpact = currentBass > recentBassAvg * 1.3 && currentBass > 0.5;
    const sustainedBassLine = recentBassAvg > 0.5 && Math.abs(recentBassAvg - mediumBassAvg) < 0.1;
    
    const midToHighRatio = (frequencyBands.mid + frequencyBands.highMid) / 
                           (frequencyBands.bass + frequencyBands.lowMid + 0.001);
    
    const harmonicChange = midToHighRatio > 1.3 && frequencyBands.highMid > 0.4;
    
    if (analyzeMusicStructure.lastPhaseChange === undefined) {
      analyzeMusicStructure.lastPhaseChange = 0;
      analyzeMusicStructure.currentPhase = 'ambient';
      analyzeMusicStructure.dropActive = false;
      analyzeMusicStructure.dropStartTime = 0;
      analyzeMusicStructure.buildStartTime = 0;
      analyzeMusicStructure.phraseCount = 0;
    }
    
    const now = Date.now();
    const phaseDebounceTime = 2000;
    
    let newPhase = analyzeMusicStructure.currentPhase;
    
    if (now - analyzeMusicStructure.lastPhaseChange > phaseDebounceTime) {
      if ((suddenEnergyRise && suddenBassImpact && longTermTrend > 0) || 
          (sustainedHighEnergy && sustainedBassLine && analyzeMusicStructure.currentPhase === 'build')) {
        newPhase = 'drop';
        analyzeMusicStructure.dropActive = true;
        analyzeMusicStructure.dropStartTime = now;
      }
      else if (energyRising && longTermTrend > 0 && !suddenEnergyDrop) {
        newPhase = 'build';
        if (analyzeMusicStructure.currentPhase !== 'build') {
          analyzeMusicStructure.buildStartTime = now;
        }
      }
      else if (suddenEnergyDrop && (analyzeMusicStructure.currentPhase === 'drop' || analyzeMusicStructure.currentPhase === 'peak')) {
        newPhase = 'breakdown';
      }
      else if (sustainedHighEnergy && analyzeMusicStructure.currentPhase === 'drop' && now - analyzeMusicStructure.dropStartTime > 8000) {
        newPhase = 'peak';
      }
      else if (harmonicChange && currentEnergy > 0.4 && currentEnergy < 0.6) {
        newPhase = 'bridge';
      }
      else if (currentEnergy < 0.3 && Math.abs(shortTermTrend) < 0.05) {
        newPhase = 'ambient';
      }
      else if (energyFalling && longTermTrend < -0.05) {
        newPhase = 'outro';
      }
      
      if (newPhase !== analyzeMusicStructure.currentPhase) {
        analyzeMusicStructure.lastPhaseChange = now;
        analyzeMusicStructure.currentPhase = newPhase;
        
        if (newPhase === 'build' || newPhase === 'drop') {
          analyzeMusicStructure.phraseCount++;
        }
      }
    }
    
    let dropActive = analyzeMusicStructure.dropActive;
    
    if (dropActive && (
        now - analyzeMusicStructure.dropStartTime > 16000 || 
        newPhase === 'breakdown' ||
        newPhase === 'outro')) {
      analyzeMusicStructure.dropActive = false;
      dropActive = false;
    }
    
    return {
      dropDetected: dropActive,
      musicPhase: newPhase,
      currentPhrase: Math.floor(analyzeMusicStructure.phraseCount / 2) + 1
    };
  };
  
  const analyzeAudioFeatures = (frequencyData, timeData, sampleRate, fftSize) => {
    // Spectral centroid - brightness of sound
    let numerator = 0;
    let denominator = 0;
    const binSize = sampleRate / fftSize;
    
    for (let i = 0; i < frequencyData.length; i++) {
      const amplitude = frequencyData[i] / 256;
      const frequency = i * binSize;
      numerator += frequency * amplitude;
      denominator += amplitude;
    }
    
    const spectralCentroid = denominator !== 0 ? numerator / denominator / 10000 : 0;
    
    // Spectral flux - rate of change
    let spectralFlux = 0;
    if (analyzeAudioFeatures.prevSpectrum) {
      for (let i = 0; i < frequencyData.length; i++) {
        const diff = (frequencyData[i] / 256) - (analyzeAudioFeatures.prevSpectrum[i] || 0);
        spectralFlux += diff > 0 ? diff : 0; // Only positive changes
      }
      spectralFlux = Math.min(1, spectralFlux / 50);
    }
    analyzeAudioFeatures.prevSpectrum = Array.from(frequencyData).map(v => v / 256);
    
    // Zero crossing rate - percussiveness
    let zeroCrossings = 0;
    for (let i = 1; i < timeData.length; i++) {
      if ((timeData[i] > 128 && timeData[i-1] <= 128) || 
          (timeData[i] <= 128 && timeData[i-1] > 128)) {
        zeroCrossings++;
      }
    }
    const zeroCrossingRate = Math.min(1, zeroCrossings / timeData.length * 10);
    
    // Spectral flatness - tonal vs noise
    let geometricMean = 1;
    let arithmeticMean = 0;
    let count = 0;
    
    for (let i = 20; i < frequencyData.length / 2; i++) { // Focus on audible range
      const value = frequencyData[i] / 256 + 0.01; // Add small value to avoid zero
      geometricMean *= Math.pow(value, 1 / (frequencyData.length / 2 - 20));
      arithmeticMean += value;
      count++;
    }
    arithmeticMean /= count;
    
    const spectralFlatness = arithmeticMean !== 0 ? geometricMean / arithmeticMean : 0;
    
    // Calculate percussiveness based on spectral flux and zero crossing rate
    const percussiveness = (spectralFlux * 0.6 + zeroCrossingRate * 0.4);
    
    // Calculate harmonicity based on inverse of spectral flatness
    const harmonicity = 1 - Math.min(1, spectralFlatness * 10);
    
    return {
      spectralCentroid,
      spectralFlux,
      spectralFlatness,
      zeroCrossingRate,
      percussiveness,
      harmonicity
    };
  };
  
  const calculateRhythmCoherence = () => {
    if (!tempoEstimatorRef.current) return 0;
    
    const iois = tempoEstimatorRef.current.getCurrentIOIs();
    if (iois.length < 4) return 0;
    
    // Calculate standard deviation of inter-onset intervals
    const mean = iois.reduce((sum, ioi) => sum + ioi, 0) / iois.length;
    const variance = iois.reduce((sum, ioi) => sum + Math.pow(ioi - mean, 2), 0) / iois.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalize by mean to get coefficient of variation
    const cv = stdDev / mean;
    
    // Invert and scale to get coherence (lower variation = higher coherence)
    return Math.max(0, Math.min(1, 1 - cv * 2));
  };
  
  const calculateDynamics = (frequencyData) => {
    // Calculate dynamics based on standard deviation across frequency bins
    if (!frequencyData || !frequencyData.length) return 0;
    
    const values = Array.from(frequencyData).map(v => v / 256);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return Math.min(1, stdDev * 5); // Scale to 0-1 range
  };

  const draw = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const audioContext = audioContextRef.current;
    
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const frequencyDataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyDataArray);
    
    const timeDataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeDataArray);
    
    let sum = 0;
    for (let i = 0; i < frequencyDataArray.length; i++) {
      sum += frequencyDataArray[i];
    }
    const average = sum / frequencyDataArray.length;
    const volume = average / 256;