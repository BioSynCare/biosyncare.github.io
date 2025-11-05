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
      martigliConfig = {},
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

    // Set up Martigli modulation if any parameter has depth > 0
    let intervalId = null;
    const hasMartigliModulation =
      (martigliConfig.base?.enabled) ||
      (martigliConfig.beat?.enabled) ||
      (martigliConfig.gain?.enabled);

    if (hasMartigliModulation) {
      const updateModulation = () => {
        if (!this.nodes.has(id)) {
          clearInterval(intervalId);
          return;
        }
        const node = this.nodes.get(id);
        if (!node) {
          clearInterval(intervalId);
          return;
        }

        // Get current Martigli value [-1, 1]
        let martigliValue = 0;
        if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
          martigliValue = window.martigliController.getValue();
        }

        const now = this.ctx.currentTime;

        // Modulate base carrier frequency
        if (node._martigliConfig?.base?.enabled) {
          const targetBase = node._baseBase + (node._martigliConfig.base.depth * martigliValue);
          const clampedBase = clamp(targetBase, 20, 20000);

          // Recalculate left/right frequencies with modulated base
          const halfBeat = node._baseBeat / 2;
          const newLeft = clampedBase - halfBeat;
          const newRight = clampedBase + halfBeat;

          if (node.oscLeft?.frequency) node.oscLeft.frequency.setTargetAtTime(newLeft, now, 0.02);
          if (node.oscRight?.frequency) node.oscRight.frequency.setTargetAtTime(newRight, now, 0.02);
        }

        // Modulate beat frequency
        if (node._martigliConfig?.beat?.enabled) {
          const targetBeat = node._baseBeat + (node._martigliConfig.beat.depth * martigliValue);
          const clampedBeat = clamp(targetBeat, 0.1, 100);

          // Recalculate left/right frequencies with modulated beat
          const currentBase = node._martigliConfig?.base?.enabled
            ? node._baseBase + (node._martigliConfig.base.depth * martigliValue)
            : node._baseBase;
          const halfBeat = clampedBeat / 2;
          const newLeft = currentBase - halfBeat;
          const newRight = currentBase + halfBeat;

          if (node.oscLeft?.frequency) node.oscLeft.frequency.setTargetAtTime(newLeft, now, 0.02);
          if (node.oscRight?.frequency) node.oscRight.frequency.setTargetAtTime(newRight, now, 0.02);
        }

        // Modulate gain
        if (node._martigliConfig?.gain?.enabled && node.masterOut?.gain) {
          const targetGain = node._baseGain + (node._martigliConfig.gain.depth * martigliValue);
          const clampedGain = clamp(targetGain, 0, 1);
          node.masterOut.gain.setTargetAtTime(clampedGain, now, 0.02);
        }
      };

      intervalId = setInterval(updateModulation, 50);
    }

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
      _baseBase: resolved.base,
      _baseBeat: resolved.beat,
      _base: resolved.base,
      _beat: resolved.beat,
      _leftFrequency: resolved.left,
      _rightFrequency: resolved.right,
      _baseGain: clamp(toNumberOr(gain, 0.4), 0, 1),
      _gain: clamp(toNumberOr(gain, 0.4), 0, 1),
      _martigliConfig: martigliConfig,
      _martigliInterval: intervalId,
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
        if (intervalId) clearInterval(intervalId);
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
      // Clear Martigli modulation interval if it exists
      if (node._martigliInterval) {
        clearInterval(node._martigliInterval);
        node._martigliInterval = null;
      }

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
      martigliConfig = {},
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

    // Set up Martigli modulation if any parameter has depth > 0
    let intervalId = null;
    const hasMartigliModulation =
      (martigliConfig.frequency?.enabled) ||
      (martigliConfig.gain?.enabled) ||
      (martigliConfig.pan?.enabled);

    if (hasMartigliModulation) {
      const updateModulation = () => {
        if (!this.nodes.has(nodeId)) {
          clearInterval(intervalId);
          return;
        }
        const node = this.nodes.get(nodeId);
        if (!node) {
          clearInterval(intervalId);
          return;
        }

        // Get current Martigli value [-1, 1]
        let martigliValue = 0;
        if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
          martigliValue = window.martigliController.getValue();
        }

        const now = this.ctx.currentTime;

        // Modulate frequency: freq = baseFreq + (depth × martigliValue)
        if (node._martigliConfig?.frequency?.enabled && node.osc?.frequency) {
          const targetFreq = node._baseFreq + (node._martigliConfig.frequency.depth * martigliValue);
          const clampedFreq = clamp(targetFreq, 20, 20000);
          node.osc.frequency.setTargetAtTime(clampedFreq, now, 0.02);
        }

        // Modulate gain: gain = baseGain + (depth × martigliValue)
        if (node._martigliConfig?.gain?.enabled && node.gainNode?.gain) {
          const targetGain = node._baseGain + (node._martigliConfig.gain.depth * martigliValue);
          const clampedGain = clamp(targetGain, 0, 1);
          node.gainNode.gain.setTargetAtTime(clampedGain, now, 0.02);
        }

        // Modulate pan: pan = basePan + (depth × martigliValue)
        if (node._martigliConfig?.pan?.enabled && node.panner?.pan) {
          const targetPan = node._basePan + (node._martigliConfig.pan.depth * martigliValue);
          const clampedPan = clamp(targetPan, -1, 1);
          node.panner.pan.setTargetAtTime(clampedPan, now, 0.02);
        }
      };

      intervalId = setInterval(updateModulation, 50);
    }

    this.nodes.set(nodeId, {
      osc,
      gainNode,
      panner,
      _baseFreq: freq,
      _freq: freq,
      _baseGain: gain,
      _gain: gain,
      _basePan: pan,
      _pan: pan,
      _martigliConfig: martigliConfig,
      _martigliInterval: intervalId,
    });

    if (duration !== null) {
      const stopTime = now + duration;
      gainNode.gain.setValueAtTime(gain, stopTime - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, stopTime);
      osc.stop(stopTime);

      setTimeout(
        () => {
          if (intervalId) clearInterval(intervalId);
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
      martigliConfig = {},
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

    // Set up Martigli modulation
    let intervalId = null;
    const hasMartigliModulation =
      (martigliConfig.freq?.enabled) ||
      (martigliConfig.pulseFreq?.enabled) ||
      (martigliConfig.gain?.enabled);

    const nodeData = {
      osc,
      lfo,
      carrierGain,
      lfoGain,
      _freq: freq,
      _pulseFreq: pulseFreq,
      _gain: gain,
      _baseFreq: freq,
      _basePulseFreq: pulseFreq,
      _baseGain: gain,
      _martigliConfig: martigliConfig,
      _martigliInterval: null,
    };

    this.nodes.set(nodeId, nodeData);

    if (hasMartigliModulation) {
      const updateModulation = () => {
        const node = this.nodes.get(nodeId);
        if (!node) {
          if (intervalId) clearInterval(intervalId);
          return;
        }

        let martigliValue = 0;
        if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
          martigliValue = window.martigliController.getValue();
        }

        const now = this.ctx.currentTime;

        // Modulate carrier frequency
        if (node._martigliConfig?.freq?.enabled && node.osc?.frequency) {
          const targetFreq = node._baseFreq + (node._martigliConfig.freq.depth * martigliValue);
          const clampedFreq = clamp(targetFreq, 20, 20000);
          node.osc.frequency.setTargetAtTime(clampedFreq, now, 0.02);
        }

        // Modulate pulse frequency
        if (node._martigliConfig?.pulseFreq?.enabled && node.lfo?.frequency) {
          const targetPulseFreq = node._basePulseFreq + (node._martigliConfig.pulseFreq.depth * martigliValue);
          const clampedPulseFreq = clamp(targetPulseFreq, 0.1, 100);
          node.lfo.frequency.setTargetAtTime(clampedPulseFreq, now, 0.02);
        }

        // Modulate gain
        if (node._martigliConfig?.gain?.enabled && node.carrierGain?.gain) {
          const targetGain = node._baseGain + (node._martigliConfig.gain.depth * martigliValue);
          const clampedGain = clamp(targetGain, 0, 1);
          node.carrierGain.gain.setTargetAtTime(clampedGain, now, 0.02);
        }
      };

      intervalId = setInterval(updateModulation, 50);
      nodeData._martigliInterval = intervalId;
    }

    if (duration !== null) {
      const stopTime = now + duration;
      carrierGain.gain.setValueAtTime(gain, stopTime - fadeOut);
      carrierGain.gain.linearRampToValueAtTime(0, stopTime);
      osc.stop(stopTime);
      lfo.stop(stopTime);

      setTimeout(
        () => {
          if (intervalId) clearInterval(intervalId);
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

    // Update base values
    if (params.freq !== undefined && node.osc?.frequency) {
      const freq = clamp(params.freq, 1, 20000);
      node._baseFreq = freq;
      node._freq = freq;
      // If not using frequency modulation, update directly
      if (!node._martigliConfig?.frequency?.enabled) {
        node.osc.frequency.setTargetAtTime(freq, now, 0.05);
      }
    }

    if (params.gain !== undefined && node.gainNode?.gain) {
      const gain = clamp(params.gain, 0, 1);
      node._baseGain = gain;
      node._gain = gain;
      // If not using gain modulation, update directly
      if (!node._martigliConfig?.gain?.enabled) {
        node.gainNode.gain.setTargetAtTime(gain, now, 0.05);
      }
    }

    if (params.pan !== undefined && node.panner?.pan) {
      const pan = clamp(params.pan, -1, 1);
      node._basePan = pan;
      node._pan = pan;
      // If not using pan modulation, update directly
      if (!node._martigliConfig?.pan?.enabled) {
        node.panner.pan.setTargetAtTime(pan, now, 0.05);
      }
    }

    // Handle Martigli config updates
    if (params.martigliConfig !== undefined) {
      const oldConfig = node._martigliConfig || {};
      const newConfig = params.martigliConfig;
      node._martigliConfig = newConfig;

      const hadModulation =
        oldConfig.frequency?.enabled ||
        oldConfig.gain?.enabled ||
        oldConfig.pan?.enabled;

      const hasModulation =
        newConfig.frequency?.enabled ||
        newConfig.gain?.enabled ||
        newConfig.pan?.enabled;

      // If modulation status changed, start or stop interval
      if (hasModulation && !hadModulation) {
        // Start modulation
        const updateModulation = () => {
          if (!this.nodes.has(nodeId)) {
            clearInterval(node._martigliInterval);
            return;
          }
          const n = this.nodes.get(nodeId);
          if (!n) {
            clearInterval(node._martigliInterval);
            return;
          }

          let martigliValue = 0;
          if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
            martigliValue = window.martigliController.getValue();
          }

          const now = this.ctx.currentTime;

          if (n._martigliConfig?.frequency?.enabled && n.osc?.frequency) {
            const targetFreq = n._baseFreq + (n._martigliConfig.frequency.depth * martigliValue);
            const clampedFreq = clamp(targetFreq, 20, 20000);
            n.osc.frequency.setTargetAtTime(clampedFreq, now, 0.02);
          }

          if (n._martigliConfig?.gain?.enabled && n.gainNode?.gain) {
            const targetGain = n._baseGain + (n._martigliConfig.gain.depth * martigliValue);
            const clampedGain = clamp(targetGain, 0, 1);
            n.gainNode.gain.setTargetAtTime(clampedGain, now, 0.02);
          }

          if (n._martigliConfig?.pan?.enabled && n.panner?.pan) {
            const targetPan = n._basePan + (n._martigliConfig.pan.depth * martigliValue);
            const clampedPan = clamp(targetPan, -1, 1);
            n.panner.pan.setTargetAtTime(clampedPan, now, 0.02);
          }
        };

        node._martigliInterval = setInterval(updateModulation, 50);
      } else if (!hasModulation && hadModulation) {
        // Stop modulation
        if (node._martigliInterval) {
          clearInterval(node._martigliInterval);
          node._martigliInterval = null;
        }
        // Reset to base values
        if (node.osc?.frequency) node.osc.frequency.setTargetAtTime(node._baseFreq, now, 0.05);
        if (node.gainNode?.gain) node.gainNode.gain.setTargetAtTime(node._baseGain, now, 0.05);
        if (node.panner?.pan) node.panner.pan.setTargetAtTime(node._basePan, now, 0.05);
      }
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
      params.base !== undefined ? toNumberOr(params.base, node._baseBase ?? 200) : node._baseBase ?? 200;
    const beatInput =
      params.beat !== undefined ? toNumberOr(params.beat, node._baseBeat ?? 10) : node._baseBeat ?? 10;
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

    // Update martigliConfig if provided
    if (params.martigliConfig !== undefined) {
      // Clear old interval
      if (node._martigliInterval) {
        clearInterval(node._martigliInterval);
        node._martigliInterval = null;
      }

      node._martigliConfig = params.martigliConfig;

      // Set up new modulation if any parameter is enabled
      const hasMartigliModulation =
        (params.martigliConfig.base?.enabled) ||
        (params.martigliConfig.beat?.enabled) ||
        (params.martigliConfig.gain?.enabled);

      if (hasMartigliModulation) {
        const updateModulation = () => {
          let martigliValue = 0;
          if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
            martigliValue = window.martigliController.getValue();
          }

          const now = this.ctx.currentTime;

          // Modulate base carrier frequency
          if (node._martigliConfig?.base?.enabled) {
            const targetBase = node._baseBase + (node._martigliConfig.base.depth * martigliValue);
            const clampedBase = clamp(targetBase, 20, 20000);
            const halfBeat = node._baseBeat / 2;
            const newLeft = clampedBase - halfBeat;
            const newRight = clampedBase + halfBeat;
            node.oscLeft.frequency.setTargetAtTime(newLeft, now, 0.02);
            node.oscRight.frequency.setTargetAtTime(newRight, now, 0.02);
          }

          // Modulate beat frequency
          if (node._martigliConfig?.beat?.enabled) {
            const targetBeat = node._baseBeat + (node._martigliConfig.beat.depth * martigliValue);
            const clampedBeat = clamp(targetBeat, 0.1, 100);
            const currentBase = node._martigliConfig?.base?.enabled
              ? node._baseBase + (node._martigliConfig.base.depth * martigliValue)
              : node._baseBase;
            const halfBeat = clampedBeat / 2;
            const newLeft = currentBase - halfBeat;
            const newRight = currentBase + halfBeat;
            node.oscLeft.frequency.setTargetAtTime(newLeft, now, 0.02);
            node.oscRight.frequency.setTargetAtTime(newRight, now, 0.02);
          }

          // Modulate gain
          if (node._martigliConfig?.gain?.enabled && node.masterOut?.gain) {
            const targetGain = node._baseGain + (node._martigliConfig.gain.depth * martigliValue);
            const clampedGain = clamp(targetGain, 0, 1);
            node.masterOut.gain.setTargetAtTime(clampedGain, now, 0.02);
          }
        };

        node._martigliInterval = setInterval(updateModulation, 50);
      }
    }

    // Update base values (used for modulation)
    if (params.base !== undefined) {
      node._baseBase = resolved.base;
    }
    if (params.beat !== undefined) {
      node._baseBeat = resolved.beat;
    }
    if (params.gain !== undefined) {
      node._baseGain = clamp(toNumberOr(params.gain, node._baseGain ?? 0.3), 0, 1);
    }

    if (node.oscLeft?.frequency) {
      node.oscLeft.frequency.setTargetAtTime(resolved.left, now, 0.1);
    }
    if (node.oscRight?.frequency) {
      node.oscRight.frequency.setTargetAtTime(resolved.right, now, 0.1);
    }
    if (params.gain !== undefined && node.masterOut?.gain) {
      const nextGain = clamp(toNumberOr(params.gain, node._baseGain ?? 0.3), 0, 1);
      node.masterOut.gain.setTargetAtTime(nextGain, now, 0.05);
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

    // Update martigliConfig if provided
    if (params.martigliConfig !== undefined) {
      // Clear old interval
      if (node._martigliInterval) {
        clearInterval(node._martigliInterval);
        node._martigliInterval = null;
      }

      node._martigliConfig = params.martigliConfig;

      // Set up new modulation if any parameter is enabled
      const hasMartigliModulation =
        (params.martigliConfig.freq?.enabled) ||
        (params.martigliConfig.pulseFreq?.enabled) ||
        (params.martigliConfig.gain?.enabled);

      if (hasMartigliModulation) {
        const updateModulation = () => {
          const node = this.nodes.get(nodeId);
          if (!node) {
            return;
          }

          let martigliValue = 0;
          if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
            martigliValue = window.martigliController.getValue();
          }

          const now = this.ctx.currentTime;

          // Modulate carrier frequency
          if (node._martigliConfig?.freq?.enabled && node.osc?.frequency) {
            const targetFreq = node._baseFreq + (node._martigliConfig.freq.depth * martigliValue);
            const clampedFreq = clamp(targetFreq, 20, 20000);
            node.osc.frequency.setTargetAtTime(clampedFreq, now, 0.02);
          }

          // Modulate pulse frequency
          if (node._martigliConfig?.pulseFreq?.enabled && node.lfo?.frequency) {
            const targetPulseFreq = node._basePulseFreq + (node._martigliConfig.pulseFreq.depth * martigliValue);
            const clampedPulseFreq = clamp(targetPulseFreq, 0.1, 100);
            node.lfo.frequency.setTargetAtTime(clampedPulseFreq, now, 0.02);
          }

          // Modulate gain
          if (node._martigliConfig?.gain?.enabled && node.carrierGain?.gain) {
            const targetGain = node._baseGain + (node._martigliConfig.gain.depth * martigliValue);
            const clampedGain = clamp(targetGain, 0, 1);
            node.carrierGain.gain.setTargetAtTime(clampedGain, now, 0.02);
          }
        };

        node._martigliInterval = setInterval(updateModulation, 50);
      }
    }

    // Update base values (used for modulation)
    if (params.freq !== undefined) {
      const freq = clamp(params.freq, 20, 4000);
      node._baseFreq = freq;
      node._freq = freq;
      // Only update directly if not using modulation
      if (!node._martigliConfig?.freq?.enabled && node.osc?.frequency) {
        node.osc.frequency.setTargetAtTime(freq, now, 0.05);
      }
    }
    if (params.pulseFreq !== undefined) {
      const pulseFreq = clamp(params.pulseFreq, 0.1, 100);
      node._basePulseFreq = pulseFreq;
      node._pulseFreq = pulseFreq;
      // Only update directly if not using modulation
      if (!node._martigliConfig?.pulseFreq?.enabled && node.lfo?.frequency) {
        node.lfo.frequency.setTargetAtTime(pulseFreq, now, 0.05);
      }
    }
    if (params.gain !== undefined) {
      const gain = clamp(params.gain, 0, 1);
      node._baseGain = gain;
      node._gain = gain;
      // Only update directly if not using modulation
      if (!node._martigliConfig?.gain?.enabled && node.carrierGain?.gain) {
        node.carrierGain.gain.setTargetAtTime(gain, now, 0.05);
      }
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

  /**
   * Play Martigli oscillation - a tone that follows the global Martigli breathing controller
   * @param {Object} opts - { baseFrequency: 200, amplitude: 100, gain: 0.2, pan: 0 }
   * @returns {string} nodeId
   */
  playMartigliOscillation(opts = {}) {
    this._ensureInit();

    const {
      baseFrequency = 200,
      amplitude = 100,
      gain = 0.2,
      pan = 0,
      fadeIn = 0.05,
    } = opts;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = baseFrequency;

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

    const nodeId = `martigliOsc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Update frequency based on Martigli controller value
    const updateFrequency = () => {
      if (!this.nodes.has(nodeId)) {
        clearInterval(intervalId);
        return;
      }

      const node = this.nodes.get(nodeId);
      if (!node || !node.osc) {
        clearInterval(intervalId);
        return;
      }

      // Get current Martigli value [-1, 1]
      let martigliValue = 0;
      if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
        martigliValue = window.martigliController.getValue();
      }

      // Calculate target frequency: base ± (amplitude * martigliValue)
      const targetFreq = node._baseFrequency + (node._amplitude * martigliValue);
      const clampedFreq = clamp(targetFreq, 20, 20000);

      // Smoothly update frequency
      const now = this.ctx.currentTime;
      node.osc.frequency.setTargetAtTime(clampedFreq, now, 0.02);
    };

    // Store node with its parameters and start update interval
    const intervalId = setInterval(updateFrequency, 50); // Update every 50ms

    this.nodes.set(nodeId, {
      osc,
      gainNode,
      panner,
      _baseFrequency: baseFrequency,
      _amplitude: amplitude,
      _gain: gain,
      _pan: pan,
      _martigliInterval: intervalId,
    });

    return nodeId;
  }

  /**
   * Update Martigli oscillation parameters
   * @param {string} nodeId
   * @param {Object} params - { baseFrequency, amplitude, gain, pan }
   * @returns {boolean} success
   */
  updateMartigliOscillation(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    const now = this.ctx.currentTime;

    if (params.baseFrequency !== undefined) {
      node._baseFrequency = clamp(params.baseFrequency, 20, 20000);
    }

    if (params.amplitude !== undefined) {
      node._amplitude = clamp(params.amplitude, 0, 1000);
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

  /**
   * Play Martigli-Mix - combines binaural, monaural, and isochronic all modulated by breathing
   * @param {Object} opts - { baseFrequency, amplitude, beatFrequency, isochronicRate, binauralGain, monauralGain, isochronicGain }
   * @returns {string} nodeId
   */
  playMartigliMix(opts = {}) {
    this._ensureInit();

    const {
      baseFrequency = 200,
      amplitude = 100,
      beatFrequency = 10,
      isochronicRate = 6,
      binauralGain = 0.2,
      monauralGain = 0.2,
      isochronicGain = 0.15,
      fadeIn = 0.05,
    } = opts;

    const now = this.ctx.currentTime;

    // Create binaural beat (left and right with frequency difference)
    const oscBinauralLeft = this.ctx.createOscillator();
    const oscBinauralRight = this.ctx.createOscillator();
    oscBinauralLeft.type = 'sine';
    oscBinauralRight.type = 'sine';

    const gainBinaural = this.ctx.createGain();
    gainBinaural.gain.value = 0;

    const mergerBinaural = this.ctx.createChannelMerger(2);

    const gainBinauralLeft = this.ctx.createGain();
    const gainBinauralRight = this.ctx.createGain();
    gainBinauralLeft.gain.value = 1;
    gainBinauralRight.gain.value = 1;

    oscBinauralLeft.connect(gainBinauralLeft);
    oscBinauralRight.connect(gainBinauralRight);
    gainBinauralLeft.connect(mergerBinaural, 0, 0);
    gainBinauralRight.connect(mergerBinaural, 0, 1);
    mergerBinaural.connect(gainBinaural);

    // Create monaural beat (both ears same, summed signal)
    const oscMonauralA = this.ctx.createOscillator();
    const oscMonauralB = this.ctx.createOscillator();
    oscMonauralA.type = 'sine';
    oscMonauralB.type = 'sine';

    const gainMonaural = this.ctx.createGain();
    gainMonaural.gain.value = 0;

    oscMonauralA.connect(gainMonaural);
    oscMonauralB.connect(gainMonaural);

    // Create isochronic pulse (amplitude modulated)
    const oscIsochronic = this.ctx.createOscillator();
    oscIsochronic.type = 'sine';

    const gainIsochronic = this.ctx.createGain();
    gainIsochronic.gain.value = 0;

    const pulseOsc = this.ctx.createOscillator();
    pulseOsc.type = 'square';
    pulseOsc.frequency.value = isochronicRate;

    const pulseGain = this.ctx.createGain();
    pulseGain.gain.value = 0.5; // Modulation depth

    pulseOsc.connect(pulseGain);
    pulseGain.connect(gainIsochronic.gain);

    oscIsochronic.connect(gainIsochronic);

    // Create master mixer
    const masterMixer = this.ctx.createGain();
    masterMixer.gain.value = 0;

    gainBinaural.connect(masterMixer);
    gainMonaural.connect(masterMixer);
    gainIsochronic.connect(masterMixer);
    masterMixer.connect(this.masterGain);

    // Fade in
    masterMixer.gain.setValueAtTime(0, now);
    masterMixer.gain.linearRampToValueAtTime(1, now + fadeIn);

    // Start all oscillators
    oscBinauralLeft.start(now);
    oscBinauralRight.start(now);
    oscMonauralA.start(now);
    oscMonauralB.start(now);
    oscIsochronic.start(now);
    pulseOsc.start(now);

    const nodeId = `martigliMix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Update frequencies based on Martigli controller value
    const updateFrequencies = () => {
      if (!this.nodes.has(nodeId)) {
        clearInterval(intervalId);
        return;
      }

      const node = this.nodes.get(nodeId);
      if (!node) {
        clearInterval(intervalId);
        return;
      }

      // Get current Martigli value [-1, 1]
      let martigliValue = 0;
      if (typeof window !== 'undefined' && window.martigliController && window.martigliController.active) {
        martigliValue = window.martigliController.getValue();
      }

      // Calculate modulated carrier frequency
      const modulatedFreq = node._baseFrequency + (node._amplitude * martigliValue);
      const clampedFreq = clamp(modulatedFreq, 20, 20000);

      const now = this.ctx.currentTime;
      const halfBeat = node._beatFrequency / 2;

      // Update binaural frequencies (L and R offset by beat)
      node.oscBinauralLeft.frequency.setTargetAtTime(clampedFreq - halfBeat, now, 0.02);
      node.oscBinauralRight.frequency.setTargetAtTime(clampedFreq + halfBeat, now, 0.02);

      // Update monaural frequencies (both same, creates beat when summed)
      node.oscMonauralA.frequency.setTargetAtTime(clampedFreq - halfBeat, now, 0.02);
      node.oscMonauralB.frequency.setTargetAtTime(clampedFreq + halfBeat, now, 0.02);

      // Update isochronic frequency
      node.oscIsochronic.frequency.setTargetAtTime(clampedFreq, now, 0.02);

      // Update gains
      node.gainBinaural.gain.setTargetAtTime(node._binauralGain, now, 0.02);
      node.gainMonaural.gain.setTargetAtTime(node._monauralGain, now, 0.02);
      node.gainIsochronic.gain.setTargetAtTime(node._isochronicGain, now, 0.02);

      // Update isochronic pulse rate
      node.pulseOsc.frequency.setTargetAtTime(node._isochronicRate, now, 0.02);
    };

    // Store node with all components and start update interval
    const intervalId = setInterval(updateFrequencies, 50); // Update every 50ms

    this.nodes.set(nodeId, {
      oscBinauralLeft,
      oscBinauralRight,
      oscMonauralA,
      oscMonauralB,
      oscIsochronic,
      pulseOsc,
      gainBinaural,
      gainMonaural,
      gainIsochronic,
      masterMixer,
      _baseFrequency: baseFrequency,
      _amplitude: amplitude,
      _beatFrequency: beatFrequency,
      _isochronicRate: isochronicRate,
      _binauralGain: binauralGain,
      _monauralGain: monauralGain,
      _isochronicGain: isochronicGain,
      _martigliInterval: intervalId,
    });

    return nodeId;
  }

  /**
   * Update Martigli-Mix parameters
   * @param {string} nodeId
   * @param {Object} params - { baseFrequency, amplitude, beatFrequency, isochronicRate, binauralGain, monauralGain, isochronicGain }
   * @returns {boolean} success
   */
  updateMartigliMix(nodeId, params = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    if (params.baseFrequency !== undefined) {
      node._baseFrequency = clamp(params.baseFrequency, 20, 20000);
    }

    if (params.amplitude !== undefined) {
      node._amplitude = clamp(params.amplitude, 0, 1000);
    }

    if (params.beatFrequency !== undefined) {
      node._beatFrequency = clamp(params.beatFrequency, 0.5, 100);
    }

    if (params.isochronicRate !== undefined) {
      node._isochronicRate = clamp(params.isochronicRate, 0.5, 50);
    }

    if (params.binauralGain !== undefined) {
      node._binauralGain = clamp(params.binauralGain, 0, 1);
    }

    if (params.monauralGain !== undefined) {
      node._monauralGain = clamp(params.monauralGain, 0, 1);
    }

    if (params.isochronicGain !== undefined) {
      node._isochronicGain = clamp(params.isochronicGain, 0, 1);
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
