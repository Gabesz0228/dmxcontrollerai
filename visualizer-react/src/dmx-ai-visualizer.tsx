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
  const structureHistoryRef = useRef([]); // Track music structure over time
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState({
    volume: 0,
    frequencies: [],
    waveform: [],
    beatDetected: false,
    dropDetected: false,
    musicPhase: 'ambient', // New property for music structure: ambient, build, drop, breakdown, etc.
    frequencyBands: {
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0
    },
    energyLevel: 0,
    bpm: 0
  });
  const [visualizationType, setVisualizationType] = useState('waveform');

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Create analyzer with higher fftSize for better frequency resolution
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 8192; // Even higher resolution for better frequency analysis
      analyser.smoothingTimeConstant = 0.8; // Good balance between smoothing and responsiveness
      analyserRef.current = analyser;
      
      // Connect source to analyzer
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      
      // Reset beat and energy tracking
      previousVolumeRef.current = [];
      beatHistoryRef.current = [];
      energyHistoryRef.current = [];
      structureHistoryRef.current = [];
      
      setIsRecording(true);
      
      // Start drawing
      draw();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Error accessing microphone. Please make sure you've granted permission.");
    }
  };
  
  const stopRecording = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
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
  
  // Improved BPM calculation based on beat history
  const calculateBPM = (beatHistory) => {
    if (beatHistory.length < 6) return 0; // Need more beat data for accuracy
    
    // Get time differences between consecutive beats
    const timeDiffs = [];
    for (let i = 1; i < beatHistory.length; i++) {
      timeDiffs.push(beatHistory[i] - beatHistory[i-1]);
    }
    
    // Calculate median to eliminate outliers more effectively than average
    const sortedDiffs = [...timeDiffs].sort((a, b) => a - b);
    const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)];
    
    // Use median as baseline to filter outliers
    // Only accept beat intervals that are close to the median or halves/doubles of it
    // (accounts for algorithm sometimes catching every other beat)
    const reasonableDiffs = timeDiffs.filter(diff => 
      (diff > medianDiff * 0.5 && diff < medianDiff * 1.5) || // Close to median
      (diff > medianDiff * 0.25 && diff < medianDiff * 0.75) || // Half tempo
      (diff > medianDiff * 1.75 && diff < medianDiff * 2.25)    // Double tempo
    );
    
    if (reasonableDiffs.length < 4) return 0;
    
    // Calculate average of filtered intervals
    const avgTimeDiff = reasonableDiffs.reduce((sum, diff) => sum + diff, 0) / reasonableDiffs.length;
    
    // Convert to BPM: 60000ms (1 minute) / average time between beats in ms
    const calculatedBpm = Math.round(60000 / avgTimeDiff);
    
    // Return BPM only if it's in a reasonable range for music (40-220 BPM)
    return (calculatedBpm >= 40 && calculatedBpm <= 220) ? calculatedBpm : 0;
  };
  
  // Improved beat detection without amplification
  const detectBeat = (volume, frequencyBands, waveform) => {
    const prevVol = previousVolumeRef.current;
    
    // Need some history for comparison
    if (prevVol.length < 8) {
      previousVolumeRef.current = [...prevVol, volume].slice(-20); // Keep more history
      return false;
    }
    
    // Calculate moving average with more sophisticated weighting
    // Recent values get higher weight but not too high (avoid false triggers)
    const recentWeight = 0.6;
    const olderWeight = 0.4;
    const recentAvg = prevVol.slice(-4).reduce((sum, v, i) => sum + v, 0) / 4;
    const olderAvg = prevVol.slice(-12, -4).reduce((sum, v) => sum + v, 0) / 8;
    const weightedAvg = recentAvg * recentWeight + olderAvg * olderWeight;
    
    // Update volume history
    previousVolumeRef.current = [...prevVol, volume].slice(-20);
    
    // Analyze bass punch compared to recent average
    const bassPunch = frequencyBands.bass > 0.7 && frequencyBands.bass > weightedAvg * 1.3;
    
    // Find strong transients in waveform (sharp volume changes)
    let transientStrength = 0;
    if (waveform && waveform.length > 10) {
      // Look for quick transitions from low to high amplitude
      for (let i = 5; i < waveform.length - 5; i++) {
        const before = Math.abs((waveform[i-5] / 128.0) - 1);
        const current = Math.abs((waveform[i] / 128.0) - 1);
        if (current > 0.3 && current > before * 2.0) {
          transientStrength = Math.max(transientStrength, current);
        }
      }
    }
    
    // Multi-factor beat detection
    const volumeSpike = volume > weightedAvg * 1.15 && volume > 0.15;
    const strongTransient = transientStrength > 0.4;

    // A beat is detected if we have volume spike OR bass punch OR strong transient
    const isBeat = volumeSpike || bassPunch || strongTransient;
        
    // Store beat timestamp for BPM calculation with debouncing
    if (isBeat) {
      const now = Date.now();
      // Don't register beats too close together (debounce based on current tempo estimate)
      const minBeatInterval = beatHistoryRef.current.length > 4 ? 
        60000 / (calculateBPM(beatHistoryRef.current) * 2.5) : // Dynamic debounce based on detected tempo
        200; // Default debounce of 200ms (300 BPM ceiling)
      
      if (beatHistoryRef.current.length === 0 || now - beatHistoryRef.current[beatHistoryRef.current.length - 1] > minBeatInterval) {
        beatHistoryRef.current = [...beatHistoryRef.current, now].slice(-40); // Store more beat history for better BPM
      }
    }
    
    return isBeat;
  };
  
  // Advanced music structure detection
  const analyzeMusicStructure = (currentAudio, energyHistory) => {
    // Default structure detection properties
    const result = {
      dropDetected: false,
      musicPhase: 'ambient'
    };
    
    // Not enough history for reliable detection
    if (energyHistory.length < 30) {
      return result;
    }
    
    // Get current audio properties
    const { frequencyBands, volume, energyLevel } = currentAudio;
    
    // Calculate average energy levels over different time windows
    const recentEnergyAvg = energyHistory.slice(-15).reduce((sum, e) => sum + e.total, 0) / 15;
    const mediumEnergyAvg = energyHistory.slice(-30).reduce((sum, e) => sum + e.total, 0) / 30;
    const longEnergyAvg = energyHistory.slice(-90).reduce((sum, e) => sum + e.total, 0) / Math.min(90, energyHistory.length);
    
    // Calculate bass energy over different time windows
    const recentBassAvg = energyHistory.slice(-15).reduce((sum, e) => sum + e.bass, 0) / 15;
    const mediumBassAvg = energyHistory.slice(-30).reduce((sum, e) => sum + e.bass, 0) / 30;
    const longBassAvg = energyHistory.slice(-90).reduce((sum, e) => sum + e.bass, 0) / Math.min(90, energyHistory.length);
    
    // Calculate energy trends
    const shortTermTrend = recentEnergyAvg - mediumEnergyAvg; // Positive means rising energy
    const longTermTrend = mediumEnergyAvg - longEnergyAvg;   // Positive means rising energy over longer term
    
    // Current energy measurements
    const currentBass = frequencyBands.bass;
    const currentEnergy = energyLevel;
    
    // Key music structure features:
    const energyRising = shortTermTrend > 0.05; // Energy is building up
    const energyFalling = shortTermTrend < -0.05; // Energy is reducing
    const sustainedHighEnergy = recentEnergyAvg > 0.6 && Math.abs(shortTermTrend) < 0.03; // High consistent energy
    const suddenEnergyDrop = shortTermTrend < -0.1 && recentEnergyAvg < mediumEnergyAvg * 0.7; // Energy suddenly fell
    const suddenEnergyRise = recentEnergyAvg > mediumEnergyAvg * 1.3 && recentEnergyAvg > 0.5; // Energy suddenly increased
    const suddenBassImpact = currentBass > recentBassAvg * 1.3 && currentBass > 0.5; // Bass suddenly increased
    const sustainedBassLine = recentBassAvg > 0.5 && Math.abs(recentBassAvg - mediumBassAvg) < 0.1; // Strong consistent bass
    
    // Static variable for phase transition debouncing
    if (analyzeMusicStructure.lastPhaseChange === undefined) {
      analyzeMusicStructure.lastPhaseChange = 0;
      analyzeMusicStructure.currentPhase = 'ambient';
      analyzeMusicStructure.dropActive = false;
      analyzeMusicStructure.dropStartTime = 0;
    }
    
    const now = Date.now();
    const phaseDebounceTime = 2000; // Min time between phase changes (ms)
    
    // Determine music phase based on the features detected
    let newPhase = analyzeMusicStructure.currentPhase;
    
    // Logic for determining music structure
    if (now - analyzeMusicStructure.lastPhaseChange > phaseDebounceTime) {
      // Drop detection: Sustained high energy with strong bass after a build
      if ((suddenEnergyRise && suddenBassImpact && longTermTrend > 0) || 
          (sustainedHighEnergy && sustainedBassLine && analyzeMusicStructure.currentPhase === 'build')) {
        newPhase = 'drop';
        analyzeMusicStructure.dropActive = true;
        analyzeMusicStructure.dropStartTime = now;
      }
      // Build detection: Rising energy over time
      else if (energyRising && longTermTrend > 0 && !suddenEnergyDrop) {
        newPhase = 'build';
      }
      // Breakdown detection: Energy suddenly dropped after high energy
      else if (suddenEnergyDrop && (analyzeMusicStructure.currentPhase === 'drop' || analyzeMusicStructure.currentPhase === 'peak')) {
        newPhase = 'breakdown';
      }
      // Peak detection: Sustained high energy after drop
      else if (sustainedHighEnergy && analyzeMusicStructure.currentPhase === 'drop' && now - analyzeMusicStructure.dropStartTime > 8000) {
        newPhase = 'peak';
      }
      // Ambient detection: Low/medium consistent energy
      else if (currentEnergy < 0.3 && Math.abs(shortTermTrend) < 0.05) {
        newPhase = 'ambient';
      }
      // Outro detection: Falling energy over long period
      else if (energyFalling && longTermTrend < -0.05) {
        newPhase = 'outro';
      }
      
      // Phase changed - update timestamp
      if (newPhase !== analyzeMusicStructure.currentPhase) {
        analyzeMusicStructure.lastPhaseChange = now;
        analyzeMusicStructure.currentPhase = newPhase;
      }
    }
    
    // Drop is active for a certain duration or until structure changes
    let dropActive = analyzeMusicStructure.dropActive;
    
    // End drop state after 16 seconds or if we entered a breakdown/outro
    if (dropActive && (
        now - analyzeMusicStructure.dropStartTime > 16000 || 
        newPhase === 'breakdown' ||
        newPhase === 'outro')) {
      analyzeMusicStructure.dropActive = false;
      dropActive = false;
    }
    
    // Return music structure analysis
    return {
      dropDetected: dropActive,
      musicPhase: newPhase
    };
  };
  
  // Analyze frequency bands without amplification
  const analyzeFrequencyBands = (frequencyData, sampleRate, fftSize) => {
    // Define frequency ranges (Hz)
    const bands = {
      bass: [20, 250],       // Bass
      lowMid: [250, 500],    // Low midrange
      mid: [500, 2000],      // Midrange
      highMid: [2000, 6000], // High midrange
      treble: [6000, 20000]  // Treble
    };
    
    const binSize = sampleRate / fftSize;
    const result = {};
    let totalEnergy = 0;
    
    // Calculate energy in each band without artificial amplification
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
      
      // Normalize band energy to 0-1 without amplification
      const avg = count > 0 ? sum / (count * 256) : 0;
      const peakNormalized = peak / 256;
      
      // Use a weighted combination of average and peak values
      // For genuine measurement without artificial boosting
      const value = avg * 0.7 + peakNormalized * 0.3;
      
      result[band] = value;
      totalEnergy += value;
    });
    
    // Normalize total energy to 0-1 by dividing by number of bands
    const normalizedEnergy = totalEnergy / Object.keys(bands).length;
    
    return {
      bands: result,
      totalEnergy: normalizedEnergy
    };
  };

  const draw = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const audioContext = audioContextRef.current;
    
    // Get canvas dimensions
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get frequency data without artificial amplification
    const frequencyDataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyDataArray);
    
    // Get time domain data (waveform)
    const timeDataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeDataArray);
    
    // Calculate volume without amplification
    let sum = 0;
    for (let i = 0; i < frequencyDataArray.length; i++) {
      sum += frequencyDataArray[i];
    }
    const average = sum / frequencyDataArray.length;
    const volume = average / 256; // Normalize to 0-1 naturally
    
    // Analyze frequency bands naturally
    const { bands, totalEnergy } = analyzeFrequencyBands(
      frequencyDataArray, 
      audioContext.sampleRate, 
      analyser.fftSize
    );
    
    // Store energy history for structure detection
    energyHistoryRef.current = [
      ...energyHistoryRef.current, 
      { bass: bands.bass, total: totalEnergy }
    ].slice(-180); // Store 3 minutes of history at 60fps
    
    // Detect beat with natural approach
    const beatDetected = detectBeat(volume, bands, Array.from(timeDataArray));
    
    // Calculate BPM with improved algorithm
    const bpm = calculateBPM(beatHistoryRef.current);
    
    // Analyze music structure
    const currentAudio = {
      frequencyBands: bands,
      volume,
      energyLevel: totalEnergy
    };
    
    const structureAnalysis = analyzeMusicStructure(currentAudio, energyHistoryRef.current);
    const dropDetected = structureAnalysis.dropDetected;
    const musicPhase = structureAnalysis.musicPhase;
    
    // Update state with audio data
    setAudioData({
      volume,
      frequencies: Array.from(frequencyDataArray),
      waveform: Array.from(timeDataArray),
      beatDetected,
      dropDetected,
      musicPhase,
      frequencyBands: bands,
      energyLevel: totalEnergy,
      bpm
    });
    
    // Draw based on visualization type
    if (visualizationType === 'waveform') {
      drawWaveform(ctx, timeDataArray, width, height, musicPhase);
    } else if (visualizationType === 'frequency') {
      drawFrequencyBars(ctx, frequencyDataArray, width, height, musicPhase);
    } else if (visualizationType === 'circle') {
      drawCircle(ctx, frequencyDataArray, width, height, musicPhase);
    }
    
    // Continue animation
    animationRef.current = requestAnimationFrame(draw);
  };
  
  // Drawing function now includes music phase
  const drawWaveform = (ctx, dataArray, width, height, musicPhase) => {
    ctx.beginPath();
    
    // Color based on music phase
    const phaseColors = {
      ambient: '#4CAF50',   // Green
      build: '#FF9800',     // Orange
      drop: '#F44336',      // Red
      peak: '#E91E63',      // Pink
      breakdown: '#9C27B0', // Purple
      outro: '#3F51B5'      // Indigo
    };
    
    // Change color based on music phase
    ctx.strokeStyle = phaseColors[musicPhase] || '#4CAF50';
    ctx.lineWidth = audioData.beatDetected ? 3 : 2;
    
    const sliceWidth = width / dataArray.length;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * height / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.stroke();
    
    // Add beat indicator
    if (audioData.beatDetected) {
      ctx.beginPath();
      ctx.arc(width - 30, 30, 15, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(156, 39, 176, 0.7)';
      ctx.fill();
    }
    
    // Add drop indicator with phase information
    if (audioData.dropDetected) {
      // Red overlay for the entire screen with animation
      const now = Date.now();
      const pulseIntensity = Math.abs(Math.sin(now / 200)) * 0.3 + 0.2; // Pulsating effect
      
      ctx.fillStyle = `rgba(255, 0, 0, ${pulseIntensity})`;
      ctx.fillRect(0, 0, width, height);
      
      // Show current music phase
      const textBlink = Math.floor(now / 500) % 2 === 0;
      ctx.font = 'bold 36px Arial';
      ctx.fillStyle = textBlink ? 'white' : 'yellow';
      ctx.textAlign = 'center';
      ctx.fillText('DROP!', width / 2, height / 2);
      
      // Add visual bass reactive elements
      const bassLevel = audioData.frequencyBands.bass;
      const bassRadius = 50 + bassLevel * 100;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, bassRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = textBlink ? 'yellow' : 'white';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // Show current music phase in subtle way when not in drop
      ctx.font = '14px Arial';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.textAlign = 'left';
      ctx.fillText(`Phase: ${musicPhase.toUpperCase()}`, 10, 20);
    }
  };
  
  const drawFrequencyBars = (ctx, dataArray, width, height, musicPhase) => {
    const barWidth = width / dataArray.length * 4;
    let x = 0;
    
    // Get phase color
    const phaseColors = {
      ambient: [120, 100], // Green hue
      build: [30, 100],    // Orange hue
      drop: [0, 100],      // Red hue
      peak: [330, 100],    // Pink hue
      breakdown: [270, 100], // Purple hue
      outro: [220, 100]    // Blue hue
    };
    
    const [baseHue, baseSat] = phaseColors[musicPhase] || [120, 100];
    
    for (let i = 0; i < dataArray.length; i += 4) {
      const barHeight = dataArray[i] / 256 * height;
      
      // Use a gradient color based on frequency, but tinted by music phase
      const hueOffset = (i / dataArray.length) * 60 - 30; // +/- 30 degrees from base hue
      const hue = (baseHue + hueOffset) % 360;
      ctx.fillStyle = `hsl(${hue}, ${baseSat}%, 50%)`;
      
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
      if (x > width) break;
    }
    
    // Show current music phase
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`Phase: ${musicPhase.toUpperCase()}`, 10, 20);
  };
  
  const drawCircle = (ctx, dataArray, width, height, musicPhase) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 4;
    
    // Get color based on phase
    const phaseColors = {
      ambient: [120, 100], // Green hue
      build: [30, 100],    // Orange hue
      drop: [0, 100],      // Red hue
      peak: [330, 100],    // Pink hue
      breakdown: [270, 100], // Purple hue
      outro: [220, 100]    // Blue hue
    };
    
    const [baseHue, baseSat] = phaseColors[musicPhase] || [120, 100];
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = `hsl(${baseHue}, ${baseSat}%, 30%)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw frequency lines from center
    for (let i = 0; i < dataArray.length; i += 8) {
      const angle = (i / dataArray.length) * 2 * Math.PI;
      const magnitude = (dataArray[i] / 256) * radius * 1.5;
      
      const x = centerX + Math.cos(angle) * magnitude;
      const y = centerY + Math.sin(angle) * magnitude;
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      
      // Use color influenced by music phase
      const hueOffset = (i / dataArray.length) * 60 - 30; // +/- 30 degrees from base hue
      const hue = (baseHue + hueOffset) % 360;
      ctx.strokeStyle = `hsl(${hue}, ${baseSat}%, 50%)`;
      
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Show current music phase in center
    ctx.font = '14px Arial';
    ctx.fillStyle = `hsl(${baseHue}, ${baseSat}%, 80%)`;
    ctx.textAlign = 'center';
    ctx.fillText(musicPhase.toUpperCase(), centerX, centerY + radius + 20);
  };
  
  useEffect(() => {
    // Set canvas size to match container
    const resizeCanvas = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
        canvasRef.current.height = 300;
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      stopRecording();
    };
  }, []);
  
  return (
    <div className="flex flex-col p-4 bg-gray-100 rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold mb-4 text-center">AI DMX Analyzer</h1>
      
      <div className="mb-4 flex flex-col">
        <div className="bg-black w-full h-80 rounded-lg overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full"></canvas>
        </div>
      </div>
      
      <div className="flex justify-between mb-4">
        <button 
          onClick={isRecording ? stopRecording : startRecording}
          className={`px-4 py-2 rounded-lg font-bold ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {isRecording ? 'Stop Microphone' : 'Start Microphone'}
        </button>
        
        <div className="flex space-x-2">
          <button 
            onClick={() => setVisualizationType('waveform')}
            className={`px-3 py-1 rounded ${
              visualizationType === 'waveform' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            Waveform
          </button>
          <button 
            onClick={() => setVisualizationType('frequency')}
            className={`px-3 py-1 rounded ${
              visualizationType === 'frequency' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            Frequency
          </button>
          <button 
            onClick={() => setVisualizationType('circle')}
            className={`px-3 py-1 rounded ${
              visualizationType === 'circle' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            Circle
          </button>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">AI DMX Analysis Dashboard</h2>
        
        {/* Main Status Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className={`p-3 rounded text-white text-center ${audioData.beatDetected ? 'bg-purple-600' : 'bg-gray-500'}`}>
            <div className="text-sm">Beat Detected</div>
            <div className="text-2xl font-bold">{audioData.beatDetected ? 'YES' : 'NO'}</div>
          </div>
          
          <div className={`p-3 rounded text-white text-center ${audioData.dropDetected ? 'bg-red-600' : 'bg-gray-500'}`}>
            <div className="text-sm">Drop Detected</div>
            <div className="text-2xl font-bold">{audioData.dropDetected ? 'YES' : 'NO'}</div>
          </div>
          
          <div className="p-3 bg-blue-600 rounded text-white text-center">
            <div className="text-sm">BPM</div>
            <div className="text-2xl font-bold">{audioData.bpm || 'Analyzing...'}</div>
          </div>
          
          <div className="p-3 bg-green-600 rounded text-white text-center">
            <div className="text-sm">Energy Level</div>
            <div className="text-2xl font-bold">{(audioData.energyLevel * 100).toFixed(0)}%</div>
          </div>
        </div>
        
        {/* Volume and Frequency Bands */}
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2">Volume</h3>
          <div className="w-full bg-gray-300 rounded-full h-4 mb-4">
            <div 
              className={`h-4 rounded-full ${audioData.beatDetected ? 'bg-purple-600' : 'bg-blue-600'}`}
              style={{ width: `${audioData.volume * 100}%` }}
            ></div>
          </div>
          
          <h3 className="text-md font-semibold mb-2">Frequency Bands</h3>
          <div className="grid grid-cols-5 gap-2">
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-600 mb-1">Bass</div>
              <div className="w-full bg-gray-300 rounded-full h-24 relative">
                <div 
                  className="absolute bottom-0 w-full bg-red-600 rounded-b-full"
                  style={{ height: `${audioData.frequencyBands.bass * 100}%` }}
                ></div>
              </div>
              <div className="text-xs font-bold mt-1">{(audioData.frequencyBands.bass * 100).toFixed(0)}%</div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-600 mb-1">Low Mid</div>
              <div className="w-full bg-gray-300 rounded-full h-24 relative">
                <div 
                  className="absolute bottom-0 w-full bg-orange-500 rounded-b-full"
                  style={{ height: `${audioData.frequencyBands.lowMid * 100}%` }}
                ></div>
              </div>
              <div className="text-xs font-bold mt-1">{(audioData.frequencyBands.lowMid * 100).toFixed(0)}%</div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-600 mb-1">Mid</div>
              <div className="w-full bg-gray-300 rounded-full h-24 relative">
                <div 
                  className="absolute bottom-0 w-full bg-yellow-500 rounded-b-full"
                  style={{ height: `${audioData.frequencyBands.mid * 100}%` }}
                ></div>
              </div>
              <div className="text-xs font-bold mt-1">{(audioData.frequencyBands.mid * 100).toFixed(0)}%</div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-600 mb-1">High Mid</div>
              <div className="w-full bg-gray-300 rounded-full h-24 relative">
                <div 
                  className="absolute bottom-0 w-full bg-green-500 rounded-b-full"
                  style={{ height: `${audioData.frequencyBands.highMid * 100}%` }}
                ></div>
              </div>
              <div className="text-xs font-bold mt-1">{(audioData.frequencyBands.highMid * 100).toFixed(0)}%</div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-600 mb-1">Treble</div>
              <div className="w-full bg-gray-300 rounded-full h-24 relative">
                <div 
                  className="absolute bottom-0 w-full bg-blue-500 rounded-b-full"
                  style={{ height: `${audioData.frequencyBands.treble * 100}%` }}
                ></div>
              </div>
              <div className="text-xs font-bold mt-1">{(audioData.frequencyBands.treble * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
        
        {/* Suggested DMX Operations - AI Insights */}
        <div className="bg-gray-100 p-3 rounded">
          <h3 className="text-md font-semibold mb-2">AI DMX Insights</h3>
          <div className="text-sm">
            {audioData.dropDetected ? (
              <div className="bg-red-100 border-l-4 border-red-500 p-2">
                <span className="font-bold">Drop detected!</span> Recommended: Strobe effect with high intensity on all fixtures.
              </div>
            ) : audioData.beatDetected ? (
              <div className="bg-purple-100 border-l-4 border-purple-500 p-2">
                <span className="font-bold">Beat detected!</span> Recommend sync wash lights with beat rhythm.
              </div>
            ) : audioData.frequencyBands.bass > 0.6 ? (
              <div className="bg-orange-100 border-l-4 border-orange-500 p-2">
                <span className="font-bold">Heavy bass!</span> Activate low-end responsive fixtures, consider red/orange coloring.
              </div>
            ) : audioData.energyLevel > 0.5 ? (
              <div className="bg-blue-100 border-l-4 border-blue-500 p-2">
                <span className="font-bold">High energy section.</span> Use faster movement patterns and brighter colors.
              </div>
            ) : (
              <div className="bg-gray-200 border-l-4 border-gray-500 p-2">
                <span className="font-bold">Ambient section.</span> Use slow color fading and gentle movements.
              </div>
            )}
          </div>
          
          <div className="mt-2 text-xs text-gray-600">
            BPM: {audioData.bpm > 0 ? `${audioData.bpm} - ${audioData.bpm < 100 ? 'Slow' : audioData.bpm > 140 ? 'Fast' : 'Medium'} Tempo` : 'Analyzing...'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioVisualizer;