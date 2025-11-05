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


const clamp = (value, min, max) => {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
};

const TWO_PI = Math.PI * 2;

const toNumberOr = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createPanAutomation = ({ ctx, mixMode = 'dichotic', leftPanner, rightPanner }) => {
  let config = null;
  let intervalId = null;
  let baseTime = ctx?.currentTime ?? 0;

  const clearTimer = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const applyOrientation = (orientation) => {
    if (!config) return;
    const depth = clamp(toNumberOr(config.panDepth, 1), 0, 1);
    const offset = clamp(toNumberOr(config.panBaseOffset, 0), -1, 1);
    const mix = config.mixMode || mixMode || 'dichotic';
    const now = ctx?.currentTime ?? 0;
    const safeOrientation = clamp(orientation, -1, 1);

    if (mix === 'monaural') {
      const value = clamp(offset + safeOrientation * depth, -1, 1);
      if (leftPanner?.pan) {
        leftPanner.pan.setTargetAtTime(value, now, 0.05);
      }
      if (rightPanner?.pan) {
        rightPanner.pan.setTargetAtTime(value, now, 0.05);
      }
      return;
    }

    const leftValue = clamp(offset + safeOrientation * depth, -1, 1);
    const rightValue = clamp(offset - safeOrientation * depth, -1, 1);
    if (leftPanner?.pan) {
      leftPanner.pan.setTargetAtTime(leftValue, now, 0.05);
    }
    if (rightPanner?.pan) {
      rightPanner.pan.setTargetAtTime(rightValue, now, 0.05);
    }
  };

  const startLoop = (compute) => {
    clearTimer();
    baseTime = ctx?.currentTime ?? 0;
    const tick = () => {
      if (!config) return;
      const now = ctx?.currentTime ?? 0;
      const elapsed = now - baseTime;
      applyOrientation(compute(elapsed));
    };
    tick();
    intervalId = setInterval(tick, 1000 / 60);
  };

  return {
    setConfig(nextConfig = {}) {
      const previous = config || {};
      config = {
        ...previous,
        ...nextConfig,
      };
      config.mixMode = nextConfig.mixMode || previous.mixMode || mixMode || 'dichotic';
      config.panMode = config.panMode || 'static';
      config.panDepth = clamp(toNumberOr(config.panDepth, 1), 0, 1);
      config.panBaseOffset = clamp(toNumberOr(config.panBaseOffset, 0), -1, 1);
      config.panFrequency = Math.max(0, toNumberOr(config.panFrequency, 0.2));
      config.martigliFrequency = Math.max(0, toNumberOr(config.martigliFrequency, 0.1));
      config.crossfadeHold = Math.max(0, toNumberOr(config.crossfadeHold, 90));
      config.crossfadeDuration = Math.max(0.1, toNumberOr(config.crossfadeDuration, 15));
      mixMode = config.mixMode;
      baseTime = ctx?.currentTime ?? 0;

      switch (config.panMode) {
        case 'lfo': {
          if (config.panDepth <= 0 || config.panFrequency <= 0) {
            clearTimer();
            applyOrientation(mixMode === 'monaural' ? 0 : -1);
            break;
          }
          const phaseOffset = mixMode === 'monaural' ? 0 : -Math.PI / 2;
          startLoop((elapsed) =>
            Math.sin(TWO_PI * config.panFrequency * elapsed + phaseOffset)
          );
          break;
        }
        case 'martigli': {
          // Use global martigliController if available, otherwise fall back to config
          const useGlobalController =
            typeof window !== 'undefined' &&
            window.martigliController &&
            window.martigliController.active;

          if (useGlobalController) {
            // Use global breathing controller
            const phaseOffset = mixMode === 'monaural' ? 0 : -Math.PI / 2;
            startLoop(() => {
              const value = window.martigliController.getValue();
              // Apply phase offset for monaural vs binaural
              return phaseOffset === 0 ? value : Math.sin(Math.asin(value) + phaseOffset);
            });
          } else {
            // Fall back to per-track frequency
            if (config.panDepth <= 0 || config.martigliFrequency <= 0) {
              clearTimer();
              applyOrientation(mixMode === 'monaural' ? 0 : -1);
              break;
            }
            const phaseOffset = mixMode === 'monaural' ? 0 : -Math.PI / 2;
            startLoop((elapsed) =>
              Math.sin(TWO_PI * config.martigliFrequency * elapsed + phaseOffset)
            );
          }
          break;
        }
        case 'crossfade': {
          if (config.panDepth <= 0) {
            clearTimer();
            applyOrientation(mixMode === 'monaural' ? 0 : -1);
            break;
          }
          const hold = Math.max(0, config.crossfadeHold);
          const fade = Math.max(0.1, config.crossfadeDuration);
          const cycle = Math.max(0.1, hold + fade);
          startLoop((elapsed) => {
            if (cycle <= 0) {
              return mixMode === 'monaural' ? 0 : -1;
            }
            const cycleIndex = Math.floor(elapsed / cycle);
            const direction = cycleIndex % 2 === 0 ? -1 : 1;
            const position = elapsed - cycleIndex * cycle;
            if (position <= hold) {
              return direction;
            }
            const progress = Math.min(1, (position - hold) / fade);
            return direction * (1 - 2 * progress);
          });
          break;
        }
        default: {
          clearTimer();
          const orientation = mixMode === 'monaural' ? 0 : -1;
          applyOrientation(orientation);
        }
      }
    },
    dispose() {
      clearTimer();
      config = null;
    },
  };
};

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
  init() {
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

  _resolveBinauralFrequencies({
    frequencyMode = 'carrier-beat',
    base,
    beat,
    leftFrequency,
    rightFrequency,
  } = {}) {
    const safeBase = clamp(toNumberOr(base, 200), 20, 4000);
    const safeBeat = clamp(Math.abs(toNumberOr(beat, 10)), 0, 400);
    if (frequencyMode === 'absolute') {
      let left = toNumberOr(leftFrequency, safeBase - safeBeat / 2);
      let right = toNumberOr(rightFrequency, safeBase + safeBeat / 2);
      left = clamp(left, 20, 4000);
      right = clamp(right, 20, 4000);
      const resolvedBase = (left + right) / 2;
      const resolvedBeat = Math.abs(right - left);
      return {
        left,
        right,
        base: clamp(resolvedBase, 20, 4000),
        beat: clamp(resolvedBeat, 0, 400),
      };
    }
    const left = clamp(safeBase - safeBeat / 2, 20, 4000);
    const right = clamp(safeBase + safeBeat / 2, 20, 4000);
    return {
      left,
      right,
      base: safeBase,
      beat: safeBeat,
    };
  }

  /**
   * Play binaural or monaural beat with advanced panning
   */
  playBinaural(options = {}) {
    this._ensureInit();

    const {
      mixMode = 'dichotic',
      frequencyMode = 'carrier-beat',
      base = 300,
      beat = 8,
      leftFrequency,
      rightFrequency,
      duration = 0,
      gain = 0.4,
      panMode = 'static',
      panDepth = 1,
      panFrequency = 0.2,
      martigliFrequency = 0.1,
      crossfadeHold = 90,
      crossfadeDuration = 15,
      panBaseOffset = 0,
    } = options;

    const resolved = this._resolveBinauralFrequencies({
      frequencyMode,
      base,
      beat,
      leftFrequency,
      rightFrequency,
    });

    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    oscLeft.type = oscRight.type = 'sine';
    oscLeft.frequency.value = resolved.left;
    oscRight.frequency.value = resolved.right;

    const gainLeft = this.ctx.createGain();
    const gainRight = this.ctx.createGain();
    gainLeft.gain.value = 0.5;
    gainRight.gain.value = 0.5;

    const leftPanner = this.ctx.createStereoPanner();
    const rightPanner = this.ctx.createStereoPanner();

    oscLeft.connect(gainLeft);
    oscRight.connect(gainRight);
    gainLeft.connect(leftPanner);
    gainRight.connect(rightPanner);

    const masterOut = this.ctx.createGain();
    const now = this.ctx.currentTime;
    masterOut.gain.setValueAtTime(0, now);
    masterOut.gain.linearRampToValueAtTime(clamp(toNumberOr(gain, 0.4), 0, 1), now + 0.1);

    leftPanner.connect(masterOut);
    rightPanner.connect(masterOut);
    masterOut.connect(this.masterGain);

    const id = `binaural-${Date.now()}`;
    const panAutomation = createPanAutomation({
      ctx: this.ctx,
      mixMode,
      leftPanner,
      rightPanner,
    });

    panAutomation.setConfig({
      mixMode,
      panMode,
      panDepth,
      panFrequency,
      martigliFrequency,
      crossfadeHold,
      crossfadeDuration,
      panBaseOffset,
    });

    const nodeData = {
      type: 'binaural',
      oscLeft,
      oscRight,
      gainLeft,
      gainRight,
      leftPanner,
      rightPanner,
      masterOut,
      panAutomation,
      mixMode,
      frequencyMode,
      panMode,
      panDepth,
      panFrequency,
      martigliFrequency,
      crossfadeHold,
      crossfadeDuration,
      panBaseOffset,
      _base: resolved.base,
      _beat: resolved.beat,
      _leftFrequency: resolved.left,
      _rightFrequency: resolved.right,
      _gain: clamp(toNumberOr(gain, 0.4), 0, 1),
    };

    this.nodes.set(id, nodeData);

    oscLeft.start(now);
    oscRight.start(now);

    if (duration > 0) {
      const stopTime = now + duration;
      masterOut.gain.setValueAtTime(nodeData._gain, stopTime - 0.1);
      masterOut.gain.linearRampToValueAtTime(0, stopTime);
      oscLeft.stop(stopTime);
      oscRight.stop(stopTime);

      setTimeout(() => {
        const stored = this.nodes.get(id);
        stored?.panAutomation?.dispose?.();
        this.nodes.delete(id);
      }, duration * 1000 + 100);
    }

    console.log('[AudioEngine] Binaural', {
      mixMode,
      frequencyMode,
      base: resolved.base,
      beat: resolved.beat,
      leftFreq: resolved.left,
      rightFreq: resolved.right,
      panMode,
      duration,
    });

    return id;
  }

  /**
   * Play monaural beat using binaural engine with summed output
   */
  playMonaural(options = {}) {
    return this.playBinaural({
      mixMode: 'monaural',
      ...options,
    });
  }

  /**
   * Stop specific sound by ID
   */
  stop(id) {
    const node = this.nodes.get(id);
    if (!node) return;

    const safeStop = (osc) => {
      if (!osc) return;
      try {
        if (typeof osc.stop === 'function') {
          osc.stop();
        }
      } catch {
        // noop - oscillator might already be stopped
      }
      try {
        if (typeof osc.disconnect === 'function') {
          osc.disconnect();
        }
      } catch {
        // noop - node might already be disconnected
      }
    };

    const safeDisconnect = (audioNode) => {
      if (!audioNode) return;
      try {
        if (typeof audioNode.disconnect === 'function') {
          audioNode.disconnect();
        }
      } catch {
        // noop
      }
    };

    try {
      safeStop(node.osc);
      safeStop(node.oscLeft);
      safeStop(node.oscRight);
      safeStop(node.lfo);
      safeStop(node.source);
      safeStop(node.osc1);
      safeStop(node.osc2);

      if (Array.isArray(node.oscillators)) {
        node.oscillators.forEach(safeStop);
      }
      if (Array.isArray(node.sources)) {
        node.sources.forEach(safeStop);
      }
      if (node.panAutomation?.dispose) {
        try {
          node.panAutomation.dispose();
        } catch {
          // ignore cleanup errors
        }
      }

      safeDisconnect(node.gain);
      safeDisconnect(node.gainLeft);
      safeDisconnect(node.gainRight);
      safeDisconnect(node.gainNode);
      safeDisconnect(node.carrierGain);
      safeDisconnect(node.lfoGain);
      safeDisconnect(node.masterOut);
      safeDisconnect(node.leftPanner);
      safeDisconnect(node.rightPanner);
      safeDisconnect(node.masterGainNode);
      safeDisconnect(node.merger);
      safeDisconnect(node.panner);
      safeDisconnect(node.mixGain);

      if (Array.isArray(node.gainNodes)) {
        node.gainNodes.forEach(safeDisconnect);
      }
    } catch {
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

    const nodeId = `waveform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.nodes.set(nodeId, { osc, gainNode, panner, _freq: freq, _gain: gain, _pan: pan });

    if (duration !== null) {
      const stopTime = now + duration;
      gainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, stopTime);
      osc.stop(stopTime);

      setTimeout(
        () => {
          this.nodes.delete(nodeId);
        },
        duration * 1000 + 100
      );
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
    this.nodes.set(nodeId, {
      source,
      gainNode,
      panner,
      _type: type,
      _gain: gain,
      _pan: pan,
    });

    if (duration !== null) {
      const stopTime = now + duration;
      gainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, stopTime);
      source.stop(stopTime);

      setTimeout(
        () => {
          this.nodes.delete(nodeId);
        },
        duration * 1000 + 100
      );
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
    this.nodes.set(nodeId, {
      oscillators,
      gainNodes,
      masterGainNode,
      _fundamental: fundamental,
      _harmonics: harmonics,
      _gain: gain,
    });

    if (duration !== null) {
      const stopTime = now + duration;
      masterGainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      masterGainNode.gain.linearRampToValueAtTime(0, stopTime);
      oscillators.forEach((osc) => osc.stop(stopTime));

      setTimeout(
        () => {
          this.nodes.delete(nodeId);
        },
        duration * 1000 + 100
      );
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
      case 'golden': {
        // Golden ratio series: 1, φ, φ², φ³, ...
        const phi = (1 + Math.sqrt(5)) / 2;
        ratios = [1, phi, phi * phi, phi * phi * phi];
        break;
      }
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
    carrierGain.gain.value = 0;

    lfo.connect(lfoGain);
    lfoGain.connect(carrierGain.gain);

    osc.connect(carrierGain);
    carrierGain.connect(this.masterGain);

    const now = this.ctx.currentTime;
    carrierGain.gain.setValueAtTime(0, now);
    carrierGain.gain.linearRampToValueAtTime(gain, now + fadeIn);

    osc.start(now);
    lfo.start(now);

    const nodeId = `isochronic_${Date.now()}`;
    this.nodes.set(nodeId, {
      osc,
      lfo,
      carrierGain,
      lfoGain,
      _freq: freq,
      _pulseFreq: pulseFreq,
      _gain: gain,
    });

    if (duration !== null) {
      const stopTime = now + duration;
      carrierGain.gain.setValueAtTime(gain, stopTime - fadeOut);
      carrierGain.gain.linearRampToValueAtTime(0, stopTime);
      osc.stop(stopTime);
      lfo.stop(stopTime);

      setTimeout(
        () => {
          this.nodes.delete(nodeId);
        },
        duration * 1000 + 100
      );
    }

    return nodeId;
  }

  updateWaveform(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const now = this.ctx.currentTime;
    if (params.freq !== undefined && node.osc?.frequency) {
      const freq = clamp(params.freq, 1, 20000);
      node.osc.frequency.setTargetAtTime(freq, now, 0.05);
      node._freq = freq;
    }
    if (params.gain !== undefined && node.gainNode?.gain) {
      const gain = clamp(params.gain, 0, 1);
      node.gainNode.gain.setTargetAtTime(gain, now, 0.05);
      node._gain = gain;
    }
    if (params.pan !== undefined && node.panner?.pan) {
      const pan = clamp(params.pan, -1, 1);
      node.panner.pan.setTargetAtTime(pan, now, 0.05);
      node._pan = pan;
    }
    return true;
  }

  updateNoise(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const now = this.ctx.currentTime;
    if (params.gain !== undefined && node.gainNode?.gain) {
      const gain = clamp(params.gain, 0, 1);
      node.gainNode.gain.setTargetAtTime(gain, now, 0.05);
      node._gain = gain;
    }
    if (params.pan !== undefined && node.panner?.pan) {
      const pan = clamp(params.pan, -1, 1);
      node.panner.pan.setTargetAtTime(pan, now, 0.05);
      node._pan = pan;
    }
    return true;
  }

  updateBinaural(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const now = this.ctx.currentTime;

    const mixMode = params.mixMode || node.mixMode || 'dichotic';
    const frequencyMode = params.frequencyMode || node.frequencyMode || 'carrier-beat';

    const baseInput =
      params.base !== undefined ? toNumberOr(params.base, node._base ?? 200) : node._base ?? 200;
    const beatInput =
      params.beat !== undefined ? toNumberOr(params.beat, node._beat ?? 10) : node._beat ?? 10;
    const leftInput =
      params.leftFrequency !== undefined
        ? toNumberOr(params.leftFrequency, node._leftFrequency ?? baseInput - beatInput / 2)
        : node._leftFrequency ?? baseInput - beatInput / 2;
    const rightInput =
      params.rightFrequency !== undefined
        ? toNumberOr(params.rightFrequency, node._rightFrequency ?? baseInput + beatInput / 2)
        : node._rightFrequency ?? baseInput + beatInput / 2;

    const resolved = this._resolveBinauralFrequencies({
      frequencyMode,
      base: baseInput,
      beat: beatInput,
      leftFrequency: leftInput,
      rightFrequency: rightInput,
    });

    if (node.oscLeft?.frequency) {
      node.oscLeft.frequency.setTargetAtTime(resolved.left, now, 0.1);
    }
    if (node.oscRight?.frequency) {
      node.oscRight.frequency.setTargetAtTime(resolved.right, now, 0.1);
    }
    if (params.gain !== undefined && node.masterOut?.gain) {
      const nextGain = clamp(toNumberOr(params.gain, node._gain ?? 0.3), 0, 1);
      node.masterOut.gain.setTargetAtTime(nextGain, now, 0.05);
      node._gain = nextGain;
    }

    node._base = resolved.base;
    node._beat = resolved.beat;
    node._leftFrequency = resolved.left;
    node._rightFrequency = resolved.right;
    node.mixMode = mixMode;
    node.frequencyMode = frequencyMode;

    const panConfig = {
      mixMode,
      panMode: params.panMode !== undefined ? params.panMode : node.panMode,
      panDepth: params.panDepth !== undefined ? params.panDepth : node.panDepth,
      panFrequency:
        params.panFrequency !== undefined ? params.panFrequency : node.panFrequency,
      martigliFrequency:
        params.martigliFrequency !== undefined
          ? params.martigliFrequency
          : node.martigliFrequency,
      crossfadeHold:
        params.crossfadeHold !== undefined ? params.crossfadeHold : node.crossfadeHold,
      crossfadeDuration:
        params.crossfadeDuration !== undefined
          ? params.crossfadeDuration
          : node.crossfadeDuration,
      panBaseOffset:
        params.panBaseOffset !== undefined ? params.panBaseOffset : node.panBaseOffset,
    };

    node.panMode = panConfig.panMode;
    node.panDepth = panConfig.panDepth;
    node.panFrequency = panConfig.panFrequency;
    node.martigliFrequency = panConfig.martigliFrequency;
    node.crossfadeHold = panConfig.crossfadeHold;
    node.crossfadeDuration = panConfig.crossfadeDuration;
    node.panBaseOffset = panConfig.panBaseOffset;

    if (!node.panAutomation && node.leftPanner && node.rightPanner) {
      node.panAutomation = createPanAutomation({
        ctx: this.ctx,
        mixMode,
        leftPanner: node.leftPanner,
        rightPanner: node.rightPanner,
      });
    }

    if (node.panAutomation?.setConfig) {
      node.panAutomation.setConfig(panConfig);
    }

    return true;
  }

  updateMonaural(nodeId, params = {}) {
    return this.updateBinaural(nodeId, {
      mixMode: 'monaural',
      ...params,
    });
  }

  updateIsochronic(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const now = this.ctx.currentTime;
    if (params.freq !== undefined && node.osc?.frequency) {
      const freq = clamp(params.freq, 20, 4000);
      node.osc.frequency.setTargetAtTime(freq, now, 0.05);
      node._freq = freq;
    }
    if (params.pulseFreq !== undefined && node.lfo?.frequency) {
      const pulseFreq = clamp(params.pulseFreq, 0.1, 100);
      node.lfo.frequency.setTargetAtTime(pulseFreq, now, 0.05);
      node._pulseFreq = pulseFreq;
    }
    if (params.gain !== undefined && node.carrierGain?.gain) {
      const gain = clamp(params.gain, 0, 1);
      node.carrierGain.gain.setTargetAtTime(gain, now, 0.05);
      node._gain = gain;
    }
    return true;
  }

  updateMartigliWave(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const now = this.ctx.currentTime;
    if (params.gain !== undefined && node.masterGainNode?.gain) {
      const gain = clamp(params.gain, 0, 1);
      node.masterGainNode.gain.setTargetAtTime(gain, now, 0.05);
      node._gain = gain;
    }
    if (params.fundamental !== undefined && Array.isArray(node.oscillators)) {
      const fundamental = clamp(params.fundamental, 20, 1200);
      const ratios = node._harmonics || node.harmonics || [];
      node.oscillators.forEach((osc, index) => {
        const ratio = ratios[index] ?? 1;
        osc.frequency.setTargetAtTime(fundamental * ratio, now, 0.05);
      });
      node._fundamental = fundamental;
    }
    return true;
  }

  _ensureInit() {
    if (!this.initialized) {
      throw new Error('AudioEngine not initialized. Call engine.init() first.');
    }
  }
}

// Singleton instance (optional)
export const audioEngine = new AudioEngine();
