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
        this.port.postMessage({
          type: 'state',
          value,
          phase: this.phase,
          elapsedSamples: this.elapsedSamples,
          period,
          sampleRate,
        });
      }
    }

    return true;
  }
}

registerProcessor('martigli-processor', MartigliProcessor);
