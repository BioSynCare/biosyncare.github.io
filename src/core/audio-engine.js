/**
 * BioSynCare Lab - Audio Engine (Expanded)
 *
 * Web Audio API wrapper for neurosensory protocols
 * Pure client-side, low latency, no dependencies
 *
 * Features:
 * - Waveforms: sine, triangle, square, sawtooth, custom
 * - Binaural beats (L/R frequency difference)
 * - Monaural beats (single ear modulation)
 * - Isochronic tones (rhythmic pulses)
 * - Martigli waves (complex harmonics)
 * - Sonic symmetries (mathematical patterns)
 * - Noise generators: white, pink, brown, blue, violet, black
 * - Safe gain limiting
 * - Smooth fade in/out
 * - Spatial audio (stereo panning)
 *
 * Usage:
 *   import { AudioEngine } from './src/core/audio-engine.js';
 *   const engine = new AudioEngine();
 *   await engine.init();
 *   engine.playWaveform({ type: 'sine', freq: 440, duration: 5 });
 *   engine.playBinaural({ base: 300, beat: 8, duration: 60 });
 *   engine.playNoise({ type: 'pink', duration: 30 });
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.nodes = new Map(); // active nodes registry
    this.initialized = false;
  }

  /**
   * Initialize Web Audio Context
   * Call this on user interaction (autoplay policy)
   */
  async init() {
    if (this.initialized) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      throw new Error('Web Audio API não suportado neste navegador');
    }

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.2; // -14 dBFS aprox (safe default)
    this.masterGain.connect(this.ctx.destination);

    this.initialized = true;
    console.log('[AudioEngine] Initialized', {
      sampleRate: this.ctx.sampleRate,
      state: this.ctx.state,
      baseLatency: this.ctx.baseLatency,
    });
  }

  /**
   * Resume context (needed after user interaction)
   */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Play pure sine tone
   * @param {number} frequency - Hz (20-20000)
   * @param {number} duration - seconds (0 = infinite)
   * @param {number} gain - volume 0-1
   */
  playTone(frequency = 440, duration = 0, gain = 0.5) {
    this._ensureInit();

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;

    // Smooth fade in
    oscGain.gain.setValueAtTime(0, this.ctx.currentTime);
    oscGain.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.05);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    const id = `tone-${Date.now()}`;
    this.nodes.set(id, { osc, gain: oscGain });

    osc.start();

    if (duration > 0) {
      // Fade out before stop
      oscGain.gain.setValueAtTime(gain, this.ctx.currentTime + duration - 0.05);
      oscGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
      osc.stop(this.ctx.currentTime + duration);

      setTimeout(() => {
        this.nodes.delete(id);
      }, duration * 1000);
    }

    return id;
  }

  /**
   * Play binaural beat
   * L ear: base - beat/2
   * R ear: base + beat/2
   *
   * @param {Object} params
   * @param {number} params.base - Carrier frequency (Hz)
   * @param {number} params.beat - Beat frequency (Hz, typically 1-40)
   * @param {number} params.duration - Duration (seconds, 0 = infinite)
   * @param {number} params.gain - Volume 0-1
   */
  playBinaural({ base = 300, beat = 8, duration = 0, gain = 0.4 }) {
    this._ensureInit();

    const leftFreq = base - beat / 2;
    const rightFreq = base + beat / 2;

    // Create stereo oscillators
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const gainLeft = this.ctx.createGain();
    const gainRight = this.ctx.createGain();
    const merger = this.ctx.createChannelMerger(2);
    const masterOut = this.ctx.createGain();

    oscLeft.type = oscRight.type = 'sine';
    oscLeft.frequency.value = leftFreq;
    oscRight.frequency.value = rightFreq;

    // Smooth fade in
    masterOut.gain.setValueAtTime(0, this.ctx.currentTime);
    masterOut.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.1);

    // Route to stereo
    oscLeft.connect(gainLeft);
    oscRight.connect(gainRight);
    gainLeft.connect(merger, 0, 0); // left channel
    gainRight.connect(merger, 0, 1); // right channel
    merger.connect(masterOut);
    masterOut.connect(this.masterGain);

    const id = `binaural-${Date.now()}`;
    this.nodes.set(id, {
      oscLeft,
      oscRight,
      gainLeft,
      gainRight,
      merger,
      masterOut,
    });

    oscLeft.start();
    oscRight.start();

    if (duration > 0) {
      // Fade out
      masterOut.gain.setValueAtTime(
        gain,
        this.ctx.currentTime + duration - 0.1
      );
      masterOut.gain.linearRampToValueAtTime(
        0,
        this.ctx.currentTime + duration
      );

      oscLeft.stop(this.ctx.currentTime + duration);
      oscRight.stop(this.ctx.currentTime + duration);

      setTimeout(() => {
        this.nodes.delete(id);
      }, duration * 1000);
    }

    console.log('[AudioEngine] Binaural', {
      base,
      beat,
      leftFreq,
      rightFreq,
      duration,
    });

    return id;
  }

  /**
   * Stop specific sound by ID
   */
  stop(id) {
    const node = this.nodes.get(id);
    if (!node) return;

    try {
      if (node.osc) {
        node.osc.stop();
        node.osc.disconnect();
      }
      if (node.oscLeft) {
        node.oscLeft.stop();
        node.oscRight.stop();
        node.oscLeft.disconnect();
        node.oscRight.disconnect();
      }
      if (node.gain) node.gain.disconnect();
      if (node.masterOut) node.masterOut.disconnect();
    } catch (e) {
      // Already stopped
    }

    this.nodes.delete(id);
  }

  /**
   * Stop all sounds
   */
  stopAll() {
    this.nodes.forEach((_, id) => this.stop(id));
    console.log('[AudioEngine] All stopped');
  }

  /**
   * Set master volume
   * @param {number} gain - 0-1
   */
  setMasterGain(gain) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, gain)),
        this.ctx.currentTime
      );
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    if (!this.ctx) return null;

    return {
      state: this.ctx.state,
      sampleRate: this.ctx.sampleRate,
      currentTime: this.ctx.currentTime.toFixed(2),
      activeSounds: this.nodes.size,
      baseLatency: this.ctx.baseLatency,
      outputLatency: this.ctx.outputLatency,
    };
  }

  /**
   * Play pure waveform (sine, triangle, square, sawtooth)
   * @param {Object} opts - { type: 'sine'|'triangle'|'square'|'sawtooth', freq: 440, duration: 5, gain: 0.2, pan: 0 }
   * @returns {string} nodeId to stop later
   */
  playWaveform(opts = {}) {
    this._ensureInit();

    const {
      type = 'sine',
      freq = 440,
      duration = null,
      gain = 0.2,
      pan = 0,
      fadeIn = 0.05,
      fadeOut = 0.05,
    } = opts;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);

    const now = this.ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + fadeIn);

    osc.start(now);

    const nodeId = `waveform_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    this.nodes.set(nodeId, { osc, gainNode, panner });

    if (duration !== null) {
      const stopTime = now + duration;
      gainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, stopTime);
      osc.stop(stopTime);

      setTimeout(() => {
        this.nodes.delete(nodeId);
      }, duration * 1000 + 100);
    }

    return nodeId;
  }

  /**
   * Play noise generator (white, pink, brown, blue, violet, black)
   * @param {Object} opts - { type: 'white'|'pink'|'brown'|'blue'|'violet'|'black', duration: 30, gain: 0.15 }
   * @returns {string} nodeId
   */
  playNoise(opts = {}) {
    this._ensureInit();

    const {
      type = 'white',
      duration = null,
      gain = 0.15,
      pan = 0,
      fadeIn = 0.1,
      fadeOut = 0.1,
    } = opts;

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise based on type
    switch (type) {
      case 'white':
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        break;

      case 'pink': {
        let b0 = 0,
          b1 = 0,
          b2 = 0,
          b3 = 0,
          b4 = 0,
          b5 = 0,
          b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.969 * b2 + white * 0.153852;
          b3 = 0.8665 * b3 + white * 0.3104856;
          b4 = 0.55 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.016898;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
        break;
      }

      case 'brown': {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5; // Compensate volume
        }
        break;
      }

      case 'blue': {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = white - lastOut;
          lastOut = white;
        }
        break;
      }

      case 'violet': {
        let prev = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (white - prev) * 0.5;
          prev = white;
        }
        break;
      }

      case 'black':
        // Black noise = silence or near silence
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() - 0.5) * 0.001;
        }
        break;

      default:
        // Default to white
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    source.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);

    const now = this.ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + fadeIn);

    source.start(now);

    const nodeId = `noise_${type}_${Date.now()}`;
    this.nodes.set(nodeId, { source, gainNode, panner });

    if (duration !== null) {
      const stopTime = now + duration;
      gainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, stopTime);
      source.stop(stopTime);

      setTimeout(() => {
        this.nodes.delete(nodeId);
      }, duration * 1000 + 100);
    }

    return nodeId;
  }

  /**
   * Play Martigli waves (complex harmonic series)
   * Based on mathematical ratios and harmonic relationships
   * @param {Object} opts - { fundamental: 200, harmonics: [1, 2, 3, 5, 8], duration: 60 }
   */
  playMartigliWave(opts = {}) {
    this._ensureInit();

    const {
      fundamental = 200,
      harmonics = [1, 2, 3, 5, 8, 13], // Fibonacci-inspired
      duration = null,
      gain = 0.15,
      fadeIn = 0.5,
      fadeOut = 0.5,
    } = opts;

    const oscillators = [];
    const gainNodes = [];

    const masterGainNode = this.ctx.createGain();
    masterGainNode.gain.value = 0;
    masterGainNode.connect(this.masterGain);

    harmonics.forEach((ratio, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = fundamental * ratio;

      const harmGain = this.ctx.createGain();
      harmGain.gain.value = 1 / (idx + 1); // Decreasing amplitude

      osc.connect(harmGain);
      harmGain.connect(masterGainNode);

      oscillators.push(osc);
      gainNodes.push(harmGain);
    });

    const now = this.ctx.currentTime;
    masterGainNode.gain.setValueAtTime(0, now);
    masterGainNode.gain.linearRampToValueAtTime(gain, now + fadeIn);

    oscillators.forEach((osc) => osc.start(now));

    const nodeId = `martigli_${Date.now()}`;
    this.nodes.set(nodeId, { oscillators, gainNodes, masterGainNode });

    if (duration !== null) {
      const stopTime = now + duration;
      masterGainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      masterGainNode.gain.linearRampToValueAtTime(0, stopTime);
      oscillators.forEach((osc) => osc.stop(stopTime));

      setTimeout(() => {
        this.nodes.delete(nodeId);
      }, duration * 1000 + 100);
    }

    return nodeId;
  }

  /**
   * Play sonic symmetry (mathematical pattern-based sound)
   * @param {Object} opts - { pattern: 'fibonacci'|'golden'|'prime'|'harmonic', baseFreq: 200, duration: 30 }
   */
  playSonicSymmetry(opts = {}) {
    this._ensureInit();

    const {
      pattern = 'fibonacci',
      baseFreq = 200,
      duration = null,
      gain = 0.15,
      fadeIn = 0.5,
      fadeOut = 0.5,
    } = opts;

    let ratios = [];

    switch (pattern) {
      case 'fibonacci':
        ratios = [1, 2, 3, 5, 8, 13, 21];
        break;
      case 'golden':
        // Golden ratio series: 1, φ, φ², φ³, ...
        const phi = (1 + Math.sqrt(5)) / 2;
        ratios = [1, phi, phi * phi, phi * phi * phi];
        break;
      case 'prime':
        ratios = [1, 2, 3, 5, 7, 11, 13];
        break;
      case 'harmonic':
        ratios = [1, 1.5, 2, 2.5, 3, 4, 5, 6];
        break;
      default:
        ratios = [1, 2, 3, 4, 5];
    }

    return this.playMartigliWave({
      fundamental: baseFreq,
      harmonics: ratios,
      duration,
      gain,
      fadeIn,
      fadeOut,
    });
  }

  /**
   * Play isochronic tones (rhythmic pulses)
   * @param {Object} opts - { freq: 200, pulseFreq: 10, duration: 60 }
   */
  playIsochronic(opts = {}) {
    this._ensureInit();

    const {
      freq = 200,
      pulseFreq = 10, // Hz (pulses per second)
      duration = null,
      gain = 0.25,
      fadeIn = 0.1,
      fadeOut = 0.1,
    } = opts;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // LFO for amplitude modulation
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square'; // Sharp on/off
    lfo.frequency.value = pulseFreq;

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.5; // Modulation depth

    const carrierGain = this.ctx.createGain();
    carrierGain.gain.value = gain;

    lfo.connect(lfoGain);
    lfoGain.connect(carrierGain.gain);

    osc.connect(carrierGain);
    carrierGain.connect(this.masterGain);

    const now = this.ctx.currentTime;
    osc.start(now);
    lfo.start(now);

    const nodeId = `isochronic_${Date.now()}`;
    this.nodes.set(nodeId, { osc, lfo, carrierGain, lfoGain });

    if (duration !== null) {
      const stopTime = now + duration;
      osc.stop(stopTime);
      lfo.stop(stopTime);

      setTimeout(() => {
        this.nodes.delete(nodeId);
      }, duration * 1000 + 100);
    }

    return nodeId;
  }

  _ensureInit() {
    if (!this.initialized) {
      throw new Error('AudioEngine not initialized. Call engine.init() first.');
    }
  }
}

// Singleton instance (optional)
export const audioEngine = new AudioEngine();
