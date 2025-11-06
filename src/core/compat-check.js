/**
 * Browser Compatibility Checker
 *
 * Detects and reports browser capability for:
 * - Web Audio API
 * - AudioWorklet
 * - Service Workers (PWA)
 * - LocalStorage
 * - IndexedDB
 * -Modern JavaScript features
 *
 * Provides graceful degradation and user-friendly error messages.
 */

export class CompatibilityChecker {
  constructor() {
    this.features = {};
    this.warnings = [];
    this.errors = [];
  }

  /**
   * Run all compatibility checks
   * @returns {Object} { supported, features, warnings, errors, recommendations }
   */
  check() {
    this.features = {};
    this.warnings = [];
    this.errors = [];

    // Core features
    this._checkWebAudio();
    this._checkAudioWorklet();
    this._checkServiceWorker();
    this._checkStorage();
    this._checkModernJS();
    this._checkBrowserInfo();

    const supported = this.errors.length === 0;
    const recommendations = this._generateRecommendations();

    return {
      supported,
      features: this.features,
      warnings: this.warnings,
      errors: this.errors,
      recommendations,
    };
  }

  _checkWebAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      this.features.webAudio = false;
      this.errors.push({
        feature: 'Web Audio API',
        message: 'Your browser does not support Web Audio API. This application requires Web Audio to function.',
        severity: 'critical',
      });
      return;
    }

    this.features.webAudio = true;

    // Check for webkit prefix (older browsers)
    if (window.webkitAudioContext && !window.AudioContext) {
      this.warnings.push({
        feature: 'Web Audio API',
        message: 'Using webkit-prefixed Audio Context. Some features may not work as expected.',
        severity: 'medium',
      });
    }
  }

  _checkAudioWorklet() {
    if (!this.features.webAudio) {
      this.features.audioWorklet = false;
      return;
    }

    // Create temporary context to check for audioWorklet
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioContext();
      const hasWorklet = typeof tempCtx.audioWorklet !== 'undefined';
      tempCtx.close();

      this.features.audioWorklet = hasWorklet;

      if (!hasWorklet) {
        this.warnings.push({
          feature: 'AudioWorklet',
          message: 'AudioWorklet not supported. Sample-accurate modulation will use fallback mode.',
          severity: 'low',
          fallback: 'Main-thread modulation with 50ms polling',
        });
      }
    } catch (err) {
      this.features.audioWorklet = false;
      this.warnings.push({
        feature: 'AudioWorklet',
        message: `AudioWorklet check failed: ${err.message}`,
        severity: 'low',
      });
    }
  }

  _checkServiceWorker() {
    this.features.serviceWorker = 'serviceWorker' in navigator;

    if (!this.features.serviceWorker) {
      this.warnings.push({
        feature: 'Service Worker',
        message: 'Service Workers not supported. Offline functionality will be unavailable.',
        severity: 'low',
      });
    }
  }

  _checkStorage() {
    // LocalStorage
    try {
      const testKey = '__biosyncare_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      this.features.localStorage = true;
    } catch (err) {
      console.log('[CompatCheck] LocalStorage unavailable:', err.message);
      this.features.localStorage = false;
      this.warnings.push({
        feature: 'LocalStorage',
        message: 'LocalStorage not available. Settings will not persist across sessions.',
        severity: 'medium',
      });
    }

    // IndexedDB
    this.features.indexedDB = typeof indexedDB !== 'undefined';

    if (!this.features.indexedDB) {
      this.warnings.push({
        feature: 'IndexedDB',
        message: 'IndexedDB not available. Advanced offline features unavailable.',
        severity: 'low',
      });
    }
  }

  _checkModernJS() {
    const checks = {
      esModules: typeof Symbol !== 'undefined',
      asyncAwait: (async () => {})().constructor.name === 'AsyncFunction',
      promises: typeof Promise !== 'undefined',
      arrow: (() => true)(),
      classes: typeof class {} === 'function',
      templateLiterals: (() => { try { eval('`test`'); return true; } catch (e) { console.log(e); return false; } })(),
    };

    this.features.modernJS = checks;

    const unsupported = Object.entries(checks)
      .filter(([, supported]) => !supported)
      .map(([feature]) => feature);

    if (unsupported.length > 0) {
      this.errors.push({
        feature: 'Modern JavaScript',
        message: `Missing JavaScript features: ${unsupported.join(', ')}. Please upgrade your browser.`,
        severity: 'critical',
      });
    }
  }

  _checkBrowserInfo() {
    const ua = navigator.userAgent;

    // Detect browser
    let browser = 'Unknown';
    let version = '';

    if (ua.includes('Firefox/')) {
      browser = 'Firefox';
      version = ua.match(/Firefox\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Edg/')) {
      browser = 'Edge';
      version = ua.match(/Edg\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
      browser = 'Chrome';
      version = ua.match(/Chrome\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
      browser = 'Safari';
      version = ua.match(/Version\/(\d+)/)?.[1] || '';
    }

    this.features.browser = {
      name: browser,
      version,
      mobile: /Mobile|Android|iPhone/i.test(ua),
      platform: navigator.platform,
    };

    // Check for minimum versions
    const minVersions = {
      Chrome: 66,  // AudioWorklet support
      Firefox: 76,
      Safari: 14.1,
      Edge: 79,
    };

    const minVersion = minVersions[browser];
    const currentVersion = parseInt(version, 10);

    if (minVersion && currentVersion && currentVersion < minVersion) {
      this.warnings.push({
        feature: 'Browser Version',
        message: `${browser} ${version} detected. Recommended minimum: ${browser} ${minVersion}. Some features may not work optimally.`,
        severity: 'medium',
      });
    }
  }

  _generateRecommendations() {
    const recommendations = [];

    if (!this.features.webAudio) {
      recommendations.push({
        priority: 'critical',
        message: 'Please use a modern browser such as Chrome, Firefox, Safari, or Edge.',
      });
    }

    if (!this.features.audioWorklet) {
      recommendations.push({
        priority: 'medium',
        message: 'Update your browser for optimal audio performance (sample-accurate modulation).',
      });
    }

    if (!this.features.localStorage) {
      recommendations.push({
        priority: 'low',
        message: 'Enable cookies/storage to save your preferences.',
      });
    }

    if (this.features.browser?.mobile) {
      recommendations.push({
        priority: 'info',
        message: 'For best experience on mobile, use headphones and ensure battery saver mode is off.',
      });
    }

    return recommendations;
  }

  /**
   * Get a human-readable summary
   * @returns {string}
   */
  getSummary() {
    const result = this.check();

    if (result.errors.length > 0) {
      return `Compatibility Issues: ${result.errors.map((e) => e.message).join('; ')}`;
    }

    if (result.warnings.length > 0) {
      return `Compatible with warnings: ${result.warnings.length} feature(s) degraded`;
    }

    return 'Fully compatible';
  }

  /**
   * Check if a specific feature is supported
   * @param {string} featureName
   * @returns {boolean}
   */
  supports(featureName) {
    if (!Object.keys(this.features).length) {
      this.check();
    }
    return Boolean(this.features[featureName]);
  }
}

// Singleton instance
export const compatChecker = new CompatibilityChecker();
