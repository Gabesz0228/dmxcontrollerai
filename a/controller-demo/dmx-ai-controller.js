// AI-Controlled DMX Lighting System
// This demonstrates the core concepts of an AI-based DMX controller
// that responds to audio input in real-time

// ----- AUDIO ANALYSIS MODULE -----
class AudioAnalyzer {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 2048;
    this.bufferLength = this.analyzer.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    
    // Audio features we'll extract
    this.features = {
      bass: 0,
      mids: 0,
      treble: 0,
      volume: 0,
      beatDetected: false,
      beatEnergy: 0,
      previousEnergy: 0,
      beatHistory: []
    };
  }

  async setupMicrophoneInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyzer);
      console.log("Microphone input connected successfully");
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  setupLineInput(inputElement) {
    const source = this.audioContext.createMediaElementSource(inputElement);
    source.connect(this.analyzer);
    source.connect(this.audioContext.destination); // To hear the audio
    console.log("Line input connected successfully");
  }

  analyzeAudio() {
    // Get frequency data
    this.analyzer.getByteFrequencyData(this.dataArray);
    
    // Calculate energy in different frequency bands
    // Bass: ~60-250Hz
    // Mids: ~250-2000Hz
    // Treble: ~2000-16000Hz
    const bassRange = Math.floor(this.bufferLength * 0.12);
    const midsRange = Math.floor(this.bufferLength * 0.4);
    
    let bassSum = 0;
    let midsSum = 0;
    let trebleSum = 0;
    let totalSum = 0;
    
    for (let i = 0; i < this.bufferLength; i++) {
      const value = this.dataArray[i];
      totalSum += value;
      
      if (i < bassRange) {
        bassSum += value;
      } else if (i < midsRange) {
        midsSum += value;
      } else {
        trebleSum += value;
      }
    }
    
    // Normalize values between 0-1
    this.features.bass = bassSum / (bassRange * 255);
    this.features.mids = midsSum / ((midsRange - bassRange) * 255);
    this.features.treble = trebleSum / ((this.bufferLength - midsRange) * 255);
    this.features.volume = totalSum / (this.bufferLength * 255);
    
    // Simple beat detection algorithm
    const currentEnergy = this.features.bass;
    this.features.beatDetected = false;
    
    // Beat is detected when bass energy significantly increases
    if (currentEnergy > this.features.previousEnergy * 1.2 && currentEnergy > 0.2) {
      this.features.beatDetected = true;
      this.features.beatEnergy = currentEnergy;
      this.features.beatHistory.push({
        time: Date.now(),
        energy: currentEnergy
      });
      
      // Keep only recent beat history
      if (this.features.beatHistory.length > 10) {
        this.features.beatHistory.shift();
      }
    }
    
    this.features.previousEnergy = currentEnergy;
    return this.features;
  }
}

// ----- AI LIGHTING CONTROLLER -----
class AILightingController {
  constructor(universeSize = 512) {
    this.universeSize = universeSize;
    this.dmxValues = new Uint8Array(universeSize);
    this.fixtures = [];
    this.patterns = {};
    
    // Create some default lighting patterns
    this.initializePatterns();
  }
  
  addFixture(fixture) {
    this.fixtures.push(fixture);
  }
  
  initializePatterns() {
    // Pattern: All lights pulse with the beat
    this.patterns.beatPulse = (features) => {
      const intensityFactor = features.beatDetected ? features.beatEnergy * 2 : Math.max(0.2, features.beatEnergy);
      
      this.fixtures.forEach(fixture => {
        fixture.channels.forEach(channel => {
          if (channel.type === 'dimmer' || channel.type === 'master') {
            this.setDmxValue(channel.address, Math.floor(255 * intensityFactor));
          }
        });
      });
    };
    
    // Pattern: Colors respond to frequency distribution
    this.patterns.frequencyColors = (features) => {
      this.fixtures.forEach(fixture => {
        const redChannel = fixture.channels.find(ch => ch.type === 'red');
        const greenChannel = fixture.channels.find(ch => ch.type === 'green');
        const blueChannel = fixture.channels.find(ch => ch.type === 'blue');
        
        if (redChannel) this.setDmxValue(redChannel.address, Math.floor(features.bass * 255));
        if (greenChannel) this.setDmxValue(greenChannel.address, Math.floor(features.mids * 255));
        if (blueChannel) this.setDmxValue(blueChannel.address, Math.floor(features.treble * 255));
        
        // Always set master/dimmer to a reasonable value to see the colors
        const masterChannel = fixture.channels.find(ch => ch.type === 'dimmer' || ch.type === 'master');
        if (masterChannel) this.setDmxValue(masterChannel.address, 200);
      });
    };
    
    // Pattern: Position movement based on audio features
    this.patterns.positionMove = (features) => {
      this.fixtures.forEach(fixture => {
        const panChannel = fixture.channels.find(ch => ch.type === 'pan');
        const tiltChannel = fixture.channels.find(ch => ch.type === 'tilt');
        
        if (panChannel) {
          // Make pan oscillate based on beat history
          const panValue = Math.floor(128 + 127 * Math.sin(Date.now() / 2000 * features.volume));
          this.setDmxValue(panChannel.address, panValue);
        }
        
        if (tiltChannel) {
          // Make tilt respond to bass
          const tiltValue = Math.floor(128 + features.bass * 127);
          this.setDmxValue(tiltChannel.address, tiltValue);
        }
      });
    };
  }
  
  // Use ML/AI model to decide on appropriate lighting
  processAudioFeatures(features) {
    // In a real implementation, this would use a trained model
    // For now, we'll use simple rules based on audio features
    
    // Example rule-based decision logic
    if (features.volume > 0.7) {
      // For high volume sections, use position movement
      this.patterns.positionMove(features);
    } else if (features.beatDetected) {
      // On strong beats, pulse the lights
      this.patterns.beatPulse(features);
    } else {
      // Otherwise, map frequencies to colors
      this.patterns.frequencyColors(features);
    }
    
    // In a full AI implementation, we would use a neural network like:
    // const lightingOutput = this.model.predict(tf.tensor([
    //   features.bass, features.mids, features.treble, 
    //   features.volume, features.beatDetected ? 1 : 0
    // ]));
    // And then map those outputs to DMX values
    
    return this.dmxValues;
  }
  
  setDmxValue(address, value) {
    if (address >= 0 && address < this.universeSize) {
      this.dmxValues[address] = value;
    }
  }
}

// ----- DMX OUTPUT INTERFACE -----
class DMXOutput {
  constructor() {
    // In a real implementation, this would connect to DMX hardware
    this.connected = false;
    this.universe = new Uint8Array(512).fill(0);
  }
  
  async connect(devicePath) {
    try {
      // This is a placeholder for actual DMX hardware connection
      // Could be a USB-DMX interface, ArtNet, sACN, etc.
      console.log(`Connecting to DMX interface at ${devicePath}`);
      this.connected = true;
      return true;
    } catch (err) {
      console.error("Failed to connect to DMX interface:", err);
      return false;
    }
  }
  
  sendDMXValues(values) {
    if (!this.connected) {
      console.warn("DMX interface not connected");
      return false;
    }
    
    // In a real implementation, this would send values to the DMX interface
    this.universe = values;
    console.log("DMX values updated:", this.getDebugValues());
    return true;
  }
  
  getDebugValues() {
    // Just show a few values for debugging
    const debug = {};
    for (let i = 1; i <= 20; i++) {
      if (this.universe[i-1] > 0) {
        debug[`ch${i}`] = this.universe[i-1];
      }
    }
    return debug;
  }
}

// ----- FIXTURE DEFINITIONS -----
// Example fixture definitions
const rgbParFixture = {
  name: "RGB PAR",
  channels: [
    { address: 0, type: "master", name: "Dimmer" },
    { address: 1, type: "red", name: "Red" },
    { address: 2, type: "green", name: "Green" },
    { address: 3, type: "blue", name: "Blue" },
    { address: 4, type: "strobe", name: "Strobe" }
  ]
};

const movingHeadFixture = {
  name: "Moving Head",
  channels: [
    { address: 10, type: "pan", name: "Pan" },
    { address: 11, type: "tilt", name: "Tilt" },
    { address: 12, type: "dimmer", name: "Dimmer" },
    { address: 13, type: "color", name: "Color Wheel" },
    { address: 14, type: "gobo", name: "Gobo Wheel" }
  ]
};

// ----- MAIN APPLICATION -----
class AILightingApp {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyzer = new AudioAnalyzer(this.audioContext);
    this.lightController = new AILightingController();
    this.dmxOutput = new DMXOutput();
    
    // Add some fixtures
    this.lightController.addFixture(rgbParFixture);
    this.lightController.addFixture(movingHeadFixture);
    
    this.isRunning = false;
    this.analyzeInterval = null;
  }
  
  async setup() {
    // Connect audio input
    await this.analyzer.setupMicrophoneInput();
    
    // Connect DMX output (in a real app, this would connect to hardware)
    await this.dmxOutput.connect("usb-dmx-device");
    
    console.log("AI Lighting system setup complete");
  }
  
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.audioContext.resume();
    
    // Run the analysis loop
    this.analyzeInterval = setInterval(() => {
      // 1. Get audio features
      const audioFeatures = this.analyzer.analyzeAudio();
      
      // 2. Let AI determine appropriate lighting
      const dmxValues = this.lightController.processAudioFeatures(audioFeatures);
      
      // 3. Send DMX values to output interface
      this.dmxOutput.sendDMXValues(dmxValues);
      
    }, 30); // Update at ~30fps
    
    console.log("AI Lighting system started");
  }
  
  stop() {
    if (!this.isRunning) return;
    
    clearInterval(this.analyzeInterval);
    this.isRunning = false;
    console.log("AI Lighting system stopped");
  }
}

// To use this in a browser environment:
// const app = new AILightingApp();
// await app.setup();
// app.start();

// In a Node.js environment, you would need alternatives for browser APIs
// and would need a library for DMX output like dmx, dmx512, artnet, etc.
