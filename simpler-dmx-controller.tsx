import React, { useState, useEffect, useRef } from 'react';

const SimplifiedDmxController = () => {
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [bassLevel, setBassLevel] = useState(0);
  const [midsLevel, setMidsLevel] = useState(0);
  const [trebleLevel, setTrebleLevel] = useState(0);
  const [isBeat, setIsBeat] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [debugMode, setDebugMode] = useState(true);
  const [debugMessage, setDebugMessage] = useState('');

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);
  const prevBassRef = useRef(0);
  
  const addDebugMessage = (message) => {
    setDebugMessage((prev) => {
      const newMessage = `${new Date().toLocaleTimeString()}: ${message}\n${prev}`;
      return newMessage.split('\n').slice(0, 20).join('\n');
    });
  };

  const startAudio = async () => {
    try {
      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        addDebugMessage("Audio context created");
      }
      
      // Resume audio context if it's suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        addDebugMessage("Audio context resumed");
      }
      
      // Create analyzer if it doesn't exist
      if (!analyserRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        addDebugMessage("Analyzer created with fftSize: 256");
      }
      
      // Get user media if source doesn't exist
      if (!sourceRef.current) {
        addDebugMessage("Requesting microphone access...");
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          } 
        });
        
        sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
        sourceRef.current.connect(analyserRef.current);
        addDebugMessage("Microphone connected successfully");
      }
      
      setIsActive(true);
      analyzeAudio();
      addDebugMessage("Started audio analysis");
    } catch (error) {
      addDebugMessage(`Error starting audio: ${error.message}`);
      console.error("Error starting audio:", error);
    }
  };
  
  const stopAudio = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    setIsActive(false);
    addDebugMessage("Stopped audio analysis");
  };
  
  const analyzeAudio = () => {
    if (!analyserRef.current || !isActive) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate overall audio level
    let totalSum = 0;
    for (let i = 0; i < bufferLength; i++) {
      totalSum += dataArray[i];
    }
    const avgLevel = totalSum / (bufferLength * 255);
    setAudioLevel(avgLevel);
    
    // Calculate frequency band levels
    const bassRange = Math.floor(bufferLength * 0.1);
    const midsRange = Math.floor(bufferLength * 0.6);
    
    let bassSum = 0;
    let midsSum = 0;
    let trebleSum = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      if (i < bassRange) {
        bassSum += dataArray[i];
      } else if (i < midsRange) {
        midsSum += dataArray[i];
      } else {
        trebleSum += dataArray[i];
      }
    }
    
    const bassLevel = bassSum / (bassRange * 255);
    const midsLevel = midsSum / ((midsRange - bassRange) * 255);
    const trebleLevel = trebleSum / ((bufferLength - midsRange) * 255);
    
    setBassLevel(bassLevel);
    setMidsLevel(midsLevel);
    setTrebleLevel(trebleLevel);
    
    // Detect beats - bass increase + minimum threshold
    const beatThreshold = sensitivity * 0.1;
    const bassIncrease = bassLevel - prevBassRef.current;
    const isBeat = bassIncrease > beatThreshold && bassLevel > 0.1;
    
    if (isBeat) {
      setIsBeat(true);
      addDebugMessage(`Beat detected! Bass: ${bassLevel.toFixed(2)}, Increase: ${bassIncrease.toFixed(2)}`);
      setTimeout(() => setIsBeat(false), 100);
    }
    
    prevBassRef.current = bassLevel;
    
    // Log significant changes
    if (Math.abs(avgLevel - audioLevel) > 0.1) {
      addDebugMessage(`Audio level changed to: ${avgLevel.toFixed(2)}`);
    }
    
    animationRef.current = requestAnimationFrame(analyzeAudio);
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  const getLightColor = () => {
    const r = Math.floor(bassLevel * 255);
    const g = Math.floor(midsLevel * 255);
    const b = Math.floor(trebleLevel * 255);
    return `rgb(${r}, ${g}, ${b})`;
  };
  
  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Simplified DMX Controller</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Audio Analysis</h2>
          
          <div className="mb-4">
            <button
              onClick={isActive ? stopAudio : startAudio}
              className={`px-4 py-2 rounded font-bold ${
                isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isActive ? 'Stop' : 'Start'} Audio Analysis
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span>Overall Level</span>
                <span>{(audioLevel * 100).toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${audioLevel * 100}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between mb-1">
                <span>Bass Level</span>
                <span>{(bassLevel * 100).toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${bassLevel * 100}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between mb-1">
                <span>Mids Level</span>
                <span>{(midsLevel * 100).toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${midsLevel * 100}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between mb-1">
                <span>Treble Level</span>
                <span>{(trebleLevel * 100).toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${trebleLevel * 100}%` }}
                />
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block mb-2">Beat Detection Sensitivity</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>Less Sensitive</span>
                <span>More Sensitive</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Light Visualization</h2>
          
          <div 
            className={`w-full h-40 rounded-lg mb-4 flex items-center justify-center transition-colors duration-100 ${isBeat ? 'scale-110' : 'scale-100'}`}
            style={{ 
              backgroundColor: getLightColor(),
              transition: 'all 0.1s ease-out'
            }}
          >
            <div className={`text-black font-bold ${isBeat ? 'text-2xl' : 'text-xl'}`}>
              {isBeat ? 'BEAT!' : 'Lighting Output'}
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded"
                style={{
                  backgroundColor: getLightColor(),
                  opacity: audioLevel > (i / 10) ? 1 : 0.1,
                  transform: isBeat && i % 3 === 0 ? 'scale(1.1)' : 'scale(1)',
                  transition: 'all 0.1s ease-out'
                }}
              />
            ))}
          </div>
        </div>
      </div>
      
      {debugMode && (
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold">Debug Information</h2>
            <button
              onClick={() => setDebugMode(false)}
              className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-sm"
            >
              Hide Debug
            </button>
          </div>
          
          <pre className="bg-black p-4 rounded-lg text-green-400 font-mono text-sm h-40 overflow-y-auto">
            {debugMessage || "No debug information available yet"}
          </pre>
          
          <div className="mt-4 text-sm text-gray-400">
            <p>
              If you're not seeing any audio activity:
            </p>
            <ul className="list-disc pl-5 mt-2">
              <li>Make sure your microphone is connected and working</li>
              <li>Check if you've granted microphone permissions to this page</li>
              <li>Try restarting your browser</li>
              <li>Increase the volume of your audio source</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimplifiedDmxController;
