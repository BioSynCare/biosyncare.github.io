/**
 * BioSynCare Lab - Audio Engine
 *
 * Web Audio API wrapper for neurosensory protocols
 * Pure client-side, low latency, no dependencies
 *
 * Features:
 * - Binaural beats (L/R frequency difference)
 * - Monaural beats (single ear modulation)
 * - Isochronic tones (rhythmic pulses)
 * - Safe gain limiting
 * - Smooth fade in/out
 *
 * Usage:
 *   import { AudioEngine } from './src/core/audio-engine.js';
 *   const engine = new AudioEngine();
 *   await engine.init();
 *   engine.playBinaural({ base: 300, beat: 8, duration: 60 });
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

  _ensureInit() {
    if (!this.initialized) {
      throw new Error('AudioEngine not initialized. Call engine.init() first.');
    }
  }
}

// Singleton instance (optional)
export const audioEngine = new AudioEngine();
