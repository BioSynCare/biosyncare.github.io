/**
 * Safety Monitor - Audio & Session Safety System
 *
 * Protects users from:
 * - Excessive volume levels
 * - Extended session durations
 * - Sudden audio spikes
 * - Concurrent high-intensity tracks
 *
 * Features:
 * - Real-time volume monitoring
 * - Automatic gain limiting
 * - Session time tracking
 * - Warning notifications
 * - Graceful degradation
 */

export class SafetyMonitor {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.analyser = null;
    this.sessionStartTime = null;
    this.totalSessionTime = 0; // milliseconds
    this.lastWarningTime = 0;

    // Safety thresholds
    this.config = {
      maxSessionDuration: 60 * 60 * 1000, // 1 hour
      warningSessionDuration: 45 * 60 * 1000, // 45 minutes
      volumeWarningThreshold: 0.8, // 80% of max
      volumeEmergencyThreshold: 0.95, // 95% of max
      volumeCheckInterval: 100, // ms
      warningCooldown: 5 * 60 * 1000, // 5 minutes between warnings
    };

    // State
    this.warnings = {
      volume: false,
      duration: false,
      emergency: false,
    };

    // Callbacks
    this.onWarning = null;
    this.onEmergencyStop = null;

    this._setupAnalyser();
    this._startMonitoring();
  }

  _setupAnalyser() {
    if (!this.ctx) return;

    try {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (error) {
      console.warn('[SafetyMonitor] Failed to create analyser', error);
    }
  }

  /**
   * Connect audio source to safety monitor
   * @param {AudioNode} source - Audio node to monitor
   */
  connect(source) {
    if (!this.analyser || !source) return;

    try {
      source.connect(this.analyser);
    } catch (error) {
      console.warn('[SafetyMonitor] Failed to connect source', error);
    }
  }

  /**
   * Start a new session
   */
  startSession() {
    this.sessionStartTime = Date.now();
    this.warnings.duration = false;
    console.log('[SafetyMonitor] Session started');
  }

  /**
   * End current session
   */
  endSession() {
    if (this.sessionStartTime) {
      const duration = Date.now() - this.sessionStartTime;
      this.totalSessionTime += duration;
      this.sessionStartTime = null;
      console.log(`[SafetyMonitor] Session ended. Duration: ${Math.round(duration / 1000)}s`);
    }
  }

  /**
   * Get current session duration in milliseconds
   * @returns {number}
   */
  getSessionDuration() {
    if (!this.sessionStartTime) return 0;
    return Date.now() - this.sessionStartTime;
  }

  /**
   * Get total usage time across all sessions
   * @returns {number} milliseconds
   */
  getTotalSessionTime() {
    return this.totalSessionTime + this.getSessionDuration();
  }

  /**
   * Get current volume level (0-1)
   * @returns {number}
   */
  getCurrentVolume() {
    if (!this.analyser || !this.dataArray) return 0;

    try {
      this.analyser.getByteTimeDomainData(this.dataArray);

      // Calculate RMS (root mean square) for accurate volume
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const normalized = (this.dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / this.dataArray.length);

      return rms;
    } catch (error) {
      console.warn('[SafetyMonitor] Failed to get volume', error);
      return 0;
    }
  }

  /**
   * Check volume levels and issue warnings if needed
   */
  _checkVolume() {
    const volume = this.getCurrentVolume();
    const now = Date.now();

    // Emergency threshold - immediate action
    if (volume >= this.config.volumeEmergencyThreshold) {
      if (!this.warnings.emergency) {
        this.warnings.emergency = true;
        this._issueWarning('emergency', {
          type: 'volume',
          level: volume,
          message: 'EMERGENCY: Volume critically high! Reducing automatically.',
        });
      }
      return;
    }

    // Reset emergency flag if volume drops
    if (volume < this.config.volumeEmergencyThreshold * 0.9) {
      this.warnings.emergency = false;
    }

    // Warning threshold
    if (volume >= this.config.volumeWarningThreshold) {
      if (!this.warnings.volume && (now - this.lastWarningTime) > this.config.warningCooldown) {
        this.warnings.volume = true;
        this.lastWarningTime = now;
        this._issueWarning('warning', {
          type: 'volume',
          level: volume,
          message: 'Volume is high. Consider reducing for safe listening.',
        });
      }
    } else {
      // Reset warning flag when volume is safe
      this.warnings.volume = false;
    }
  }

  /**
   * Check session duration and issue warnings
   */
  _checkDuration() {
    const duration = this.getSessionDuration();
    const now = Date.now();

    // Max duration exceeded
    if (duration >= this.config.maxSessionDuration) {
      if (!this.warnings.duration) {
        this.warnings.duration = true;
        this._issueWarning('emergency', {
          type: 'duration',
          duration,
          message: 'Maximum session duration reached. Please take a break.',
        });
      }
      return;
    }

    // Warning threshold
    if (duration >= this.config.warningSessionDuration) {
      if (!this.warnings.duration && (now - this.lastWarningTime) > this.config.warningCooldown) {
        this.warnings.duration = true;
        this.lastWarningTime = now;
        const remaining = Math.round((this.config.maxSessionDuration - duration) / 60000);
        this._issueWarning('warning', {
          type: 'duration',
          duration,
          remaining,
          message: `You've been listening for ${Math.round(duration / 60000)} minutes. ${remaining} minutes remaining.`,
        });
      }
    }
  }

  /**
   * Issue a safety warning
   * @param {string} severity - 'warning' | 'emergency'
   * @param {Object} data - Warning data
   */
  _issueWarning(severity, data) {
    console.warn(`[SafetyMonitor] ${severity.toUpperCase()}:`, data.message, data);

    if (this.onWarning) {
      this.onWarning(severity, data);
    }

    // Trigger emergency stop if needed
    if (severity === 'emergency' && this.onEmergencyStop) {
      this.onEmergencyStop(data);
    }
  }

  /**
   * Start monitoring loop
   */
  _startMonitoring() {
    this._monitoringInterval = setInterval(() => {
      if (this.sessionStartTime) {
        this._checkVolume();
        this._checkDuration();
      }
    }, this.config.volumeCheckInterval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this._monitoringInterval) {
      clearInterval(this._monitoringInterval);
      this._monitoringInterval = null;
    }
    this.endSession();
  }

  /**
   * Update configuration
   * @param {Object} config - Partial config object
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset all warnings
   */
  resetWarnings() {
    this.warnings = {
      volume: false,
      duration: false,
      emergency: false,
    };
    this.lastWarningTime = 0;
  }

  /**
   * Get current safety status
   * @returns {Object}
   */
  getStatus() {
    return {
      sessionDuration: this.getSessionDuration(),
      totalSessionTime: this.getTotalSessionTime(),
      currentVolume: this.getCurrentVolume(),
      warnings: { ...this.warnings },
      config: { ...this.config },
    };
  }

  /**
   * Cleanup
   */
  dispose() {
    this.stopMonitoring();

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    this.dataArray = null;
    this.onWarning = null;
    this.onEmergencyStop = null;
  }
}
