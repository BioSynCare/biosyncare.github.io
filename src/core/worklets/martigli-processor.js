/**
 * Martigli Breathing Signal Processor - AudioWorklet
 *
 * Generates sample-accurate breathing oscillation with modulation support.
 *
 * Message Protocol:
 * ==================
 *
 * Incoming Messages (main thread -> worklet):
 * -------------------------------------------
 *
 * 1. Configure breathing parameters:
 *    { type: 'configure', data: { waveform, inhaleRatio, trajectory } }
 *    - waveform: 'sine' | 'triangle' | 'sawtooth' | 'square'
 *    - inhaleRatio: number (0-1), ratio of inhale vs exhale
 *    - trajectory: Array<{ period: number, duration: number }>
 *
 * 2. Reset phase:
 *    { type: 'reset' }
 *
 * 3. Stop signal:
 *    { type: 'stop' }
 *
 * 4. Register modulation target:
 *    { type: 'registerModulation', data: { nodeId, parameters } }
 *    - nodeId: string - unique identifier for the audio node
 *    - parameters: Array<{ param, base, depth, min, max }>
 *      - param: string - parameter name (e.g., 'base', 'beat', 'freq', 'gain')
 *      - base: number - base value of parameter
 *      - depth: number - modulation depth (value = base + depth * martigliValue)
 *      - min: number - minimum allowed value
 *      - max: number - maximum allowed value
 *
 * 5. Unregister modulation target:
 *    { type: 'unregisterModulation', data: { nodeId } }
 *
 * 6. Update modulation parameters:
 *    { type: 'updateModulation', data: { nodeId, parameters } }
 *
 * Outgoing Messages (worklet -> main thread):
 * --------------------------------------------
 *
 * State updates (sent every ~16ms):
 *    { type: 'state', value, phase, elapsedSamples, period, sampleRate, modulations }
 *    - value: number [-1, 1] - current breathing value
 *    - phase: number [0, 1] - position in breathing cycle
 *    - elapsedSamples: number - total samples processed
 *    - period: number - current breathing period in seconds
 *    - sampleRate: number - audio context sample rate
 *    - modulations: Object<nodeId, Object<param, modulatedValue>>
 *      Example: { 'binaural-123': { base: 305.2, beat: 8.1, gain: 0.42 } }
 */
class MartigliProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.waveform = 'sine';
    this.inhaleRatio = 0.5;
    this.trajectory = [
      { period: 10, duration: 0 },
      { period: 20, duration: 600 },
    ];
    this._rebuildTrajectory();

    this.phase = 0;
    this.elapsedSamples = 0;
    this.lastSnapshotSamples = 0;
    this.snapshotInterval = Math.max(128, Math.floor(sampleRate / 60)); // ~16ms

    // Modulation targets registry
    // Map<nodeId, { type, base, depth, min, max }>
    this.modulationTargets = new Map();

    this.port.onmessage = (event) => {
      const { type, data } = event.data || {};
      if (type === 'configure' && data) {
        if (Array.isArray(data.trajectory)) {
          this.trajectory = data.trajectory.slice();
          this._rebuildTrajectory();
        }
        if (typeof data.waveform === 'string') {
          this.waveform = data.waveform;
        }
        if (typeof data.inhaleRatio === 'number' && data.inhaleRatio > 0 && data.inhaleRatio < 1) {
          this.inhaleRatio = data.inhaleRatio;
        }
      } else if (type === 'reset') {
        this.phase = 0;
        this.elapsedSamples = 0;
        this.lastSnapshotSamples = 0;
      } else if (type === 'stop') {
        this.phase = 0;
        this.elapsedSamples = 0;
        this.lastSnapshotSamples = 0;
      } else if (type === 'registerModulation' && data) {
        // Register a modulation target
        // data: { nodeId, parameters: [{ param, base, depth, min, max }] }
        if (data.nodeId && Array.isArray(data.parameters)) {
          this.modulationTargets.set(data.nodeId, {
            parameters: data.parameters.map((p) => ({
              param: p.param,
              base: Number(p.base) || 0,
              depth: Number(p.depth) || 0,
              min: Number(p.min) ?? -Infinity,
              max: Number(p.max) ?? Infinity,
            })),
          });
        }
      } else if (type === 'unregisterModulation' && data) {
        // Unregister a modulation target
        if (data.nodeId) {
          this.modulationTargets.delete(data.nodeId);
        }
      } else if (type === 'updateModulation' && data) {
        // Update modulation parameters for existing target
        if (data.nodeId && Array.isArray(data.parameters)) {
          const existing = this.modulationTargets.get(data.nodeId);
          if (existing) {
            existing.parameters = data.parameters.map((p) => ({
              param: p.param,
              base: Number(p.base) || 0,
              depth: Number(p.depth) || 0,
              min: Number(p.min) ?? -Infinity,
              max: Number(p.max) ?? Infinity,
            }));
          }
        }
      }
    };
  }

  _rebuildTrajectory() {
    const clean = Array.isArray(this.trajectory) && this.trajectory.length
      ? this.trajectory.slice()
      : [{ period: 10, duration: 0 }];
    this.trajectory = clean.map((point) => ({
      period: Number(point.period) > 0 ? Number(point.period) : 10,
      duration: Number(point.duration) >= 0 ? Number(point.duration) : 0,
    }));

    this._segments = [];
    let accumulated = 0;
    for (let i = 0; i < this.trajectory.length - 1; i += 1) {
      const current = this.trajectory[i];
      const next = this.trajectory[i + 1];
      this._segments.push({
        start: accumulated,
        duration: Math.max(0, next.duration),
        from: current.period,
        to: next.period,
      });
      accumulated += next.duration;
    }
    const last = this.trajectory[this.trajectory.length - 1];
    this._finalPeriod = last ? last.period : 10;
  }

  _getPeriod(elapsedSec) {
    if (!this._segments || !this._segments.length) {
      return this._finalPeriod || 10;
    }
    let accumulated = 0;
    for (let i = 0; i < this._segments.length; i += 1) {
      const segment = this._segments[i];
      const segmentEnd = accumulated + segment.duration;
      if (segment.duration <= 0) {
        accumulated = segmentEnd;
        continue;
      }
      if (elapsedSec <= segmentEnd) {
        const progress = (elapsedSec - accumulated) / segment.duration;
        return segment.from + (segment.to - segment.from) * Math.min(Math.max(progress, 0), 1);
      }
      accumulated = segmentEnd;
    }
    return this._finalPeriod || 10;
  }

  _applyWaveform(phase) {
    const inhaleRatio = Math.min(Math.max(this.inhaleRatio, 0.05), 0.95);
    const waveform = this.waveform || 'sine';
    if (phase < inhaleRatio) {
      const inhaleProgress = phase / inhaleRatio;
      switch (waveform) {
        case 'triangle':
        case 'sawtooth':
          return 2 * inhaleProgress - 1;
        case 'square':
          return inhaleProgress < 0.5 ? -1 : 1;
        case 'sine':
        default:
          return Math.sin(inhaleProgress * Math.PI - Math.PI / 2);
      }
    }
    const exhaleProgress = (phase - inhaleRatio) / (1 - inhaleRatio);
    switch (waveform) {
      case 'triangle':
      case 'sawtooth':
        return 1 - 2 * exhaleProgress;
      case 'square':
        return exhaleProgress < 0.5 ? 1 : -1;
      case 'sine':
      default:
        return Math.sin((1 - exhaleProgress) * Math.PI - Math.PI / 2);
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) {
      this.elapsedSamples += 128;
      return true;
    }
    const channel = output[0];
    if (!channel) {
      this.elapsedSamples += 128;
      return true;
    }

    for (let i = 0; i < channel.length; i += 1) {
      const elapsedSec = this.elapsedSamples / sampleRate;
      const period = Math.max(0.01, this._getPeriod(elapsedSec));
      const increment = 1 / (period * sampleRate);
      this.phase += increment;
      if (this.phase >= 1) {
        this.phase -= 1;
      }
      const value = this._applyWaveform(this.phase);
      channel[i] = value;
      this.elapsedSamples += 1;

      if (this.elapsedSamples - this.lastSnapshotSamples >= this.snapshotInterval) {
        this.lastSnapshotSamples = this.elapsedSamples;

        // Compute modulation values for all registered targets
        const modulations = {};
        if (this.modulationTargets.size > 0) {
          this.modulationTargets.forEach((target, nodeId) => {
            const paramValues = {};
            target.parameters.forEach((param) => {
              // modulated = base + (depth * value)
              let modulated = param.base + (param.depth * value);
              // Clamp to min/max
              if (Number.isFinite(param.min)) {
                modulated = Math.max(param.min, modulated);
              }
              if (Number.isFinite(param.max)) {
                modulated = Math.min(param.max, modulated);
              }
              paramValues[param.param] = modulated;
            });
            modulations[nodeId] = paramValues;
          });
        }

        this.port.postMessage({
          type: 'state',
          value,
          phase: this.phase,
          elapsedSamples: this.elapsedSamples,
          period,
          sampleRate,
          modulations, // Include modulated values
        });
      }
    }

    return true;
  }
}

registerProcessor('martigli-processor', MartigliProcessor);
