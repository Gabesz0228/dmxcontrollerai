import React, { useEffect, useRef, useState } from 'react';

const AudioVisualizer = () => {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState({
    volume: 0,
    frequencies: [],
    waveform: []
  });
  const [visualizationType, setVisualizationType] = useState('waveform');

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Create analyzer
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      
      // Connect source to analyzer
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      
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
  
  const draw = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Get canvas dimensions
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get frequency data
    const frequencyDataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyDataArray);
    
    // Get time domain data (waveform)
    const timeDataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeDataArray);
    
    // Calculate volume
    let sum = 0;
    for (let i = 0; i < frequencyDataArray.length; i++) {
      sum += frequencyDataArray[i];
    }
    const average = sum / frequencyDataArray.length;
    const volume = average / 256; // Normalize to 0-1
    
    // Update state with audio data
    setAudioData({
      volume,
      frequencies: Array.from(frequencyDataArray),
      waveform: Array.from(timeDataArray)
    });
    
    // Draw based on visualization type
    if (visualizationType === 'waveform') {
      drawWaveform(ctx, timeDataArray, width, height);
    } else if (visualizationType === 'frequency') {
      drawFrequencyBars(ctx, frequencyDataArray, width, height);
    } else if (visualizationType === 'circle') {
      drawCircle(ctx, frequencyDataArray, width, height);
    }
    
    // Continue animation
    animationRef.current = requestAnimationFrame(draw);
  };
  
  const drawWaveform = (ctx, dataArray, width, height) => {
    ctx.beginPath();
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    
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
  };
  
  const drawFrequencyBars = (ctx, dataArray, width, height) => {
    const barWidth = width / dataArray.length * 4;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i += 4) {
      const barHeight = dataArray[i] / 256 * height;
      
      // Use a gradient color based on frequency
      const hue = (i / dataArray.length) * 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
      if (x > width) break;
    }
  };
  
  const drawCircle = (ctx, dataArray, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 4;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#333';
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
      
      // Use a gradient color based on frequency
      const hue = (i / dataArray.length) * 360;
      ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
      
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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
      <h1 className="text-2xl font-bold mb-4 text-center">Audio Visualizer</h1>
      
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
        <h2 className="text-lg font-semibold mb-2">Audio Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-gray-100 rounded">
            <div className="text-sm text-gray-600">Volume</div>
            <div className="text-xl font-bold">{(audioData.volume * 100).toFixed(1)}%</div>
            <div className="w-full bg-gray-300 rounded-full h-2 mt-1">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${audioData.volume * 100}%` }}
              ></div>
            </div>
          </div>
          
          <div className="p-3 bg-gray-100 rounded">
            <div className="text-sm text-gray-600">Dominant Frequency</div>
            <div className="text-xl font-bold">
              {audioData.frequencies.length > 0 
                ? Math.max(...audioData.frequencies.slice(0, 100)) 
                : 0}
            </div>
          </div>
          
          <div className="p-3 bg-gray-100 rounded">
            <div className="text-sm text-gray-600">Sample Count</div>
            <div className="text-xl font-bold">{audioData.waveform.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioVisualizer;