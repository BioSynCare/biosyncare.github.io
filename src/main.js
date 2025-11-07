import {
  ensureAnonymousUser,
  onAuthChanged,
  signInWithGoogle,
  signInWithGitHub,
  signInWithEmail,
  registerWithEmail,
  signOutUser,
  getCurrentUser,
  isAnonymousUser,
  fetchUserSettings,
  saveUserSettings,
  writeUsageEvent,
  fetchUserEvents,
  fetchPublicEvents,
  getDefaultPrivacySettings,
} from './utils/firebase.js';
import { detectStorageMode } from './services/storage-mode.js';
import {
  createAudioEngine,
  getAudioEngineOptions,
  getVisualEngineOptions,
  getHapticEngineOptions,
  getEngineSelection,
  setEngineSelection,
  describeEngines,
} from './services/engine-registry.js';
import {
  initDiagnostics,
  setSelectedEngines,
  gatherDiagnostics,
  getBrowserInfo,
  getOSInfo,
  getSystemInfo,
  getAudioInfo,
  getBatteryInfo,
  detectEngines,
  getRefreshRate,
  getPerformanceMetrics,
  getActiveTracksInfo,
  assessSystemHealth,
} from './ui/diagnostics.js';
import {
  authState,
  setCurrentUser,
  setAuthUnsubscribe,
  clearAuthState,
} from './state/auth-state.js';
import {
  activityState,
  getPendingUserEventsRefresh,
  getPendingPublicEventsRefresh,
  setMyEvents,
  setPublicEvents,
  setActiveTab,
  setFetchingUser,
  setFetchingPublic,
  setLastFetchedUserId,
  setLastPublicFetch,
  setPendingUserEventsRefresh,
  setPendingPublicEventsRefresh,
} from './state/activity-state.js';
import {
  sessionId,
  usageStats,
  incrementAudioInits,
  incrementAudioAdds,
  incrementVisualAdds,
  incrementTrackStops,
  addNeuroTime,
  recordAudioDuration,
  recordVisualDuration,
  getUsageStatsSnapshot,
  generateId,
} from './state/usage-state.js';
import {
  addAudioTrack,
  removeAudioTrack,
  getAudioTrack,
  updateAudioTrack,
  clearAudioTracks,
  addVisualTrack,
  removeVisualTrack,
  getVisualTrack,
  clearVisualTracks,
  getAllAudioTracks,
  getAllVisualTracks,
} from './state/track-state.js';
import {
  loadPresetCatalog,
  reloadPresetCatalog,
  listAudioPresets,
  listSessionPresets,
  clonePresetDefaults,
  cloneSessionPreset,
} from './presets/catalog.js';
import { parsePresetUrlConfig } from './presets/url.js';
import {
  saveAudioPresetSnapshot,
  snapshotCurrentSessionPreset,
} from './presets/firebase-adapter.js';

// Maintain backward compatibility with legacy helpers
const generateTrackId = (prefix) => generateId(prefix);

// Audio engine instance
let audioEngine = null;
let audioEngineInitPromise = null;

// User settings
const userSettings = getDefaultPrivacySettings();
const SETTINGS_STORAGE_BASE_KEY = 'biosyncare_user_settings';

// Extended range settings - separate from privacy settings
const extendedRangeSettings = {
  allowExtendedBeatFreq: false,
  allowExtendedCarrierFreq: false,
  allowExtendedLRFreq: false,
  allowExtendedPanFreq: false,
  allowExtendedCrossfade: false,
};
const EXTENDED_RANGE_STORAGE_KEY = 'biosyncare_extended_ranges';

const initialSearchParams =
  typeof window !== 'undefined' && window.location ? window.location.search : '';
const urlPresetConfig = parsePresetUrlConfig(initialSearchParams);

await loadPresetCatalog();

// Detect storage mode (Firebase vs LocalStorage) early and expose indicator
let storageMode = { mode: 'local', detail: 'LocalStorage (default)' };
try {
  storageMode = await detectStorageMode();
} catch {}
if (typeof window !== 'undefined') {
  window.__BSCLAB_STORAGE_MODE__ = storageMode;
  // Attempt DOM injection if element already present
  const inject = () => {
    const el = document.getElementById('storage-mode-indicator');
    if (el) {
      el.textContent = storageMode.mode === 'firebase'
        ? 'Firebase (shared)'
        : 'LocalStorage (device)';
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
}

const sharedAudioDefaults = (() => {
  const map = new Map();
  try {
    listAudioPresets().forEach((preset) => {
      map.set(preset.id, { ...(preset.defaults || {}) });
    });
  } catch (error) {
    console.warn('[Presets] Unable to load shared audio defaults', error);
  }
  return map;
})();

const sessionTimers = new Set();

const presetDebug = (...args) => {
  if (typeof window === 'undefined' || window.__PRESETS_DEBUG === false) {
    return;
  }
  console.info('[Presets]', ...args);
};

const presetLibraryState = {
  audio: [],
  sessions: [],
  filter: '',
  activeTab: 'audio',
};
let presetFilterArmed = false;

// Martigli/Breathing Controller - Global shared breathing oscillation
const martigliController = {
  DEBUG: false,
  active: false,
  startTime: null,
  endTime: null,
  _startPerfTime: null,
  _perfOffsetMs: null,
  _phase: 0,
  _lastPhaseTimestampMs: null,
  _workletPort: null,
  _workletState: null,
  waveform: 'sine', // 'sine', 'triangle', 'sawtooth', 'square'
  inhaleRatio: 0.5, // 0.5 = equal inhale/exhale
  trajectory: [
    { period: 10, duration: 0 }, // Start at 10s breathing period
    { period: 20, duration: 600 }, // Transition to 20s over 600 seconds
  ],

  _hasPerformance() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function';
  },

  _ensureTimeBase() {
    if (this._perfOffsetMs === null && this._hasPerformance()) {
      this._perfOffsetMs = Date.now() - performance.now();
    }
  },

  _toMonotonicMs(timeValue) {
    const hasPerf = this._hasPerformance();
    if (timeValue === undefined) {
      return hasPerf ? performance.now() : Date.now();
    }
    if (typeof timeValue !== 'number' || Number.isNaN(timeValue)) {
      return hasPerf ? performance.now() : Date.now();
    }
    if (timeValue < 1e12) {
      // Likely performance-based timestamp
      return timeValue;
    }
    if (hasPerf && this._perfOffsetMs !== null) {
      return timeValue - this._perfOffsetMs;
    }
    return timeValue;
  },

  _toWallClockMs(timeValue) {
    if (typeof timeValue === 'number') {
      if (timeValue > 1e12) {
        return timeValue;
      }
      if (this._perfOffsetMs !== null) {
        return timeValue + this._perfOffsetMs;
      }
    }
    return Date.now();
  },

  getElapsedMilliseconds(timeValue) {
    if (this._workletState?.elapsedSamples && this._workletState?.sampleRate) {
      return (this._workletState.elapsedSamples / this._workletState.sampleRate) * 1000;
    }
    if (!this.active || (!this.startTime && this._startPerfTime === null)) {
      return 0;
    }

    const hasPerf = this._hasPerformance();

    if (timeValue === undefined) {
      if (hasPerf && this._startPerfTime !== null) {
        return performance.now() - this._startPerfTime;
      }
      if (this.startTime) {
        return Date.now() - this.startTime;
      }
      return 0;
    }

    if (typeof timeValue === 'number') {
      if (timeValue > 1e12) {
        if (this.startTime) {
          return timeValue - this.startTime;
        }
        return 0;
      }
      if (hasPerf && this._startPerfTime !== null) {
        return timeValue - this._startPerfTime;
      }
      if (this.startTime) {
        return timeValue - this.startTime;
      }
    }

    return 0;
  },

  getElapsedSeconds(timeValue) {
    return this.getElapsedMilliseconds(timeValue) / 1000;
  },

  _updatePhase(timeReference) {
    if (this._workletState && typeof this._workletState.phase === 'number') {
      this._phase = this._workletState.phase;
      this._lastPhaseTimestampMs = this._toMonotonicMs(timeReference);
      return this._phase;
    }
    if (!this.active) {
      return this._phase;
    }

    const nowMonotonic = this._toMonotonicMs(timeReference);
    if (this._lastPhaseTimestampMs === null) {
      this._lastPhaseTimestampMs = nowMonotonic;
      return this._phase;
    }

    let deltaMs = nowMonotonic - this._lastPhaseTimestampMs;
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      deltaMs = 0;
    }

    const deltaSec = deltaMs / 1000;
    const elapsedSec = this.getElapsedSeconds(timeReference);
    const period = Math.max(0.01, this.getCurrentPeriod(elapsedSec));
    const phaseIncrement = deltaSec / period;

    this._phase = (this._phase + phaseIncrement) % 1;
    this._lastPhaseTimestampMs = nowMonotonic;
    return this._phase;
  },

  getPhase() {
    if (this._workletState && typeof this._workletState.phase === 'number') {
      return this._workletState.phase;
    }
    return this._phase;
  },

  // Calculate current breathing period based on trajectory
  getCurrentPeriod(elapsedTime) {
    if (this._workletState && typeof this._workletState.period === 'number') {
      return this._workletState.period;
    }
    if (!this.trajectory || this.trajectory.length === 0) {
      return 10; // Default period
    }

    let accumulatedTime = 0;
    let currentPeriod = this.trajectory[0].period;

    for (let i = 0; i < this.trajectory.length - 1; i++) {
      const current = this.trajectory[i];
      const next = this.trajectory[i + 1];
      const transitionEnd = accumulatedTime + next.duration;

      if (elapsedTime <= transitionEnd) {
        // We're in this transition
        if (next.duration === 0) {
          return next.period;
        }
        const progress = (elapsedTime - accumulatedTime) / next.duration;
        return current.period + (next.period - current.period) * progress;
      }

      accumulatedTime = transitionEnd;
      currentPeriod = next.period;
    }

    // Past all transitions, use final period
    return this.trajectory[this.trajectory.length - 1].period;
  },

  // Get oscillation value [-1, 1] where -1 = full exhale, 1 = full inhale
  getValue(currentTime = Date.now()) {
    if (this._workletState && typeof this._workletState.value === 'number') {
      return this._workletState.value;
    }
    if (!this.active || !this.startTime) {
      return 0;
    }

    this._ensureTimeBase();

    let timeReference = currentTime;
    const hasPerf = this._hasPerformance();
    if (currentTime === undefined && hasPerf) {
      timeReference = performance.now();
    }

    const elapsedMs = this.getElapsedMilliseconds(timeReference);
    const elapsedSec = elapsedMs / 1000;

    // Check if we've reached end time
    const wallClockMs = this._toWallClockMs(timeReference);
    if (this.endTime && wallClockMs >= this.endTime) {
      this.stop();
      return 0;
    }

    if (elapsedSec < 0) {
      return 0;
    }

    const cyclePosition = this._updatePhase(timeReference);
    // Apply waveform to the full cycle position
    return this.applyWaveform(cyclePosition);
  },

  // Apply selected waveform to cycle position
  applyWaveform(cyclePosition) {
    // cyclePosition goes from 0 to 1 over the full breathing cycle
    // We need to split this into inhale and exhale phases based on inhaleRatio
    // Output: -1 (full exhale) to +1 (full inhale)

    let value;

    if (cyclePosition < this.inhaleRatio) {
      // Inhale phase: go from -1 to +1
      const inhaleProgress = cyclePosition / this.inhaleRatio; // 0 to 1

      switch (this.waveform) {
        case 'sine':
          // Map 0→1 to -1→1 using half sine wave
          value = Math.sin(inhaleProgress * Math.PI - Math.PI / 2);
          break;
        case 'triangle':
          value = 2 * inhaleProgress - 1;
          break;
        case 'sawtooth':
          value = 2 * inhaleProgress - 1;
          break;
        case 'square':
          value = inhaleProgress < 0.5 ? -1 : 1;
          break;
        default:
          value = Math.sin(inhaleProgress * Math.PI - Math.PI / 2);
      }
    } else {
      // Exhale phase: go from +1 to -1
      const exhaleProgress = (cyclePosition - this.inhaleRatio) / (1 - this.inhaleRatio); // 0 to 1

      switch (this.waveform) {
        case 'sine':
          // Map 0→1 to +1→-1 using half sine wave (reversed)
          value = Math.sin((1 - exhaleProgress) * Math.PI - Math.PI / 2);
          break;
        case 'triangle':
          value = 1 - 2 * exhaleProgress;
          break;
        case 'sawtooth':
          value = 1 - 2 * exhaleProgress;
          break;
        case 'square':
          value = exhaleProgress < 0.5 ? 1 : -1;
          break;
        default:
          value = Math.sin((1 - exhaleProgress) * Math.PI - Math.PI / 2);
      }
    }

    return value;
  },

  // Start breathing pattern
  start(durationMs = null) {
    // Only restart if not already active
    if (!this.active) {
      this._ensureTimeBase();
      this.active = true;
      this.startTime = Date.now();
      if (this._hasPerformance()) {
        this._startPerfTime = performance.now();
      } else {
        this._startPerfTime = null;
      }
      this.endTime = durationMs ? this.startTime + durationMs : null;
      this._phase = 0;
      this._lastPhaseTimestampMs = this._hasPerformance() ? this._startPerfTime : this.startTime;
      this._syncWorkletConfig({ reset: true });
    } else {
      // When already active we still refresh time base to avoid drift
      if (this._hasPerformance()) {
        this._startPerfTime = performance.now();
      }
      this.startTime = Date.now();
      this.endTime = durationMs ? this.startTime + durationMs : this.endTime;
      this._syncWorkletConfig({ reset: true });
    }
  },

  // Stop breathing pattern
  stop() {
    this.active = false;
    this.startTime = null;
    this.endTime = null;
    this._startPerfTime = null;
    this._phase = 0;
    this._lastPhaseTimestampMs = null;
    if (this._workletPort) {
      this._workletPort.postMessage({ type: 'stop' });
    }
    this._workletState = null;
  },

  // Reset to default configuration
  reset() {
    this.stop();
    this.waveform = 'sine';
    this.inhaleRatio = 0.5;
    this.trajectory = [
      { period: 10, duration: 0 },
      { period: 20, duration: 600 },
    ];
    this._syncWorkletConfig({ reset: true });
  },

  attachWorkletPort(port) {
    if (!port || this._workletPort === port) {
      if (port) {
        this._syncWorkletConfig({ reset: true });
      }
      return;
    }
    this._workletPort = port;
    this._workletPort.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'state') {
        this.updateFromWorkletState(data);
      }
    };
    this._syncWorkletConfig({ reset: true });
  },

  detachWorkletPort() {
    if (this._workletPort) {
      this._workletPort.postMessage({ type: 'stop' });
    }
    this._workletPort = null;
    this._workletState = null;
  },

  updateFromWorkletState(state = {}) {
    const defaultSampleRate =
      typeof sampleRate !== 'undefined' ? sampleRate : 48000;
    const sampleRateFromState =
      typeof state.sampleRate === 'number' && state.sampleRate > 0
        ? state.sampleRate
        : this._workletState?.sampleRate ?? defaultSampleRate;
    this._workletState = {
      value:
        typeof state.value === 'number'
          ? state.value
          : this._workletState?.value ?? 0,
      phase:
        typeof state.phase === 'number'
          ? state.phase % 1
          : this._workletState?.phase ?? 0,
      elapsedSamples:
        typeof state.elapsedSamples === 'number'
          ? state.elapsedSamples
          : this._workletState?.elapsedSamples ?? 0,
      period:
        typeof state.period === 'number'
          ? state.period
          : this._workletState?.period ?? this.trajectory[0]?.period ?? 10,
      sampleRate: sampleRateFromState,
      timestamp: Date.now(),
    };
    this._phase = this._workletState.phase;
    this._lastPhaseTimestampMs = this._toMonotonicMs();
  },

  _syncWorkletConfig({ reset } = {}) {
    if (!this._workletPort) return;
    this._workletPort.postMessage({
      type: 'configure',
      data: {
        waveform: this.waveform,
        inhaleRatio: this.inhaleRatio,
        trajectory: this.trajectory,
      },
    });
    if (reset) {
      this._workletPort.postMessage({ type: 'reset' });
    }
  },

  notifyConfigChanged({ reset = false } = {}) {
    this._syncWorkletConfig({ reset });
  },
};

const MARTIGLI_STORAGE_KEY = 'biosyncare_martigli_config';

// Expose martigliController globally for audio engine access
if (typeof window !== 'undefined') {
  window.martigliController = martigliController;
}

let martigliLastValueLogTime = 0;
let martigliLastRenderLogTime = 0;

// --- Identity UI ---
const authStatusEl = document.getElementById('auth-status');
const authIdentityEl = document.getElementById('auth-identity');
const authAnonymousBadge = document.getElementById('auth-anonymous-badge');
const authLoginSection = document.getElementById('auth-login-section');
const authFeedbackEl = document.getElementById('auth-feedback');
const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');

const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLoginGitHub = document.getElementById('btn-login-github');
const btnEmailLogin = document.getElementById('btn-email-login');
const btnEmailRegister = document.getElementById('btn-email-register');
const btnSignout = document.getElementById('btn-signout');

const statAudioInitsEl = document.getElementById('stat-audio-inits');
const statAudioAddsEl = document.getElementById('stat-audio-adds');
const statVisualAddsEl = document.getElementById('stat-visual-adds');
const statTrackStopsEl = document.getElementById('stat-track-stops');
const statSessionTimeEl = document.getElementById('stat-session-time');
const statNeuroTimeEl = document.getElementById('stat-neuro-time');
const statFirstSignInEl = document.getElementById('stat-first-signin');
const statLastSignInEl = document.getElementById('stat-last-signin');
const statAudioDurationList = document.getElementById('stat-audio-duration-list');
const statVisualDurationList = document.getElementById('stat-visual-duration-list');
const profileSummaryEl = document.getElementById('stat-profile');
const workspaceStimulation = document.getElementById('workspace-stimulation');
const workspaceIdentity = document.getElementById('workspace-identity');
const chipStimulation = document.getElementById('chip-stimulation');
const chipStimulationSummaryEl = document.getElementById('chip-stimulation-summary');
const chipStimulationTooltipEl = document.getElementById('chip-stimulation-tooltip');
const chipIdentity = document.getElementById('chip-identity');
const chipIdentitySummaryEl = document.getElementById('chip-identity-summary');
const chipIdentityTooltipEl = document.getElementById('chip-identity-tooltip');
const WORKSPACES = {
  STIMULATION: 'stimulation',
  IDENTITY: 'identity',
};
let activeWorkspace = WORKSPACES.STIMULATION;
const usageScopeTabsEl = document.getElementById('usage-scope-tabs');
const usageScopeDescriptionEl = document.getElementById('usage-scope-description');
const usageScopeButtons = usageScopeTabsEl
  ? Array.from(usageScopeTabsEl.querySelectorAll('[data-usage-scope]'))
  : [];
const VALID_USAGE_SCOPES = new Set(['session', 'user', 'global']);
const USAGE_SCOPE_DESCRIPTIONS = {
  session: 'Showing metrics collected in the current neurosensory session only.',
  user: 'Showing lifetime activity for this BioSynCare Lab identity.',
  global:
    'Showing community-wide activity across all public sessions (never less than your own totals).',
};
let activeUsageScope = 'user';
let communityTotalsCache = { eventsRef: null, totals: null };
const CHIP_MAX_TRACKS_LISTED = 4;

const setActiveWorkspace = (target) => {
  if (!workspaceStimulation || !workspaceIdentity || !chipStimulation || !chipIdentity)
    return;
  const next =
    target === WORKSPACES.IDENTITY ? WORKSPACES.IDENTITY : WORKSPACES.STIMULATION;
  if (activeWorkspace === next) return;
  activeWorkspace = next;
  const showStimulation = activeWorkspace === WORKSPACES.STIMULATION;
  workspaceStimulation.classList.toggle('hidden', !showStimulation);
  workspaceIdentity.classList.toggle('hidden', showStimulation);
  chipStimulation.classList.toggle('header-chip-active', showStimulation);
  chipIdentity.classList.toggle('header-chip-active', !showStimulation);
  chipStimulation.setAttribute('aria-pressed', showStimulation ? 'true' : 'false');
  chipIdentity.setAttribute('aria-pressed', !showStimulation ? 'true' : 'false');
};

const summarizeLabels = (labels, prefix) => {
  if (!labels.length) return '';
  const limited = labels.slice(0, CHIP_MAX_TRACKS_LISTED);
  const remaining = labels.length - limited.length;
  const items = limited.map((label) => `<li>${prefix} ${label}</li>`).join('');
  const overflow = remaining > 0 ? `<li>… ${remaining} more</li>` : '';
  return items + overflow;
};

const updateStimulationHeaderSummary = () => {
  if (!chipStimulationSummaryEl || !chipStimulationTooltipEl) return;
  const audioEntries = getAllAudioTracks();
  const visualEntries = getAllVisualTracks();
  const audioCount = audioEntries.length;
  const visualCount = visualEntries.length;
  const totalActive = audioCount + visualCount;
  let summaryText = 'Idle';
  if (totalActive > 0) {
    summaryText = `${audioCount} audio • ${visualCount} visual`;
  } else if (audioEngine || audioEngineInitPromise) {
    summaryText = 'Engine ready';
  }
  chipStimulationSummaryEl.textContent = summaryText;

  const audioLabels = audioEntries.map(([, track]) => {
    const preset = track?.presetKey ? audioPresets[track.presetKey] : null;
    const params = track?.parameters || {};
    const descriptor = preset?.describe ? preset.describe(params) : '';
    const baseLabel = track?.label || preset?.label || track?.presetKey || 'Audio layer';
    return descriptor ? `${baseLabel} (${descriptor})` : baseLabel;
  });
  const visualLabels = visualEntries.map(
    ([, track]) => track?.label || track?.presetKey || 'Visual layer'
  );
  const now = Date.now();
  const sessionTimeMs = Math.max(0, now - usageStats.sessionStart);
  const sessionDuration = formatDuration(sessionTimeMs);
  const loggedNeuro = formatDuration(Math.max(0, usageStats.totalNeuroMs));
  let tooltipContent = '<h4>Active Tracks</h4>';
  if (totalActive === 0) {
    tooltipContent += '<p>No tracks running. Start audio or visual cues to begin.</p>';
  } else {
    tooltipContent += '<ul>';
    tooltipContent += summarizeLabels(audioLabels, '🎧');
    tooltipContent += summarizeLabels(visualLabels, '🌈');
    tooltipContent += '</ul>';
  }
  tooltipContent += `<p><strong>Session time:</strong> ${sessionDuration}</p>`;
  tooltipContent += `<p><strong>Logged neuro time:</strong> ${loggedNeuro}</p>`;
  chipStimulationTooltipEl.innerHTML = tooltipContent;
};

const describeUserDisplayName = (user) => {
  if (!user) return 'Guest';
  return user.displayName || user.email || `User ${user.uid.slice(-6)}`;
};

const updateIdentityHeaderSummary = () => {
  if (!chipIdentitySummaryEl || !chipIdentityTooltipEl) return;
  const user = authState.currentUser;
  const isSignedIn = Boolean(user) && !isAnonymousUser(user);
  const isAnon = Boolean(user) && isAnonymousUser(user);
  const myEvents = activityState.myEvents || [];
  const sessionCount = myEvents.filter(
    (event) => event?.eventType === 'session_stop'
  ).length;
  const activityEntries = myEvents.length;

  let summaryText = 'Guest session';
  let tooltipContent =
    '<h4>Account</h4><p>Not signed in. Sign in to sync your activity.</p>';

  if (isAnon) {
    summaryText = 'Anonymous session';
    tooltipContent =
      '<h4>Anonymous session</h4><p>Data remains local unless you choose to sign in.</p>';
  } else if (isSignedIn) {
    const displayName = describeUserDisplayName(user);
    const sessionsLabel =
      sessionCount > 0
        ? `${sessionCount} session${sessionCount === 1 ? '' : 's'}`
        : activityEntries > 0
          ? `${activityEntries} log${activityEntries === 1 ? '' : 's'}`
          : 'No sessions yet';
    summaryText = `${displayName} • ${sessionsLabel}`;

    const creation = user?.metadata?.creationTime
      ? formatDateTime(user.metadata.creationTime)
      : '—';
    const lastSignIn = user?.metadata?.lastSignInTime
      ? formatDateTime(user.metadata.lastSignInTime)
      : '—';
    tooltipContent = `<h4>${displayName}</h4>`;
    if (user.email) {
      tooltipContent += `<p><strong>Email:</strong> ${user.email}</p>`;
    }
    tooltipContent += `<p><strong>Sessions logged:</strong> ${sessionCount}</p>`;
    tooltipContent += `<p><strong>Activity entries:</strong> ${activityEntries}</p>`;
    tooltipContent += `<p><strong>First sign-in:</strong> ${creation}</p>`;
    tooltipContent += `<p><strong>Last sign-in:</strong> ${lastSignIn}</p>`;
    tooltipContent += `<p><strong>Data collection:</strong> ${
      userSettings.collectData ? 'Enabled' : 'Disabled'
    }</p>`;
  }

  chipIdentitySummaryEl.textContent = summaryText;
  chipIdentityTooltipEl.innerHTML = tooltipContent;
};

const updateHeaderSummaries = () => {
  updateStimulationHeaderSummary();
  updateIdentityHeaderSummary();
};
const collectDataToggle = document.getElementById('toggle-collect-data');
const shareAnonymizedToggle = document.getElementById('toggle-share-anonymized');
const includeCommunityToggle = document.getElementById('toggle-include-community');
const toggleCollectWrapper = document.getElementById('toggle-collect-wrapper');
const toggleShareWrapper = document.getElementById('toggle-share-wrapper');
const toggleCommunityWrapper = document.getElementById('toggle-community-wrapper');
const extendedBeatFreqToggle = document.getElementById('toggle-extended-beat-freq');
const extendedCarrierFreqToggle = document.getElementById('toggle-extended-carrier-freq');
const extendedLRFreqToggle = document.getElementById('toggle-extended-lr-freq');
const extendedPanFreqToggle = document.getElementById('toggle-extended-pan-freq');
const extendedCrossfadeToggle = document.getElementById('toggle-extended-crossfade');
const martigliStartBtn = document.getElementById('btn-martigli-start');
const martigliStopBtn = document.getElementById('btn-martigli-stop');
const martigliWaveformSelect = document.getElementById('martigli-waveform');
const martigliInhaleRatioInput = document.getElementById('martigli-inhale-ratio');
const martigliInhaleRatioValue = document.getElementById('martigli-inhale-ratio-value');
const martigliTrajectoryList = document.getElementById('martigli-trajectory-list');
const btnAddTrajectoryPoint = document.getElementById('btn-add-trajectory-point');
const martigliStatusText = document.getElementById('martigli-status-text');
const martigliIndicator = document.getElementById('martigli-indicator');
const martigliCurrentValues = document.getElementById('martigli-current-values');
const martigliCurrentPeriod = document.getElementById('martigli-current-period');
const martigliCurrentPhase = document.getElementById('martigli-current-phase');
const martigliCurrentValue = document.getElementById('martigli-current-value');
const martigliInitialPeriod = document.getElementById('martigli-initial-period');
const martigliFinalPeriod = document.getElementById('martigli-final-period');
const martigliWaveDisplay = document.getElementById('martigli-wave-display');
const martigliVisualization = document.getElementById('martigli-visualization');
const myActivityTab = document.getElementById('tab-my-activity');
const publicActivityTab = document.getElementById('tab-public-activity');
const refreshActivityBtn = document.getElementById('btn-refresh-activity');
const activityMyPanel = document.getElementById('activity-my-panel');
const activityPublicPanel = document.getElementById('activity-public-panel');
const myActivityList = document.getElementById('activity-my-list');
const publicActivityList = document.getElementById('activity-public-list');
const activityPublicNote = document.getElementById('activity-public-note');
const audioEngineSelect = document.getElementById('engine-audio-select');
const visualEngineSelect = document.getElementById('engine-visual-select');
const hapticEngineSelect = document.getElementById('engine-haptics-select');
const audioEngineStatusEl = document.getElementById('engine-audio-status');
const visualEngineStatusEl = document.getElementById('engine-visual-status');
const hapticEngineStatusEl = document.getElementById('engine-haptics-status');

const audioEngineOptions = getAudioEngineOptions();
const visualEngineOptions = getVisualEngineOptions();
const hapticEngineOptions = getHapticEngineOptions();

const authButtons = [
  btnLoginGoogle,
  btnLoginGitHub,
  btnEmailLogin,
  btnEmailRegister,
  btnSignout,
].filter(Boolean);

const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return date.toLocaleString();
};

const updateDurationList = (element, summaryMap, emptyMessage) => {
  if (!element) return;
  element.innerHTML = '';

  const entries = Array.from(summaryMap.entries()).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = emptyMessage;
    element.appendChild(li);
    return;
  }

  entries.forEach(([label, duration]) => {
    const li = document.createElement('li');
    const spanLabel = document.createElement('span');
    spanLabel.textContent = label;
    const spanValue = document.createElement('span');
    spanValue.textContent = formatDuration(duration);
    li.appendChild(spanLabel);
    li.appendChild(spanValue);
    element.appendChild(li);
  });
};

const loadUserProfile = () => {
  try {
    const raw = localStorage.getItem('biosyncare_user_profile');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[Profile] Failed to parse stored profile', error);
    return null;
  }
};

const titleize = (input) => {
  if (!input) return '';
  return input
    .toString()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
};

const formatProfileSummary = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return 'No self-reported profile yet.';
  }

  const entries = Object.entries(profile).filter(
    ([, value]) =>
      value !== undefined && value !== null && String(value).trim().length > 0
  );

  if (entries.length === 0) {
    return 'No self-reported profile yet.';
  }

  return entries
    .map(
      ([key, value]) =>
        `${titleize(key)}: ${Array.isArray(value) ? value.join(', ') : value}`
    )
    .join(' • ');
};

const updateProfileSummary = () => {
  if (!profileSummaryEl) return;
  const profile = loadUserProfile();
  profileSummaryEl.textContent = formatProfileSummary(profile);
};

const loadSettingsFromLocal = (uid) => {
  const candidates = uid
    ? [`${SETTINGS_STORAGE_BASE_KEY}_${uid}`, SETTINGS_STORAGE_BASE_KEY]
    : [SETTINGS_STORAGE_BASE_KEY];

  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      console.warn('[Settings] Failed to parse stored settings', error);
    }
  }
  return null;
};

const saveSettingsToLocal = (uid, settings) => {
  try {
    const payload = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_STORAGE_BASE_KEY, payload);
    if (uid) {
      localStorage.setItem(`${SETTINGS_STORAGE_BASE_KEY}_${uid}`, payload);
    }
  } catch (error) {
    console.warn('[Settings] Failed to persist settings locally', error);
  }
};

const loadExtendedRangeSettings = () => {
  try {
    const raw = localStorage.getItem(EXTENDED_RANGE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.assign(extendedRangeSettings, parsed);
    }
  } catch (error) {
    console.warn('[Settings] Failed to parse extended range settings', error);
  }
};

const saveExtendedRangeSettings = () => {
  try {
    const payload = JSON.stringify(extendedRangeSettings);
    localStorage.setItem(EXTENDED_RANGE_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('[Settings] Failed to save extended range settings', error);
  }
};

const loadMartigliConfig = () => {
  try {
    const raw = localStorage.getItem(MARTIGLI_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.waveform) martigliController.waveform = parsed.waveform;
      if (typeof parsed.inhaleRatio === 'number') {
        martigliController.inhaleRatio = parsed.inhaleRatio;
      }
      if (Array.isArray(parsed.trajectory) && parsed.trajectory.length > 0) {
        martigliController.trajectory = parsed.trajectory;
      }
      martigliController.notifyConfigChanged({ reset: true });
    }
  } catch (error) {
    console.warn('[Martigli] Failed to load config', error);
  }
};

const saveMartigliConfig = () => {
  try {
    const payload = JSON.stringify({
      waveform: martigliController.waveform,
      inhaleRatio: martigliController.inhaleRatio,
      trajectory: martigliController.trajectory,
    });
    localStorage.setItem(MARTIGLI_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('[Martigli] Failed to save config', error);
  }
};

// Render the trajectory list
const renderMartigliTrajectory = () => {
  if (!martigliTrajectoryList) return;

  martigliTrajectoryList.innerHTML = '';

  martigliController.trajectory.forEach((point, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-center gap-2 p-2 bg-white border border-gray-200 rounded';

    const content = document.createElement('div');
    content.className = 'flex-1 grid grid-cols-2 gap-2 text-sm';

    const periodLabel = document.createElement('div');
    periodLabel.innerHTML = `<span class="text-gray-600">Period:</span> <input type="number" min="0.1" max="300" step="0.1" value="${point.period}" class="w-20 px-2 py-1 border rounded text-sm" data-index="${index}" data-field="period">s`;

    const durationLabel = document.createElement('div');
    if (index === 0) {
      durationLabel.innerHTML = `<span class="text-gray-600">Initial</span>`;
    } else {
      durationLabel.innerHTML = `<span class="text-gray-600">Transition:</span> <input type="number" min="0" max="3600" step="1" value="${point.duration}" class="w-20 px-2 py-1 border rounded text-sm" data-index="${index}" data-field="duration">s`;
    }

    content.appendChild(periodLabel);
    content.appendChild(durationLabel);
    item.appendChild(content);

    if (martigliController.trajectory.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'text-red-600 hover:text-red-800 font-bold text-lg px-2';
      removeBtn.type = 'button';
      removeBtn.onclick = () => {
        if (index === 0 && martigliController.trajectory.length > 1) {
          // Don't remove first point if there are others
          return;
        }
        martigliController.trajectory.splice(index, 1);
        if (martigliController.trajectory.length === 0) {
          martigliController.trajectory.push({ period: 10, duration: 0 });
        }
        saveMartigliConfig();
        martigliController.notifyConfigChanged();
        renderMartigliTrajectory();
      };
      item.appendChild(removeBtn);
    }

    martigliTrajectoryList.appendChild(item);
  });

  // Add event listeners to inputs
  const inputs = martigliTrajectoryList.querySelectorAll('input');
  inputs.forEach((input) => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;
      const value = parseFloat(e.target.value);

      if (Number.isFinite(value) && value >= 0) {
        martigliController.trajectory[index][field] = value;
        saveMartigliConfig();
        martigliController.notifyConfigChanged();
      }
    });
  });
};

// Update Martigli UI state
const updateMartigliUI = () => {
  if (!martigliStartBtn || !martigliStopBtn) return;

  // Update waveform select
  if (martigliWaveformSelect) {
    martigliWaveformSelect.value = martigliController.waveform;
  }

  // Update inhale ratio
  if (martigliInhaleRatioInput) {
    martigliInhaleRatioInput.value = martigliController.inhaleRatio;
  }
  if (martigliInhaleRatioValue) {
    martigliInhaleRatioValue.textContent = `${Math.round(martigliController.inhaleRatio * 100)}%`;
  }

  if (martigliController.active) {
    martigliStartBtn.disabled = true;
    martigliStopBtn.disabled = false;
    if (martigliStatusText) martigliStatusText.textContent = 'Active';
    if (martigliIndicator) {
      martigliIndicator.classList.remove('bg-gray-400');
      martigliIndicator.classList.add('bg-green-500', 'animate-pulse');
    }
    if (martigliCurrentValues) martigliCurrentValues.classList.remove('hidden');
  } else {
    martigliStartBtn.disabled = false;
    martigliStopBtn.disabled = true;
    if (martigliStatusText) martigliStatusText.textContent = 'Inactive';
    if (martigliIndicator) {
      martigliIndicator.classList.remove('bg-green-500', 'animate-pulse');
      martigliIndicator.classList.add('bg-gray-400');
    }
    if (martigliCurrentValues) martigliCurrentValues.classList.add('hidden');
  }
};

// Update real-time Martigli values display
const updateMartigliValues = () => {
  if (!martigliController.active || !martigliCurrentPeriod) return;

  const now = Date.now();
  const elapsedSec = martigliController.getElapsedSeconds(now);
  const period = martigliController.getCurrentPeriod(elapsedSec);
  const value = martigliController.getValue(now);
  const cyclePosition = martigliController.getPhase();

  martigliCurrentPeriod.textContent = period.toFixed(1);
  martigliCurrentValue.textContent = value.toFixed(3);

  if (cyclePosition < martigliController.inhaleRatio) {
    martigliCurrentPhase.textContent = 'Inhale';
  } else {
    martigliCurrentPhase.textContent = 'Exhale';
  }

  if (martigliController.DEBUG) {
    const logNow = Date.now();
    if (!martigliLastValueLogTime || logNow - martigliLastValueLogTime >= 250) {
      console.log(
        '[Martigli][Values]',
        `elapsed=${elapsedSec.toFixed(2)}s`,
        `period=${period.toFixed(2)}s`,
        `value=${value.toFixed(3)}`,
        `cycle=${cyclePosition.toFixed(3)}`
      );
      martigliLastValueLogTime = logNow;
    }
  }

  // Update initial/final period displays
  if (martigliInitialPeriod && martigliController.trajectory.length > 0) {
    martigliInitialPeriod.textContent = `${martigliController.trajectory[0].period.toFixed(1)}s`;
  }
  if (martigliFinalPeriod && martigliController.trajectory.length > 0) {
    const lastPoint = martigliController.trajectory[martigliController.trajectory.length - 1];
    martigliFinalPeriod.textContent = `${lastPoint.period.toFixed(1)}s`;
  }
  if (martigliWaveDisplay) {
    martigliWaveDisplay.textContent = martigliController.waveform.substring(0, 4).toUpperCase();
  }
};

// Render Martigli oscillation visualization on canvas
const renderMartigliVisualization = () => {
  if (!martigliVisualization) return;

  const canvas = martigliVisualization;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw background grid
  ctx.strokeStyle = '#e0f2f1';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw center line
  ctx.strokeStyle = '#b2dfdb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  // Draw waveform
  const points = 200;
  ctx.strokeStyle = '#00897b';
  ctx.lineWidth = 3;
  ctx.beginPath();

  for (let i = 0; i <= points; i++) {
    const cyclePosition = i / points; // 0 to 1 over full cycle
    const x = cyclePosition * width;

    // Get waveform value using the cycle position
    const yValue = martigliController.applyWaveform(cyclePosition);

    const y = centerY - yValue * (height * 0.4);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Draw current position indicator if active
  if (martigliController.active) {
    const now = Date.now();
    const elapsedSec = martigliController.getElapsedSeconds(now);
    const period = martigliController.getCurrentPeriod(elapsedSec);
    const cycleProgress = martigliController.getPhase();
    const currentX = cycleProgress * width;
    const currentValue = martigliController.getValue(now);
    const currentY = centerY - currentValue * (height * 0.4);

    // Draw vertical line at current position
    ctx.strokeStyle = '#d81b60';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw current point
    ctx.fillStyle = '#d81b60';
    ctx.beginPath();
    ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw inhale/exhale boundary
    const boundaryX = martigliController.inhaleRatio * width;
    ctx.strokeStyle = '#9e9e9e';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(boundaryX, 0);
    ctx.lineTo(boundaryX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = '#546e7a';
    ctx.font = '10px sans-serif';
    ctx.fillText('Inhale', 10, 15);
    ctx.fillText('Exhale', boundaryX + 10, 15);
    if (martigliController.DEBUG) {
      const logNow = Date.now();
      if (!martigliLastRenderLogTime || logNow - martigliLastRenderLogTime >= 250) {
        console.log(
          '[Martigli][Render]',
          `elapsed=${elapsedSec.toFixed(2)}s`,
          `period=${period.toFixed(2)}s`,
          `cycle=${cycleProgress.toFixed(3)}`,
          `value=${currentValue.toFixed(3)}`
        );
        martigliLastRenderLogTime = logNow;
      }
    }
  }
};

// Helper to get params from preset (handles both function and array forms)
const getPresetParams = (preset) => {
  if (!preset) return [];
  const params = preset.params;
  return typeof params === 'function' ? params() : params || [];
};

// Helper function to create Martigli modulation depth parameter
// Returns a single slider that starts at 0 (no modulation)
// When depth = 0, modulation is off. When depth > 0, parameter follows breathing
const createMartigliDepthParam = (paramId, paramLabel, depthMax, unit = '') => {
  const step = depthMax > 100 ? 1 : (depthMax > 10 ? 0.1 : 0.01);
  return {
    id: `martigliDepth_${paramId}`,
    label: `🫁 ${paramLabel} breathing depth`,
    type: 'range',
    min: 0,
    max: depthMax,
    step,
    unit,
    default: 0,
    live: true,
    formatValue: (value) => {
      if (value === 0) return 'Off';
      return `±${value.toFixed(step >= 1 ? 0 : (step >= 0.1 ? 1 : 2))}${unit}`;
    },
  };
};

// Helper functions to get parameter ranges based on extended settings
const getBeatFreqRange = () => ({
  min: 0.5,
  max: extendedRangeSettings.allowExtendedBeatFreq ? 200 : 40,
});

const getCarrierFreqRange = () => ({
  min: extendedRangeSettings.allowExtendedCarrierFreq ? 20 : 60,
  max: extendedRangeSettings.allowExtendedCarrierFreq ? 4000 : 1200,
});

const getLRFreqRange = () => ({
  min: extendedRangeSettings.allowExtendedLRFreq ? 20 : 60,
  max: extendedRangeSettings.allowExtendedLRFreq ? 8000 : 2000,
});

const getPanFreqRange = () => ({
  min: extendedRangeSettings.allowExtendedPanFreq ? 0.001 : 0.01,
  max: extendedRangeSettings.allowExtendedPanFreq ? 20 : 5,
});

const getCrossfadeHoldRange = () => ({
  min: 1,
  max: extendedRangeSettings.allowExtendedCrossfade ? 3600 : 300,
});

const getCrossfadeDurationRange = () => ({
  min: 0.5,
  max: extendedRangeSettings.allowExtendedCrossfade ? 600 : 60,
});

// Function to update range inputs in active track controls when extended settings change
const updateActiveTrackRanges = () => {
  // Find all range inputs in the track controls and update their min/max attributes
  const trackControls = document.querySelectorAll('.track-parameter-controls');
  trackControls.forEach((control) => {
    const rangeInputs = control.querySelectorAll('input[type="range"]');
    rangeInputs.forEach((input) => {
      const paramId = input.dataset.paramId;
      if (!paramId) return;

      let range = null;
      if (paramId === 'beat') {
        range = getBeatFreqRange();
      } else if (paramId === 'base') {
        range = getCarrierFreqRange();
      } else if (paramId === 'leftFrequency' || paramId === 'rightFrequency') {
        range = getLRFreqRange();
      } else if (paramId === 'panFrequency') {
        range = getPanFreqRange();
      } else if (paramId === 'crossfadeHold') {
        range = getCrossfadeHoldRange();
      } else if (paramId === 'crossfadeDuration') {
        range = getCrossfadeDurationRange();
      }

      if (range) {
        input.min = range.min;
        input.max = range.max;
        // Clamp current value if it's outside new range
        const currentValue = parseFloat(input.value);
        if (currentValue < range.min) {
          input.value = range.min;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (currentValue > range.max) {
          input.value = range.max;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  });
};

const applySettingsToUI = () => {
  if (collectDataToggle) {
    collectDataToggle.checked = Boolean(userSettings.collectData);
  }
  if (shareAnonymizedToggle) {
    shareAnonymizedToggle.checked =
      Boolean(userSettings.collectData) && Boolean(userSettings.shareAnonymized);
    shareAnonymizedToggle.disabled = !userSettings.collectData;
    toggleShareWrapper?.classList.toggle('disabled', !userSettings.collectData);
  }
  if (includeCommunityToggle) {
    includeCommunityToggle.checked =
      Boolean(userSettings.collectData) &&
      Boolean(userSettings.shareAnonymized) &&
      Boolean(userSettings.includeInCommunity);
    includeCommunityToggle.disabled =
      !userSettings.collectData || !userSettings.shareAnonymized;
    toggleCommunityWrapper?.classList.toggle('disabled', includeCommunityToggle.disabled);
  }
  toggleCollectWrapper?.classList.toggle('disabled', false);

  // Apply extended range settings to UI
  if (extendedBeatFreqToggle) {
    extendedBeatFreqToggle.checked = Boolean(extendedRangeSettings.allowExtendedBeatFreq);
  }
  if (extendedCarrierFreqToggle) {
    extendedCarrierFreqToggle.checked = Boolean(extendedRangeSettings.allowExtendedCarrierFreq);
  }
  if (extendedLRFreqToggle) {
    extendedLRFreqToggle.checked = Boolean(extendedRangeSettings.allowExtendedLRFreq);
  }
  if (extendedPanFreqToggle) {
    extendedPanFreqToggle.checked = Boolean(extendedRangeSettings.allowExtendedPanFreq);
  }
  if (extendedCrossfadeToggle) {
    extendedCrossfadeToggle.checked = Boolean(extendedRangeSettings.allowExtendedCrossfade);
  }

  updatePublicNote();
};

const updatePublicNote = () => {
  if (!activityPublicNote) return;
  if (!userSettings.collectData) {
    activityPublicNote.textContent =
      'Public feed displays community entries. Your activity is not collected.';
  } else if (!userSettings.shareAnonymized) {
    activityPublicNote.textContent =
      'Public feed shows community entries. Your logs are hidden from the public feed.';
  } else if (!userSettings.includeInCommunity) {
    activityPublicNote.textContent =
      'Public feed displays anonymized community entries. Your logs are shown but excluded from community statistics.';
  } else {
    activityPublicNote.textContent =
      'Public feed displays anonymized entries shared by you and the community.';
  }
};

const formatEngineOptionLabel = (option) =>
  option.available ? option.name : `${option.name} (load library)`;

const updateEngineStatus = (selection = getEngineSelection()) => {
  const snapshot = describeEngines(selection);
  if (audioEngineStatusEl) {
    audioEngineStatusEl.textContent = snapshot.audio.available
      ? snapshot.audio.description
      : `${snapshot.audio.description} — load required library`;
  }
  if (visualEngineStatusEl) {
    visualEngineStatusEl.textContent = snapshot.visual.available
      ? snapshot.visual.description
      : `${snapshot.visual.description} — load required library`;
  }
  if (hapticEngineStatusEl) {
    hapticEngineStatusEl.textContent = snapshot.haptics.available
      ? snapshot.haptics.description
      : `${snapshot.haptics.description} — not supported`;
  }
  setSelectedEngines(snapshot);
};

const populateEngineSelects = () => {
  const selection = getEngineSelection();
  if (audioEngineSelect) {
    audioEngineSelect.innerHTML = '';
    audioEngineOptions.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = formatEngineOptionLabel(option);
      opt.disabled = !option.available;
      audioEngineSelect.appendChild(opt);
    });
    audioEngineSelect.value = selection.audio;
  }

  if (visualEngineSelect) {
    visualEngineSelect.innerHTML = '';
    visualEngineOptions.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = formatEngineOptionLabel(option);
      opt.disabled = !option.available;
      visualEngineSelect.appendChild(opt);
    });
    visualEngineSelect.value = selection.visual;
  }

  if (hapticEngineSelect) {
    hapticEngineSelect.innerHTML = '';
    hapticEngineOptions.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = formatEngineOptionLabel(option);
      opt.disabled = !option.available;
      hapticEngineSelect.appendChild(opt);
    });
    hapticEngineSelect.value = selection.haptics;
  }

  updateEngineStatus(selection);
};

const cloneBaselineDurations = (source = {}) => new Map(Object.entries(source || {}));

const mergeDurationMaps = (baseObj, sessionMap, activeTracks) => {
  const merged = cloneBaselineDurations(baseObj);
  sessionMap.forEach((value, key) => {
    merged.set(key, (merged.get(key) || 0) + value);
  });
  const now = Date.now();
  activeTracks.forEach((track) => {
    if (!track || track.finalized) return;
    const key = track.label || track.presetKey || 'Unknown';
    const startedAt = track.startedAt || now;
    const delta = Math.max(0, now - startedAt);
    merged.set(key, (merged.get(key) || 0) + delta);
  });
  return merged;
};

const addToDurationStore = (store, label, value) => {
  if (!label || !Number.isFinite(value) || value <= 0) return;
  store[label] = (store[label] || 0) + value;
};

const computeTotalsFromEvents = (events = []) => {
  const totals = {
    audioInitializations: 0,
    audioTrackAdds: 0,
    visualAdds: 0,
    trackStops: 0,
    totalNeuroMs: 0,
    audioDurations: {},
    visualDurations: {},
  };

  events.forEach((event) => {
    if (!event) return;
    const payload = event.payload || {};
    switch (event.eventType) {
      case 'audio_init':
        totals.audioInitializations += payload.count || 1;
        break;
      case 'audio_add':
        totals.audioTrackAdds += payload.count || 1;
        break;
      case 'visual_add':
        totals.visualAdds += payload.count || 1;
        break;
      case 'track_stop': {
        totals.trackStops += 1;
        const duration = payload.durationMs || 0;
        totals.totalNeuroMs += duration;
        const label = payload.label || payload.presetKey || payload.category || 'Track';
        if (payload.kind === 'visual') {
          addToDurationStore(totals.visualDurations, label, duration);
        } else {
          addToDurationStore(totals.audioDurations, label, duration);
        }
        break;
      }
      default:
        break;
    }
  });

  return totals;
};

const invalidateCommunityTotals = () => {
  communityTotalsCache = { eventsRef: null, totals: null };
};

const getCommunityTotals = () => {
  const events = activityState.publicEvents || [];
  if (communityTotalsCache.eventsRef === events && communityTotalsCache.totals) {
    return communityTotalsCache.totals;
  }
  const totals = computeTotalsFromEvents(events);
  communityTotalsCache = { eventsRef: events, totals };
  return totals;
};

const updateUsageScopeDescription = () => {
  if (!usageScopeDescriptionEl) return;
  usageScopeDescriptionEl.textContent =
    USAGE_SCOPE_DESCRIPTIONS[activeUsageScope] ||
    'Showing lifetime activity for this BioSynCare Lab identity.';
};

const updateUsageScopeTabs = () => {
  usageScopeButtons.forEach((btn) => {
    const buttonScope = btn.dataset.usageScope;
    btn.classList.toggle('usage-scope-tab-active', buttonScope === activeUsageScope);
  });
};

const SETTINGS_SYNC_DEBOUNCE_MS = 1000;
let settingsSyncTimeout = null;
let settingsSyncInFlight = null;

const schedulePersistSettings = () => {
  if (settingsSyncTimeout) {
    clearTimeout(settingsSyncTimeout);
  }
  settingsSyncTimeout = setTimeout(() => {
    settingsSyncTimeout = null;
    persistUserSettings();
  }, SETTINGS_SYNC_DEBOUNCE_MS);
};

const persistUserSettings = async () => {
  const user = authState.currentUser;
  const uid = user?.uid;
  saveSettingsToLocal(uid, userSettings);
  if (!uid) return;
  const defaults = getDefaultPrivacySettings();
  const cleanSettings = {
    ...defaults,
    collectData: Boolean(userSettings.collectData),
    shareAnonymized: Boolean(userSettings.shareAnonymized),
    includeInCommunity: Boolean(userSettings.includeInCommunity),
    anonymizedLabel: userSettings.anonymizedLabel || null,
  };
  if (settingsSyncInFlight) {
    try {
      await settingsSyncInFlight;
    } catch (error) {
      // ignore
    }
  }
  settingsSyncInFlight = saveUserSettings(uid, cleanSettings);
  try {
    await settingsSyncInFlight;
  } catch (error) {
    console.error('[Settings] Failed to persist to Firestore:', error);
    showAuthFeedback('Failed to sync privacy settings.', 'error');
  } finally {
    settingsSyncInFlight = null;
  }
};

const AUTH_ERROR_MESSAGES = {
  'auth/invalid-email': 'Invalid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect password. Please double-check and try again.',
  'auth/email-already-in-use': 'This email is already in use. Try logging in instead.',
  'auth/weak-password': 'Password too weak. Use at least 6 characters in length.',
  'auth/popup-blocked': 'Popup was blocked by the browser. Allow popups and retry.',
  'auth/popup-closed-by-user': 'Popup closed before finishing authentication.',
  'auth/account-exists-with-different-credential':
    'This email is linked to a different provider. Sign in with that provider first.',
};

const AUTH_INFO_CODES = new Set(['auth/popup-closed-by-user']);

// authState is now imported from ./state/auth-state.js

const finalizeTrack = (track, type, endedAt = Date.now()) => {
  if (!track || track.finalized) return 0;

  const startedAt = track.startedAt || endedAt;
  const duration = Math.max(0, endedAt - startedAt);
  track.finalized = true;

  const label = track.label || track.presetKey || type;
  if (type === 'audio') {
    recordAudioDuration(label, duration);
  } else {
    recordVisualDuration(label, duration);
  }

  addNeuroTime(duration);
  incrementTrackStops();
  if (duration > 0) {
    recordUsageEvent('track_stop', {
      label,
      presetKey: track.presetKey || null,
      category: type,
      durationMs: duration,
      meta: track.meta || {},
      kind: type,
    });
  }

  return duration;
};

const getActiveTrackSnapshot = () => {
  const now = Date.now();
  const activeAudio = getAllAudioTracks().map(([, track]) => track);
  const activeVisual = getAllVisualTracks().map(([, track]) => track);

  const activeAudioMs = activeAudio.reduce((total, track) => {
    if (!track || track.finalized) return total;
    const startedAt = track.startedAt || now;
    return total + Math.max(0, now - startedAt);
  }, 0);

  const activeVisualMs = activeVisual.reduce((total, track) => {
    if (!track || track.finalized) return total;
    const startedAt = track.startedAt || now;
    return total + Math.max(0, now - startedAt);
  }, 0);

  return {
    now,
    activeAudio,
    activeVisual,
    activeAudioMs,
    activeVisualMs,
    sessionTimeMs: Math.max(0, now - usageStats.sessionStart),
  };
};

const getUsageTotalsForScope = (scope, snapshot) => {
  if (scope === 'session') {
    return {
      audioInitializations: usageStats.audioInitializations,
      audioTrackAdds: usageStats.audioTrackAdds,
      visualAdds: usageStats.visualAdds,
      trackStops: usageStats.trackStops,
      totalNeuroMs:
        usageStats.totalNeuroMs + snapshot.activeAudioMs + snapshot.activeVisualMs,
      sessionTimeMs: snapshot.sessionTimeMs,
      audioDurations: mergeDurationMaps(
        {},
        usageStats.audioDurations,
        snapshot.activeAudio
      ),
      visualDurations: mergeDurationMaps(
        {},
        usageStats.visualDurations,
        snapshot.activeVisual
      ),
    };
  }

  if (scope === 'global') {
    const communityTotals = getCommunityTotals();
    return {
      audioInitializations: communityTotals.audioInitializations || 0,
      audioTrackAdds: communityTotals.audioTrackAdds || 0,
      visualAdds: communityTotals.visualAdds || 0,
      trackStops: communityTotals.trackStops || 0,
      totalNeuroMs: communityTotals.totalNeuroMs || 0,
      sessionTimeMs: null,
      audioDurations: cloneBaselineDurations(communityTotals.audioDurations),
      visualDurations: cloneBaselineDurations(communityTotals.visualDurations),
    };
  }

  const baseline = usageStats.baseline || {};
  return {
    audioInitializations:
      (baseline.audioInitializations || 0) + usageStats.audioInitializations,
    audioTrackAdds: (baseline.audioTrackAdds || 0) + usageStats.audioTrackAdds,
    visualAdds: (baseline.visualAdds || 0) + usageStats.visualAdds,
    trackStops: (baseline.trackStops || 0) + usageStats.trackStops,
    totalNeuroMs:
      (baseline.totalNeuroMs || 0) +
      usageStats.totalNeuroMs +
      snapshot.activeAudioMs +
      snapshot.activeVisualMs,
    sessionTimeMs: snapshot.sessionTimeMs,
    audioDurations: mergeDurationMaps(
      baseline.audioDurations || {},
      usageStats.audioDurations,
      snapshot.activeAudio
    ),
    visualDurations: mergeDurationMaps(
      baseline.visualDurations || {},
      usageStats.visualDurations,
      snapshot.activeVisual
    ),
  };
};

const updateUsageView = () => {
  const snapshot = getActiveTrackSnapshot();
  const totals = getUsageTotalsForScope(activeUsageScope, snapshot);

  if (statAudioInitsEl) {
    statAudioInitsEl.textContent = totals.audioInitializations ?? 0;
  }
  if (statAudioAddsEl) {
    statAudioAddsEl.textContent = totals.audioTrackAdds ?? 0;
  }
  if (statVisualAddsEl) {
    statVisualAddsEl.textContent = totals.visualAdds ?? 0;
  }
  if (statTrackStopsEl) {
    statTrackStopsEl.textContent = totals.trackStops ?? 0;
  }
  if (statSessionTimeEl) {
    statSessionTimeEl.textContent =
      typeof totals.sessionTimeMs === 'number'
        ? formatDuration(totals.sessionTimeMs)
        : '—';
  }

  if (statNeuroTimeEl) {
    const neuroMs = Math.max(0, totals.totalNeuroMs || 0);
    statNeuroTimeEl.textContent = formatDuration(neuroMs);
  }

  const audioEmptyMessage =
    activeUsageScope === 'global'
      ? 'No public audio activity yet.'
      : 'No audio tracks yet.';
  const visualEmptyMessage =
    activeUsageScope === 'global'
      ? 'No public visual activity yet.'
      : 'No visual cues yet.';

  updateDurationList(statAudioDurationList, totals.audioDurations, audioEmptyMessage);
  updateDurationList(statVisualDurationList, totals.visualDurations, visualEmptyMessage);
  updateHeaderSummaries();
};

const setUsageScope = (scope) => {
  if (!VALID_USAGE_SCOPES.has(scope)) return;
  if (activeUsageScope === scope) {
    updateUsageScopeTabs();
    updateUsageScopeDescription();
    return;
  }
  activeUsageScope = scope;
  updateUsageScopeTabs();
  updateUsageScopeDescription();
  updateUsageView();
};

const toggleElement = (element, show) => {
  if (!element) return;
  element.classList.toggle('hidden', !show);
};

const setAuthLoading = (isLoading) => {
  authButtons.forEach((btn) => {
    btn.disabled = isLoading;
    btn.classList.toggle('opacity-60', isLoading);
    btn.classList.toggle('pointer-events-none', isLoading);
  });
};

const showAuthFeedback = (message, tone = 'info') => {
  if (!authFeedbackEl) return;
  if (!message) {
    authFeedbackEl.textContent = '';
    authFeedbackEl.classList.add('hidden');
    authFeedbackEl.classList.remove('text-red-500', 'text-emerald-500', 'text-slate-500');
    return;
  }

  authFeedbackEl.textContent = message;
  authFeedbackEl.classList.remove(
    'hidden',
    'text-red-500',
    'text-emerald-500',
    'text-slate-500'
  );
  if (tone === 'success') {
    authFeedbackEl.classList.add('text-emerald-500');
  } else if (tone === 'info') {
    authFeedbackEl.classList.add('text-slate-500');
  } else {
    authFeedbackEl.classList.add('text-red-500');
  }
};

const formatMetaSummary = (meta = {}) => {
  if (!meta || typeof meta !== 'object') return '';
  const parts = [];
  const carrier = meta.carrier ?? meta.base;
  if (carrier !== undefined) {
    parts.push(`${carrier} Hz`);
  }
  const modulator = meta.modulator ?? meta.beat;
  if (modulator !== undefined) {
    parts.push(`Δ ${modulator} Hz`);
  }
  if (meta.freq !== undefined && carrier === undefined) {
    parts.push(`${meta.freq} Hz`);
  }
  if (meta.pattern) {
    parts.push(titleize(meta.pattern));
  }
  if (meta.color) {
    parts.push(titleize(meta.color));
  }
  return parts.join(' • ');
};

const formatEventDescription = (event, { anonymizedView = false } = {}) => {
  if (!event) return 'Unknown activity';
  const payload = event.payload || {};
  const label = payload.label || payload.presetKey || payload.category || 'Track';
  const metaSummary = formatMetaSummary(payload.meta);
  const duration =
    payload.durationMs && payload.durationMs > 0
      ? formatDuration(payload.durationMs)
      : null;

  switch (event.eventType) {
    case 'audio_init':
      return 'Initialized the audio engine';
    case 'audio_add':
      return `Added audio track • ${label}${metaSummary ? ` (${metaSummary})` : ''}`;
    case 'visual_add':
      return `Added visual cue • ${label}${metaSummary ? ` (${metaSummary})` : ''}`;
    case 'track_stop':
      return `Stopped ${payload.kind === 'visual' ? 'visual' : 'audio'} track • ${
        label
      }${duration ? ` after ${duration}` : ''}`;
    case 'settings_update':
      return anonymizedView
        ? 'Updated privacy preferences'
        : 'Updated data & privacy preferences';
    default:
      return titleize(event.eventType.replace(/_/g, ' '));
  }
};

const renderActivityList = (container, events, { emptyMessage }) => {
  if (!container) return;
  container.innerHTML = '';

  if (!events || events.length === 0) {
    const li = document.createElement('li');
    li.className = 'activity-empty';
    li.textContent = emptyMessage;
    container.appendChild(li);
    return;
  }

  events
    .slice()
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .forEach((event) => {
      const li = document.createElement('li');
      li.className = 'activity-item';

      const description = document.createElement('div');
      description.textContent = formatEventDescription(event, {
        anonymizedView: Boolean(event.userLabel),
      });

      const meta = document.createElement('div');
      meta.className = 'activity-meta';
      const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
      const labelParts = [];
      labelParts.push(timestamp.toLocaleString());
      if (event.userLabel) {
        labelParts.push(`by ${event.userLabel}`);
      }
      meta.textContent = labelParts.join(' • ');

      li.appendChild(description);
      li.appendChild(meta);
      container.appendChild(li);
    });
};

const renderActivityFeeds = () => {
  if (activityState.activeTab !== 'mine') {
    activityMyPanel?.classList.add('hidden');
    myActivityTab?.classList.remove('activity-tab-active');
  } else {
    activityMyPanel?.classList.remove('hidden');
    myActivityTab?.classList.add('activity-tab-active');
  }

  if (activityState.activeTab !== 'public') {
    activityPublicPanel?.classList.add('hidden');
    publicActivityTab?.classList.remove('activity-tab-active');
  } else {
    activityPublicPanel?.classList.remove('hidden');
    publicActivityTab?.classList.add('activity-tab-active');
  }

  renderActivityList(myActivityList, activityState.myEvents, {
    emptyMessage: userSettings.collectData
      ? 'No activity logged yet.'
      : 'Data collection is disabled.',
  });

  renderActivityList(publicActivityList, activityState.publicEvents, {
    emptyMessage: 'Public feed is waiting for community activity.',
  });
};

const setActiveActivityTab = (tab) => {
  activityState.activeTab = tab;
  renderActivityFeeds();
};

const EVENT_REFRESH_DEBOUNCE_MS = 1500;
let pendingEventRefreshTimeout = null;

const scheduleEventRefresh = () => {
  if (pendingEventRefreshTimeout) return;
  pendingEventRefreshTimeout = setTimeout(() => {
    pendingEventRefreshTimeout = null;
    refreshUserEvents({ force: true });
    refreshPublicEvents({ force: true });
  }, EVENT_REFRESH_DEBOUNCE_MS);
};

const recordUsageEvent = async (eventType, payload = {}) => {
  if (!userSettings.collectData) return;
  const user = authState.currentUser;
  if (!user || !user.uid) return;

  try {
    const result = await writeUsageEvent({
      user,
      sessionId,
      eventType,
      payload,
      settings: userSettings,
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || 'unknown-error');
    }
    scheduleEventRefresh();
  } catch (error) {
    console.error('[Usage] Failed to record event:', error);
  }
};

const applySettingsFromSource = (settings) => {
  const defaults = getDefaultPrivacySettings();
  Object.assign(
    userSettings,
    defaults,
    settings && typeof settings === 'object' ? settings : {}
  );
  applySettingsToUI();
};

const loadSettingsIntoState = (uid) => {
  const local = loadSettingsFromLocal(uid);
  if (local) {
    applySettingsFromSource(local);
  } else {
    applySettingsFromSource(getDefaultPrivacySettings());
  }
};

const loadUserSettingsFor = async (user) => {
  const uid = user?.uid;
  loadSettingsIntoState(uid);
  if (!uid) return;

  try {
    const remote = await fetchUserSettings(uid);
    applySettingsFromSource(remote);
    saveSettingsToLocal(uid, userSettings);
  } catch (error) {
    console.warn('[Settings] Using local preferences due to fetch error.', error);
  }
};

const refreshUserEvents = async ({ force = false } = {}) => {
  const uid = authState.currentUser?.uid;
  if (!uid) return;
  if (activityState.fetchingUser) {
    setPendingUserEventsRefresh(true);
    return;
  }

  activityState.fetchingUser = true;
  try {
    const events = await fetchUserEvents(uid, { pageSize: 200 });
    activityState.myEvents = events;
    activityState.lastFetchedUserId = uid;
    usageStats.baseline = computeTotalsFromEvents(events);
    updateUsageView();
  } catch (error) {
    console.error('[Usage] Failed to fetch user events:', error);
  } finally {
    activityState.fetchingUser = false;
    if (getPendingUserEventsRefresh()) {
      setPendingUserEventsRefresh(false);
      refreshUserEvents({ force: true });
    }
    renderActivityFeeds();
  }
};

const refreshPublicEvents = async ({ force = false } = {}) => {
  if (activityState.fetchingPublic) {
    setPendingPublicEventsRefresh(true);
    return;
  }
  if (!force) {
    const now = Date.now();
    if (now - activityState.lastPublicFetch < EVENT_REFRESH_DEBOUNCE_MS) {
      return;
    }
  }

  activityState.fetchingPublic = true;
  try {
    const events = await fetchPublicEvents({ pageSize: 100 });
    activityState.publicEvents = events;
    invalidateCommunityTotals();
    if (activeUsageScope === 'global') {
      updateUsageView();
    }
    activityState.lastPublicFetch = Date.now();
  } catch (error) {
    console.error('[Usage] Failed to fetch public events:', error);
  } finally {
    activityState.fetchingPublic = false;
    if (getPendingPublicEventsRefresh()) {
      setPendingPublicEventsRefresh(false);
      refreshPublicEvents({ force: true });
    }
    renderActivityFeeds();
  }
};

const handleSettingsChange = (updates = {}) => {
  Object.assign(userSettings, updates);

  if (!userSettings.collectData) {
    userSettings.shareAnonymized = false;
    userSettings.includeInCommunity = false;
  } else if (!userSettings.shareAnonymized) {
    userSettings.includeInCommunity = false;
  }

  applySettingsToUI();
  schedulePersistSettings();
  refreshPublicEvents({ force: true });
  if (updates.collectData !== undefined) {
    refreshUserEvents({ force: true });
  }

  if (userSettings.collectData) {
    recordUsageEvent('settings_update', {
      settings: {
        collectData: userSettings.collectData,
        shareAnonymized: userSettings.shareAnonymized,
        includeInCommunity: userSettings.includeInCommunity,
      },
    });
  }
  updateHeaderSummaries();
};

const handleUserContextChanged = async (user) => {
  await loadUserSettingsFor(user);
  await refreshUserEvents({ force: true });
  await refreshPublicEvents({ force: true });
};

const describeUserLabel = (user) => {
  if (!user) return '—';
  const uidSuffix = user.uid ? user.uid.slice(-6) : '------';
  if (isAnonymousUser(user)) {
    return `Anonymous #${uidSuffix}`;
  }
  return user.displayName || user.email || `User ${uidSuffix}`;
};

const updateAuthUI = (user) => {
  authState.currentUser = user;
  const hasUser = Boolean(user);
  const anonymous = hasUser ? isAnonymousUser(user) : true;

  authIdentityEl.textContent = describeUserLabel(user);

  if (!hasUser) {
    authStatusEl.textContent = 'No active session. Establishing secure connection…';
  } else if (anonymous) {
    authStatusEl.textContent =
      'Anonymous session active. Sign in to sync usage across devices.';
  } else {
    const name = user.displayName || user.email || `User ${user.uid.slice(-6)}`;
    authStatusEl.textContent = `Signed in as ${name}. Sessions will sync to your account.`;
  }

  toggleElement(authAnonymousBadge, hasUser && anonymous);
  toggleElement(authLoginSection, !hasUser || anonymous);
  toggleElement(btnSignout, hasUser && !anonymous);

  if (statFirstSignInEl) {
    statFirstSignInEl.textContent =
      !hasUser || anonymous || !user?.metadata?.creationTime
        ? '—'
        : formatDateTime(user.metadata.creationTime);
  }

  if (statLastSignInEl) {
    statLastSignInEl.textContent =
      !hasUser || !user?.metadata?.lastSignInTime
        ? '—'
        : formatDateTime(user.metadata.lastSignInTime);
  }

  if (hasUser && !anonymous) {
    if (authEmailInput) authEmailInput.value = '';
    if (authPasswordInput) authPasswordInput.value = '';
  }

  if (hasUser) {
    showAuthFeedback('');
  }

  setAuthLoading(false);
  updateProfileSummary();
  updateUsageView();
  updateHeaderSummaries();
};

const handleAuthError = (error, fallbackMessage) => {
  if (!error) {
    showAuthFeedback(fallbackMessage || 'Authentication failed.', 'error');
    return;
  }
  const code = error.code;
  const message =
    AUTH_ERROR_MESSAGES[code] ||
    fallbackMessage ||
    error.message ||
    'Authentication failed.';

  const tone = AUTH_INFO_CODES.has(code) ? 'info' : 'error';
  if (tone === 'error') {
    console.error('[Auth] Error:', error);
  }
  showAuthFeedback(message, tone);
};

const initAuthFlow = async () => {
  try {
    authState.unsubscribe = await onAuthChanged((user) => {
      updateAuthUI(user);
      handleUserContextChanged(user);
    });
  } catch (error) {
    console.error('[Auth] Failed to attach listener:', error);
  }

  try {
    await ensureAnonymousUser();
  } catch (error) {
    console.error('[Auth] Unable to ensure anonymous user:', error);
    handleAuthError(error, 'Unable to start anonymous session.');
  }

  try {
    const user = await getCurrentUser();
    updateAuthUI(user);
    await handleUserContextChanged(user);
  } catch (error) {
    console.error('[Auth] Failed to fetch current user:', error);
  }

  updateUsageView();
};

btnLoginGoogle?.addEventListener('click', async () => {
  showAuthFeedback('');
  setAuthLoading(true);
  try {
    await signInWithGoogle();
    showAuthFeedback('Google sign-in successful.', 'success');
  } catch (error) {
    handleAuthError(error, 'Google sign-in failed.');
  } finally {
    setAuthLoading(false);
  }
});

btnLoginGitHub?.addEventListener('click', async () => {
  showAuthFeedback('');
  setAuthLoading(true);
  try {
    await signInWithGitHub();
    showAuthFeedback('GitHub sign-in successful.', 'success');
  } catch (error) {
    handleAuthError(error, 'GitHub sign-in failed.');
  } finally {
    setAuthLoading(false);
  }
});

btnEmailLogin?.addEventListener('click', async () => {
  const email = authEmailInput?.value.trim();
  const password = authPasswordInput?.value || '';

  if (!email || !password) {
    showAuthFeedback('Enter both email and password to login.', 'error');
    return;
  }

  showAuthFeedback('');
  setAuthLoading(true);

  try {
    await signInWithEmail(email, password);
    showAuthFeedback('Signed in with email.', 'success');
  } catch (error) {
    handleAuthError(error, 'Email sign-in failed.');
  } finally {
    setAuthLoading(false);
  }
});

btnEmailRegister?.addEventListener('click', async () => {
  const email = authEmailInput?.value.trim();
  const password = authPasswordInput?.value || '';

  if (!email || !password) {
    showAuthFeedback('Provide email and password to create an account.', 'error');
    return;
  }

  showAuthFeedback('');
  setAuthLoading(true);

  try {
    await registerWithEmail(email, password);
    showAuthFeedback('Account created and signed in.', 'success');
  } catch (error) {
    handleAuthError(error, 'Registration failed.');
  } finally {
    setAuthLoading(false);
  }
});

btnSignout?.addEventListener('click', async () => {
  showAuthFeedback('');
  setAuthLoading(true);
  try {
    await signOutUser();
    await ensureAnonymousUser();
    showAuthFeedback('Signed out successfully.', 'success');
  } catch (error) {
    handleAuthError(error, 'Failed to sign out.');
  } finally {
    setAuthLoading(false);
  }
});

usageScopeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const scope = btn.dataset.usageScope;
    if (scope) {
      setUsageScope(scope);
    }
  });
});

if (usageScopeButtons.length > 0) {
  setUsageScope(activeUsageScope);
} else {
  updateUsageScopeDescription();
}

chipStimulation?.addEventListener('click', () => {
  setActiveWorkspace(WORKSPACES.STIMULATION);
  updateHeaderSummaries();
});
chipIdentity?.addEventListener('click', () => {
  setActiveWorkspace(WORKSPACES.IDENTITY);
  updateHeaderSummaries();
});

collectDataToggle?.addEventListener('change', (event) => {
  handleSettingsChange({ collectData: Boolean(event.target.checked) });
});

shareAnonymizedToggle?.addEventListener('change', (event) => {
  handleSettingsChange({ shareAnonymized: Boolean(event.target.checked) });
});

includeCommunityToggle?.addEventListener('change', (event) => {
  handleSettingsChange({
    includeInCommunity: Boolean(event.target.checked),
  });
});

extendedBeatFreqToggle?.addEventListener('change', (event) => {
  extendedRangeSettings.allowExtendedBeatFreq = Boolean(event.target.checked);
  saveExtendedRangeSettings();
  updateActiveTrackRanges();
});

extendedCarrierFreqToggle?.addEventListener('change', (event) => {
  extendedRangeSettings.allowExtendedCarrierFreq = Boolean(event.target.checked);
  saveExtendedRangeSettings();
  updateActiveTrackRanges();
});

extendedLRFreqToggle?.addEventListener('change', (event) => {
  extendedRangeSettings.allowExtendedLRFreq = Boolean(event.target.checked);
  saveExtendedRangeSettings();
  updateActiveTrackRanges();
});

extendedPanFreqToggle?.addEventListener('change', (event) => {
  extendedRangeSettings.allowExtendedPanFreq = Boolean(event.target.checked);
  saveExtendedRangeSettings();
  updateActiveTrackRanges();
});

extendedCrossfadeToggle?.addEventListener('change', (event) => {
  extendedRangeSettings.allowExtendedCrossfade = Boolean(event.target.checked);
  saveExtendedRangeSettings();
  updateActiveTrackRanges();
});

martigliStartBtn?.addEventListener('click', () => {
  martigliController.start();
  updateMartigliUI();
  saveMartigliConfig();
});

martigliStopBtn?.addEventListener('click', () => {
  martigliController.stop();
  updateMartigliUI();
  saveMartigliConfig();
});

martigliWaveformSelect?.addEventListener('change', (event) => {
  martigliController.waveform = event.target.value;
  saveMartigliConfig();
  martigliController.notifyConfigChanged();
  renderMartigliVisualization();
});

martigliInhaleRatioInput?.addEventListener('input', (event) => {
  const value = parseFloat(event.target.value);
  martigliController.inhaleRatio = value;
  if (martigliInhaleRatioValue) {
    martigliInhaleRatioValue.textContent = `${Math.round(value * 100)}%`;
  }
  saveMartigliConfig();
  martigliController.notifyConfigChanged();
  renderMartigliVisualization();
});

btnAddTrajectoryPoint?.addEventListener('click', () => {
  const lastPoint = martigliController.trajectory[martigliController.trajectory.length - 1];
  martigliController.trajectory.push({
    period: lastPoint.period,
    duration: 60,
  });
  saveMartigliConfig();
  martigliController.notifyConfigChanged();
  renderMartigliTrajectory();
});

audioEngineSelect?.addEventListener('change', async (event) => {
  const value = event.target.value;
  setEngineSelection({ audio: value });
  populateEngineSelects();
  recordUsageEvent('engine_change', { type: 'audio', value });
  if (audioEngine) {
    stopAllAudio({ message: 'Audio engine disabled until reinitialized.' });
    await disposeAudioEngine();
  }
  setAudioControlsIdle('Audio engine selection updated. Start audio to apply changes.');
  updateFloatingWidgetUI();
});

visualEngineSelect?.addEventListener('change', (event) => {
  const value = event.target.value;
  setEngineSelection({ visual: value });
  populateEngineSelects();
  recordUsageEvent('engine_change', { type: 'visual', value });
  updateFloatingWidgetUI();
});

hapticEngineSelect?.addEventListener('change', (event) => {
  const value = event.target.value;
  setEngineSelection({ haptics: value });
  populateEngineSelects();
  recordUsageEvent('engine_change', { type: 'haptics', value });
  updateFloatingWidgetUI();
});

myActivityTab?.addEventListener('click', () => setActiveActivityTab('mine'));
publicActivityTab?.addEventListener('click', () => setActiveActivityTab('public'));
refreshActivityBtn?.addEventListener('click', () => {
  refreshUserEvents({ force: true });
  refreshPublicEvents({ force: true });
});

// Initial render after functions are defined
loadExtendedRangeSettings();
loadMartigliConfig();
initDiagnostics();
populateEngineSelects();
updateProfileSummary();
applySettingsToUI();
updateUsageView();
renderActivityFeeds();
renderMartigliTrajectory();
updateMartigliUI();

// Auto-start Martigli controller on page load
martigliController.start();
updateMartigliUI();

// Update Martigli values and visualization in real-time using requestAnimationFrame
let lastUpdateTime = 0;
const updateMartigliLoop = (timestamp) => {
  // Throttle to ~10fps (every 100ms) to match previous interval
  if (timestamp - lastUpdateTime >= 100) {
    if (martigliController.active) {
      updateMartigliValues();
      renderMartigliVisualization();
    }
    lastUpdateTime = timestamp;
  }
  requestAnimationFrame(updateMartigliLoop);
};
requestAnimationFrame(updateMartigliLoop);

// Initial visualization render
renderMartigliVisualization();

window.addEventListener('storage', (event) => {
  if (event.key === 'biosyncare_user_profile') {
    updateProfileSummary();
  }
  if (
    event.key === SETTINGS_STORAGE_BASE_KEY ||
    (authState.currentUser &&
      event.key === `${SETTINGS_STORAGE_BASE_KEY}_${authState.currentUser.uid}`)
  ) {
    loadSettingsIntoState(authState.currentUser?.uid);
    applySettingsToUI();
    refreshPublicEvents({ force: true });
    refreshUserEvents({ force: true });
  }
});

window.addEventListener('beforeunload', () => {
  if (typeof authState.unsubscribe === 'function') {
    authState.unsubscribe();
  }
});

setInterval(updateUsageView, 1000);
initAuthFlow();

const initBtn = document.getElementById('btn-init');
const stopBtn = document.getElementById('btn-stop');

const statusEl = document.getElementById('status');
const audioMenu = document.getElementById('audio-menu');
const audioDescriptionEl = document.getElementById('audio-description');
const audioParameterPanel = document.getElementById('audio-parameter-panel');
const addAudioBtn = document.getElementById('btn-add-audio');
const stopAllAudioBtn = document.getElementById('btn-stop-all-audio');
const audioActiveList = document.getElementById('audio-active-list');
const audioActiveEmpty = document.getElementById('audio-active-empty');
const audioTrackCount = document.getElementById('audio-track-count');
const presetAudioListEl = document.getElementById('preset-audio-list');
const presetSessionListEl = document.getElementById('preset-session-list');
const presetSearchInput = document.getElementById('preset-search');
const presetTabButtons = document.querySelectorAll('[data-preset-tab]');
const btnRefreshPresets = document.getElementById('btn-refresh-presets');
const btnClearPresetFilter = document.getElementById('btn-clear-preset-filter');
const btnSaveAudioPreset = document.getElementById('btn-save-audio-preset');
const btnSaveSessionPreset = document.getElementById('btn-save-session-preset');

const visualMenu = document.getElementById('visual-menu');
const visualDescriptionEl = document.getElementById('visual-description');
const addVisualBtn = document.getElementById('btn-add-visual');
const stopAllVisualBtn = document.getElementById('btn-stop-all-visual');
const visualLayerContainer = document.getElementById('visual-layer-container');
const visualActiveList = document.getElementById('visual-active-list');
const visualActiveEmpty = document.getElementById('visual-active-empty');
const visualTrackCount = document.getElementById('visual-track-count');
const visualStatusText = document.getElementById('visual-status-text');
const panelToggleButtons = document.querySelectorAll('.panel-toggle');

panelToggleButtons.forEach((button) => {
  const panel = button.closest('.panel');
  if (!panel) return;
  const icon = button.querySelector('.panel-toggle-icon');
  const label = button.querySelector('.panel-toggle-label');
  const body = panel.querySelector('.panel-body');

  const syncState = (expanded) => {
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (label) {
      label.textContent = expanded ? 'Hide' : 'Show';
    }
    if (icon) {
      icon.textContent = expanded ? '▾' : '▸';
    }
    if (body) {
      body.hidden = !expanded;
    }
  };

  panel.classList.remove('panel-collapsed');
  syncState(true);

  button.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('panel-collapsed');
    syncState(!collapsed);
  });
});

const isAudioContextRunning = () =>
  Boolean(audioEngine?.ctx && audioEngine.ctx.state === 'running');

const setAudioControlsIdle = (message) => {
  if (initBtn) {
    initBtn.classList.remove('hidden');
    initBtn.classList.add('start-audio-btn');
    initBtn.disabled = false;
  }
  if (stopBtn) {
    stopBtn.classList.add('hidden');
  }
  if (message && statusEl) {
    statusEl.textContent = message;
  }
  updateStimulationHeaderSummary();
};

const setAudioControlsRunning = (message) => {
  if (initBtn) {
    initBtn.classList.add('hidden');
    initBtn.classList.remove('start-audio-btn');
    initBtn.disabled = false;
  }
  if (stopBtn) {
    stopBtn.classList.remove('hidden');
  }
  if (message && statusEl) {
    statusEl.textContent = message;
  }
  updateStimulationHeaderSummary();
};

const markAudioStarting = (message) => {
  if (initBtn) {
    initBtn.disabled = true;
    initBtn.classList.remove('start-audio-btn');
  }
  if (stopBtn) {
    stopBtn.classList.add('hidden');
  }
  if (message && statusEl) {
    statusEl.textContent = message;
  }
  updateStimulationHeaderSummary();
};

const disposeAudioEngine = async () => {
  if (!audioEngine) return;
  try {
    audioEngine.stopAll?.();
  } catch (error) {
    console.warn('[Audio] Failed to stop audio engine cleanly.', error);
  }
  const ctx = audioEngine.ctx;
  if (ctx) {
    try {
      if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
        await ctx.close();
      } else if (typeof ctx.suspend === 'function') {
        await ctx.suspend();
      }
    } catch (error) {
      console.warn('[Audio] Failed to close audio context.', error);
    }
  }
  audioEngine = null;
  if (typeof window !== 'undefined' && window.martigliController?.detachWorkletPort) {
    window.martigliController.detachWorkletPort();
  }
  updateStimulationHeaderSummary();
};

const ensureAudioEngine = async ({ userInitiated = false } = {}) => {
  if (audioEngine) {
    try {
      await audioEngine.resume?.();
      audioEngine._initMartigliWorklet?.();
    } catch (error) {
      console.warn('[Audio] Failed to resume audio context.', error);
    }
    setAudioControlsRunning();
    return audioEngine;
  }

  if (audioEngineInitPromise) {
    return audioEngineInitPromise;
  }

  const startingMessage = userInitiated
    ? 'Starting audio engine…'
    : 'Preparing audio engine for playback…';
  markAudioStarting(startingMessage);

  const initialization = (async () => {
    try {
      const engine = await createAudioEngine(getEngineSelection());
      await engine.init?.();
      audioEngine = engine;
      setAudioControlsRunning('Audio engine ready. Layer tracks freely.');
      incrementAudioInits();
      recordUsageEvent('audio_init', { count: 1 });
      updateUsageView();
      return audioEngine;
    } catch (error) {
      console.error('Failed to initialise audio engine', error);
      setAudioControlsIdle('Audio engine failed to initialise.');
      return null;
    } finally {
      audioEngineInitPromise = null;
      if (initBtn) {
        initBtn.disabled = false;
        if (!audioEngine) {
          initBtn.classList.add('start-audio-btn');
        }
      }
    }
  })();

  audioEngineInitPromise = initialization;
  return initialization;
};

const audioPresets = {
  sine: {
    label: 'Pure sine • 440Hz',
    description: 'Pure sine tone at 440Hz for quick calibration and reference.',
    params: [
      {
        id: 'frequency',
        label: 'Frequency',
        type: 'range',
        min: 40,
        max: 2000,
        step: 1,
        unit: 'Hz',
        default: 440,
        live: true,
      },
      createMartigliDepthParam('frequency', 'Frequency', 500, 'Hz'),
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.2,
        live: true,
      },
      createMartigliDepthParam('gain', 'Gain', 0.5, ''),
      {
        id: 'pan',
        label: 'Stereo pan',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        live: true,
        formatValue: (value) => {
          if (!Number.isFinite(value)) return '0';
          if (Math.abs(value) < 0.01) return 'Center';
          return value > 0
            ? `Right ${value.toFixed(2)}`
            : `Left ${Math.abs(value).toFixed(2)}`;
        },
      },
      createMartigliDepthParam('pan', 'Pan', 1, ''),
    ],
    start: (params = {}) => {
      const frequency = Number(params.frequency ?? 440);
      const gain = Number(params.gain ?? 0.2);
      const pan = Number(params.pan ?? 0);

      // Martigli modulation config - depth of 0 means off
      const martigliConfig = {
        frequency: {
          enabled: Number(params.martigliDepth_frequency ?? 0) > 0,
          depth: Number(params.martigliDepth_frequency ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
        pan: {
          enabled: Number(params.martigliDepth_pan ?? 0) > 0,
          depth: Number(params.martigliDepth_pan ?? 0),
        },
      };

      const nodeId = audioEngine.playWaveform({
        type: 'sine',
        freq: frequency,
        gain,
        pan,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.frequency.enabled) modTexts.push(`Freq ±${martigliConfig.frequency.depth}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      if (martigliConfig.pan.enabled) modTexts.push(`Pan ±${martigliConfig.pan.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      return {
        nodeId,
        detail: `${frequency.toFixed(1)} Hz${modulationText} · gain ${gain.toFixed(2)}`,
        parameters: { ...params },
        meta: {
          type: 'waveform',
          wave: 'sine',
          frequency,
          gain,
          pan,
          martigliConfig,
        },
      };
    },
    update: (track, params = {}) => {
      const martigliConfig = {
        frequency: {
          enabled: Number(params.martigliDepth_frequency ?? 0) > 0,
          depth: Number(params.martigliDepth_frequency ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
        pan: {
          enabled: Number(params.martigliDepth_pan ?? 0) > 0,
          depth: Number(params.martigliDepth_pan ?? 0),
        },
      };

      audioEngine.updateWaveform(track.nodeId, {
        freq: params.frequency,
        gain: params.gain,
        pan: params.pan,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.frequency.enabled) modTexts.push(`Freq ±${martigliConfig.frequency.depth}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      if (martigliConfig.pan.enabled) modTexts.push(`Pan ±${martigliConfig.pan.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      return {
        detail: `${params.frequency.toFixed(1)} Hz${modulationText} · gain ${params.gain.toFixed(2)}`,
        meta: {
          frequency: params.frequency,
          gain: params.gain,
          pan: params.pan,
          martigliConfig,
        },
      };
    },
    describe: (params = {}) => `${Math.round(params.frequency ?? 440)} Hz`,
  },
  binaural: {
    label: 'Binaural beat • Alpha 10Hz',
    description: 'Stereo carriers offset by 10Hz promote relaxed alpha entrainment.',
    params: () => {
      const carrierRange = getCarrierFreqRange();
      const beatRange = getBeatFreqRange();
      const lrRange = getLRFreqRange();
      const panRange = getPanFreqRange();
      const crossfadeHoldRange = getCrossfadeHoldRange();
      const crossfadeDurRange = getCrossfadeDurationRange();

      return [
        {
          id: 'frequencyMode',
          label: 'Frequency control',
          type: 'select',
          options: [
            { value: 'carrier-beat', label: 'Carrier & beat' },
            { value: 'absolute', label: 'Explicit L/R' },
          ],
          default: 'carrier-beat',
          triggersLayout: true,
          formatValue: (value) =>
            value === 'absolute' ? 'Explicit L/R' : 'Carrier & beat',
        },
        {
          id: 'base',
          label: 'Carrier frequency',
          type: 'range',
          min: carrierRange.min,
          max: carrierRange.max,
          step: 1,
          unit: 'Hz',
          default: 200,
          live: true,
          isVisible: (state) => state.frequencyMode !== 'absolute',
        },
        {
          id: 'beat',
          label: 'Beat frequency',
          type: 'range',
          min: beatRange.min,
          max: beatRange.max,
          step: 0.1,
          unit: 'Hz',
          default: 10,
          live: true,
          isVisible: (state) => state.frequencyMode !== 'absolute',
        },
        {
          id: 'leftFrequency',
          label: 'Left component',
          type: 'range',
          min: lrRange.min,
          max: lrRange.max,
          step: 1,
          unit: 'Hz',
          default: 195,
          live: true,
          isVisible: (state) => state.frequencyMode === 'absolute',
        },
        {
          id: 'rightFrequency',
          label: 'Right component',
          type: 'range',
          min: lrRange.min,
          max: lrRange.max,
          step: 1,
          unit: 'Hz',
          default: 205,
          live: true,
          isVisible: (state) => state.frequencyMode === 'absolute',
        },
        {
          id: 'panMode',
          label: 'Panning pattern',
          type: 'select',
          options: [
            { value: 'static', label: 'Static channels' },
            { value: 'lfo', label: 'Oscillating sine' },
            { value: 'martigli', label: 'Sync with Martigli' },
            { value: 'crossfade', label: 'Timed crossfade' },
          ],
          default: 'static',
          triggersLayout: true,
          formatValue: (value) =>
            ({
              static: 'Static channels',
              lfo: 'Oscillating sine',
              martigli: 'Sync with Martigli',
              crossfade: 'Timed crossfade',
            })[value] || value,
        },
        {
          id: 'panDepth',
          label: 'Pan depth',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          default: 1,
          live: true,
          isVisible: (state) => state.panMode === 'lfo' || state.panMode === 'martigli',
        },
        {
          id: 'panFrequency',
          label: 'Pan frequency',
          type: 'range',
          min: panRange.min,
          max: panRange.max,
          step: 0.01,
          unit: 'Hz',
          default: 0.2,
          live: true,
          isVisible: (state) => state.panMode === 'lfo',
        },
        {
          id: 'martigliFrequency',
          label: 'Martigli frequency (fallback)',
          type: 'range',
          min: 0.02,
          max: 0.6,
          step: 0.01,
          unit: 'Hz',
          default: 0.1,
          live: true,
          isVisible: (state) => state.panMode === 'martigli',
          formatValue: (value) => {
            const usingGlobal = martigliController.active;
            return usingGlobal ? 'Using global controller' : `${value.toFixed(2)} Hz`;
          },
        },
        {
          id: 'crossfadeHold',
          label: 'Hold duration',
          type: 'range',
          min: crossfadeHoldRange.min,
          max: crossfadeHoldRange.max,
          step: 1,
          unit: 's',
          default: 120,
          live: false,
          isVisible: (state) => state.panMode === 'crossfade',
        },
        {
          id: 'crossfadeDuration',
          label: 'Crossfade time',
          type: 'range',
          min: crossfadeDurRange.min,
          max: crossfadeDurRange.max,
          step: 0.5,
          unit: 's',
          default: 20,
          live: false,
          isVisible: (state) => state.panMode === 'crossfade',
        },
        {
          id: 'panBaseOffset',
          label: 'Pan offset',
          type: 'range',
          min: -0.8,
          max: 0.8,
          step: 0.01,
          default: 0,
          live: true,
        },
        {
          id: 'gain',
          label: 'Gain',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.25,
          live: true,
        },
        createMartigliDepthParam('base', 'Carrier frequency', 500, 'Hz'),
        createMartigliDepthParam('beat', 'Beat frequency', 20, 'Hz'),
        createMartigliDepthParam('gain', 'Gain', 0.5, ''),
      ];
    },
    start(params = {}) {
      const values = { ...params };

      // Martigli modulation config
      const martigliConfig = {
        base: {
          enabled: Number(params.martigliDepth_base ?? 0) > 0,
          depth: Number(params.martigliDepth_base ?? 0),
        },
        beat: {
          enabled: Number(params.martigliDepth_beat ?? 0) > 0,
          depth: Number(params.martigliDepth_beat ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
      };

      const nodeId = audioEngine.playBinaural({
        mixMode: 'dichotic',
        frequencyMode: values.frequencyMode,
        base: values.base,
        beat: values.beat,
        leftFrequency: values.leftFrequency,
        rightFrequency: values.rightFrequency,
        gain: values.gain,
        panMode: values.panMode,
        panDepth: values.panDepth,
        panFrequency: values.panFrequency,
        martigliFrequency: values.martigliFrequency,
        crossfadeHold: values.crossfadeHold,
        crossfadeDuration: values.crossfadeDuration,
        panBaseOffset: values.panBaseOffset,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.base.enabled) modTexts.push(`Carrier ±${martigliConfig.base.depth}Hz`);
      if (martigliConfig.beat.enabled) modTexts.push(`Beat ±${martigliConfig.beat.depth.toFixed(1)}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      const detail = this.describe(values) + modulationText;
      return {
        nodeId,
        detail,
        parameters: { ...values },
        meta: {
          type: 'binaural',
          frequencyMode: values.frequencyMode,
          base: values.base,
          beat: values.beat,
          leftFrequency: values.leftFrequency,
          rightFrequency: values.rightFrequency,
          panMode: values.panMode,
          martigliConfig,
        },
      };
    },
    update(track, params = {}) {
      const martigliConfig = {
        base: {
          enabled: Number(params.martigliDepth_base ?? 0) > 0,
          depth: Number(params.martigliDepth_base ?? 0),
        },
        beat: {
          enabled: Number(params.martigliDepth_beat ?? 0) > 0,
          depth: Number(params.martigliDepth_beat ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
      };

      audioEngine.updateBinaural(track.nodeId, {
        mixMode: 'dichotic',
        ...params,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.base.enabled) modTexts.push(`Carrier ±${martigliConfig.base.depth}Hz`);
      if (martigliConfig.beat.enabled) modTexts.push(`Beat ±${martigliConfig.beat.depth.toFixed(1)}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      const detail = this.describe(params) + modulationText;
      return {
        detail,
        meta: {
          frequencyMode: params.frequencyMode,
          base: params.base,
          beat: params.beat,
          leftFrequency: params.leftFrequency,
          rightFrequency: params.rightFrequency,
          panMode: params.panMode,
          martigliConfig,
        },
      };
    },
    describe(params = {}) {
      const mode = params.frequencyMode || 'carrier-beat';
      const base = Number(params.base ?? 200);
      const beat = Number(params.beat ?? 10);
      const left = Number(params.leftFrequency ?? base - beat / 2);
      const right = Number(params.rightFrequency ?? base + beat / 2);
      const panMode = params.panMode || 'static';
      const panLabel =
        {
          static: 'static pan',
          lfo: 'sine pan',
          martigli: 'martigli pan',
          crossfade: 'crossfade pan',
        }[panMode] || panMode;
      if (mode === 'absolute') {
        return `L ${left.toFixed(1)} Hz • R ${right.toFixed(1)} Hz (${panLabel})`;
      }
      return `Carrier ${base.toFixed(1)} Hz • Beat ${beat.toFixed(2)} Hz (${panLabel})`;
    },
  },
  monaural: {
    label: 'Monaural beat • Theta 6Hz',
    description:
      'Summed dual-tone beat for headphones or speakers, aimed at theta relaxation.',
    params: () => {
      const carrierRange = getCarrierFreqRange();
      const beatRange = getBeatFreqRange();
      const lrRange = getLRFreqRange();
      const panRange = getPanFreqRange();
      const crossfadeHoldRange = getCrossfadeHoldRange();
      const crossfadeDurRange = getCrossfadeDurationRange();

      return [
        {
          id: 'frequencyMode',
          label: 'Frequency control',
          type: 'select',
          options: [
            { value: 'carrier-beat', label: 'Carrier & beat' },
            { value: 'absolute', label: 'Explicit L/R' },
          ],
          default: 'carrier-beat',
          triggersLayout: true,
          formatValue: (value) =>
            value === 'absolute' ? 'Explicit L/R' : 'Carrier & beat',
        },
        {
          id: 'base',
          label: 'Carrier frequency',
          type: 'range',
          min: carrierRange.min,
          max: carrierRange.max,
          step: 1,
          unit: 'Hz',
          default: 210,
          live: true,
          isVisible: (state) => state.frequencyMode !== 'absolute',
        },
        {
          id: 'beat',
          label: 'Beat frequency',
          type: 'range',
          min: beatRange.min,
          max: beatRange.max,
          step: 0.1,
          unit: 'Hz',
          default: 6,
          live: true,
          isVisible: (state) => state.frequencyMode !== 'absolute',
        },
        {
          id: 'leftFrequency',
          label: 'Left component',
          type: 'range',
          min: lrRange.min,
          max: lrRange.max,
          step: 1,
          unit: 'Hz',
          default: 207,
          live: true,
          isVisible: (state) => state.frequencyMode === 'absolute',
        },
        {
          id: 'rightFrequency',
          label: 'Right component',
          type: 'range',
          min: lrRange.min,
          max: lrRange.max,
          step: 1,
          unit: 'Hz',
          default: 213,
          live: true,
          isVisible: (state) => state.frequencyMode === 'absolute',
        },
        {
          id: 'panMode',
          label: 'Panning pattern',
          type: 'select',
          options: [
            { value: 'static', label: 'Static mix' },
            { value: 'lfo', label: 'Oscillating sine' },
            { value: 'martigli', label: 'Sync with Martigli' },
            { value: 'crossfade', label: 'Timed crossfade' },
          ],
          default: 'static',
          triggersLayout: true,
          formatValue: (value) =>
            ({
              static: 'Static mix',
              lfo: 'Oscillating sine',
              martigli: 'Sync with Martigli',
              crossfade: 'Timed crossfade',
            })[value] || value,
        },
        {
          id: 'panDepth',
          label: 'Pan depth',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.6,
          live: true,
          isVisible: (state) => state.panMode === 'lfo' || state.panMode === 'martigli',
        },
        {
          id: 'panFrequency',
          label: 'Pan frequency',
          type: 'range',
          min: panRange.min,
          max: panRange.max,
          step: 0.01,
          unit: 'Hz',
          default: 0.2,
          live: true,
          isVisible: (state) => state.panMode === 'lfo',
        },
        {
          id: 'martigliFrequency',
          label: 'Martigli frequency (fallback)',
          type: 'range',
          min: 0.02,
          max: 0.6,
          step: 0.01,
          unit: 'Hz',
          default: 0.1,
          live: true,
          isVisible: (state) => state.panMode === 'martigli',
          formatValue: (value) => {
            const usingGlobal = martigliController.active;
            return usingGlobal ? 'Using global controller' : `${value.toFixed(2)} Hz`;
          },
        },
        {
          id: 'crossfadeHold',
          label: 'Hold duration',
          type: 'range',
          min: crossfadeHoldRange.min,
          max: crossfadeHoldRange.max,
          step: 1,
          unit: 's',
          default: 90,
          live: false,
          isVisible: (state) => state.panMode === 'crossfade',
        },
        {
          id: 'crossfadeDuration',
          label: 'Crossfade time',
          type: 'range',
          min: crossfadeDurRange.min,
          max: crossfadeDurRange.max,
          step: 0.5,
          unit: 's',
          default: 15,
          live: false,
          isVisible: (state) => state.panMode === 'crossfade',
        },
        {
          id: 'panBaseOffset',
          label: 'Pan offset',
          type: 'range',
          min: -0.5,
          max: 0.5,
          step: 0.01,
          default: 0,
          live: true,
        },
        {
          id: 'gain',
          label: 'Gain',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.3,
          live: true,
        },
        createMartigliDepthParam('base', 'Carrier frequency', 500, 'Hz'),
        createMartigliDepthParam('beat', 'Beat frequency', 20, 'Hz'),
        createMartigliDepthParam('gain', 'Gain', 0.5, ''),
      ];
    },
    start(params = {}) {
      const values = { ...params };

      // Martigli modulation config
      const martigliConfig = {
        base: {
          enabled: Number(params.martigliDepth_base ?? 0) > 0,
          depth: Number(params.martigliDepth_base ?? 0),
        },
        beat: {
          enabled: Number(params.martigliDepth_beat ?? 0) > 0,
          depth: Number(params.martigliDepth_beat ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
      };

      const nodeId = audioEngine.playBinaural({
        mixMode: 'monaural',
        frequencyMode: values.frequencyMode,
        base: values.base,
        beat: values.beat,
        leftFrequency: values.leftFrequency,
        rightFrequency: values.rightFrequency,
        gain: values.gain,
        panMode: values.panMode,
        panDepth: values.panDepth,
        panFrequency: values.panFrequency,
        martigliFrequency: values.martigliFrequency,
        crossfadeHold: values.crossfadeHold,
        crossfadeDuration: values.crossfadeDuration,
        panBaseOffset: values.panBaseOffset,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.base.enabled) modTexts.push(`Carrier ±${martigliConfig.base.depth}Hz`);
      if (martigliConfig.beat.enabled) modTexts.push(`Beat ±${martigliConfig.beat.depth.toFixed(1)}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      const detail = this.describe(values) + modulationText;
      return {
        nodeId,
        detail,
        parameters: { ...values },
        meta: {
          type: 'monaural',
          frequencyMode: values.frequencyMode,
          base: values.base,
          beat: values.beat,
          leftFrequency: values.leftFrequency,
          rightFrequency: values.rightFrequency,
          panMode: values.panMode,
          martigliConfig,
        },
      };
    },
    update(track, params = {}) {
      const martigliConfig = {
        base: {
          enabled: Number(params.martigliDepth_base ?? 0) > 0,
          depth: Number(params.martigliDepth_base ?? 0),
        },
        beat: {
          enabled: Number(params.martigliDepth_beat ?? 0) > 0,
          depth: Number(params.martigliDepth_beat ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
      };

      audioEngine.updateBinaural(track.nodeId, {
        mixMode: 'monaural',
        ...params,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.base.enabled) modTexts.push(`Carrier ±${martigliConfig.base.depth}Hz`);
      if (martigliConfig.beat.enabled) modTexts.push(`Beat ±${martigliConfig.beat.depth.toFixed(1)}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      const detail = this.describe(params) + modulationText;
      return {
        detail,
        meta: {
          frequencyMode: params.frequencyMode,
          base: params.base,
          beat: params.beat,
          leftFrequency: params.leftFrequency,
          rightFrequency: params.rightFrequency,
          panMode: params.panMode,
        },
      };
    },
    describe(params = {}) {
      const mode = params.frequencyMode || 'carrier-beat';
      const base = Number(params.base ?? 210);
      const beat = Number(params.beat ?? 6);
      const left = Number(params.leftFrequency ?? base - beat / 2);
      const right = Number(params.rightFrequency ?? base + beat / 2);
      const panMode = params.panMode || 'static';
      const panLabel =
        {
          static: 'static mix',
          lfo: 'sine pan',
          martigli: 'martigli pan',
          crossfade: 'crossfade pan',
        }[panMode] || panMode;
      if (mode === 'absolute') {
        return `Monaural L ${left.toFixed(1)} Hz • R ${right.toFixed(1)} Hz (${panLabel})`;
      }
      return `Monaural carrier ${base.toFixed(1)} Hz • Beat ${beat.toFixed(2)} Hz (${panLabel})`;
    },
  },
  isochronic: {
    label: 'Isochronic pulse • 12Hz breathing',
    description: 'Amplitude-gated tone delivering crisp rhythmic cues for breath pacing.',
    params: [
      {
        id: 'freq',
        label: 'Carrier frequency',
        type: 'range',
        min: 40,
        max: 1200,
        step: 1,
        unit: 'Hz',
        default: 180,
        live: true,
      },
      {
        id: 'pulseFreq',
        label: 'Pulse frequency',
        type: 'range',
        min: 0.5,
        max: 30,
        step: 0.1,
        unit: 'Hz',
        default: 12,
        live: true,
      },
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.22,
        live: true,
      },
      createMartigliDepthParam('freq', 'Carrier frequency', 500, 'Hz'),
      createMartigliDepthParam('pulseFreq', 'Pulse frequency', 15, 'Hz'),
      createMartigliDepthParam('gain', 'Gain', 0.5, ''),
    ],
    start: (params = {}) => {
      const freq = Number(params.freq ?? 180);
      const pulseFreq = Number(params.pulseFreq ?? 12);
      const gain = Number(params.gain ?? 0.22);

      // Martigli modulation config
      const martigliConfig = {
        freq: {
          enabled: Number(params.martigliDepth_freq ?? 0) > 0,
          depth: Number(params.martigliDepth_freq ?? 0),
        },
        pulseFreq: {
          enabled: Number(params.martigliDepth_pulseFreq ?? 0) > 0,
          depth: Number(params.martigliDepth_pulseFreq ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
      };

      const nodeId = audioEngine.playIsochronic({
        freq,
        pulseFreq,
        duration: null,
        gain,
        martigliConfig,
      });

      const modTexts = [];
      if (martigliConfig.freq.enabled) modTexts.push(`Carrier ±${martigliConfig.freq.depth}Hz`);
      if (martigliConfig.pulseFreq.enabled) modTexts.push(`Pulse ±${martigliConfig.pulseFreq.depth.toFixed(1)}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      const parameters = { freq, pulseFreq, gain };
      return {
        nodeId,
        detail: `${freq.toFixed(0)} Hz carrier • ${pulseFreq.toFixed(1)} Hz pulses${modulationText}`,
        parameters,
        meta: {
          type: 'isochronic',
          freq,
          pulseFreq,
          martigliConfig,
        },
      };
    },
    update: (track, params = {}) => {
      const martigliConfig = {
        freq: {
          enabled: Number(params.martigliDepth_freq ?? 0) > 0,
          depth: Number(params.martigliDepth_freq ?? 0),
        },
        pulseFreq: {
          enabled: Number(params.martigliDepth_pulseFreq ?? 0) > 0,
          depth: Number(params.martigliDepth_pulseFreq ?? 0),
        },
        gain: {
          enabled: Number(params.martigliDepth_gain ?? 0) > 0,
          depth: Number(params.martigliDepth_gain ?? 0),
        },
      };

      audioEngine.updateIsochronic(track.nodeId, { ...params, martigliConfig });

      const modTexts = [];
      if (martigliConfig.freq.enabled) modTexts.push(`Carrier ±${martigliConfig.freq.depth}Hz`);
      if (martigliConfig.pulseFreq.enabled) modTexts.push(`Pulse ±${martigliConfig.pulseFreq.depth.toFixed(1)}Hz`);
      if (martigliConfig.gain.enabled) modTexts.push(`Gain ±${martigliConfig.gain.depth.toFixed(2)}`);
      const modulationText = modTexts.length > 0 ? ` • 🫁${modTexts.join(', ')}` : '';

      return {
        detail: `${params.freq.toFixed(0)} Hz carrier • ${params.pulseFreq.toFixed(1)} Hz pulses${modulationText}`,
        meta: {
          freq: params.freq,
          pulseFreq: params.pulseFreq,
          gain: params.gain,
          martigliConfig,
        },
      };
    },
    describe: (params = {}) =>
      `${Math.round(params.freq ?? 180)} Hz • ${Number(params.pulseFreq ?? 12).toFixed(1)} Hz`,
  },
  martigli: {
    label: 'Martigli harmonics',
    description:
      'Layered harmonic ratios inspired by Martigli sequences for rich texture.',
    params: [
      {
        id: 'fundamental',
        label: 'Fundamental',
        type: 'range',
        min: 60,
        max: 600,
        step: 1,
        unit: 'Hz',
        default: 220,
        live: true,
      },
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.14,
        live: true,
      },
    ],
    start: (params = {}) => {
      const fundamental = Number(params.fundamental ?? 220);
      const harmonics = [1, 1.5, 2, 3, 5, 8, 13];
      const gain = Number(params.gain ?? 0.14);
      const nodeId = audioEngine.playMartigliWave({
        fundamental,
        harmonics,
        duration: null,
        gain,
        fadeIn: 0.6,
        fadeOut: 0.6,
      });
      const parameters = { fundamental, gain };
      return {
        nodeId,
        detail: `${fundamental.toFixed(0)} Hz fundamental`,
        parameters,
        meta: {
          type: 'martigli',
          fundamental,
          harmonics,
        },
      };
    },
    update: (track, params = {}) => {
      audioEngine.updateMartigliWave(track.nodeId, params);
      return {
        detail: `${params.fundamental.toFixed(0)} Hz fundamental`,
        meta: {
          fundamental: params.fundamental,
          gain: params.gain,
        },
      };
    },
    describe: (params = {}) => `${Math.round(params.fundamental ?? 220)} Hz fundamental`,
  },
  'noise-white': {
    label: 'Noise • White spectrum',
    description: 'Broad-spectrum white noise for masking and focus.',
    params: [
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.18,
        live: true,
      },
      {
        id: 'pan',
        label: 'Stereo pan',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        live: true,
      },
    ],
    start: (params = {}) => {
      const gain = Number(params.gain ?? 0.18);
      const pan = Number(params.pan ?? 0);
      const nodeId = audioEngine.playNoise({
        type: 'white',
        duration: null,
        gain,
        pan,
      });
      const parameters = { gain, pan };
      return {
        nodeId,
        detail: `White noise · gain ${gain.toFixed(2)}`,
        parameters,
        meta: {
          type: 'noise',
          color: 'white',
        },
      };
    },
    update: (track, params = {}) => {
      audioEngine.updateNoise(track.nodeId, params);
      return {
        detail: `White noise · gain ${params.gain.toFixed(2)}`,
        meta: {
          gain: params.gain,
          pan: params.pan,
        },
      };
    },
    describe: (params = {}) => `White · gain ${Number(params.gain ?? 0.18).toFixed(2)}`,
  },
  'noise-pink': {
    label: 'Noise • Pink spectrum',
    description: '1/f pink noise with gentle energy taper, supportive for relaxation.',
    params: [
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.18,
        live: true,
      },
      {
        id: 'pan',
        label: 'Stereo pan',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        live: true,
      },
    ],
    start: (params = {}) => {
      const gain = Number(params.gain ?? 0.18);
      const pan = Number(params.pan ?? 0);
      const nodeId = audioEngine.playNoise({
        type: 'pink',
        duration: null,
        gain,
        pan,
      });
      const parameters = { gain, pan };
      return {
        nodeId,
        detail: `Pink noise · gain ${gain.toFixed(2)}`,
        parameters,
        meta: {
          type: 'noise',
          color: 'pink',
        },
      };
    },
    update: (track, params = {}) => {
      audioEngine.updateNoise(track.nodeId, params);
      return {
        detail: `Pink noise · gain ${params.gain.toFixed(2)}`,
        meta: {
          gain: params.gain,
          pan: params.pan,
        },
      };
    },
    describe: (params = {}) => `Pink · gain ${Number(params.gain ?? 0.18).toFixed(2)}`,
  },
  'noise-brown': {
    label: 'Noise • Brown spectrum',
    description: 'Low-frequency weighted brown noise ideal for grounding and masking.',
    params: [
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.22,
        live: true,
      },
      {
        id: 'pan',
        label: 'Stereo pan',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        live: true,
      },
    ],
    start: (params = {}) => {
      const gain = Number(params.gain ?? 0.22);
      const pan = Number(params.pan ?? 0);
      const nodeId = audioEngine.playNoise({
        type: 'brown',
        duration: null,
        gain,
        pan,
      });
      const parameters = { gain, pan };
      return {
        nodeId,
        detail: `Brown noise · gain ${gain.toFixed(2)}`,
        parameters,
        meta: {
          type: 'noise',
          color: 'brown',
        },
      };
    },
    update: (track, params = {}) => {
      audioEngine.updateNoise(track.nodeId, params);
      return {
        detail: `Brown noise · gain ${params.gain.toFixed(2)}`,
        meta: {
          gain: params.gain,
          pan: params.pan,
        },
      };
    },
    describe: (params = {}) => `Brown · gain ${Number(params.gain ?? 0.22).toFixed(2)}`,
  },
  martigliOscillation: {
    label: 'Martigli oscillation • Breathing tone',
    description:
      'Carrier frequency modulated by the global Martigli breathing controller.',
    params: [
      {
        id: 'baseFrequency',
        label: 'Base frequency',
        type: 'range',
        min: 40,
        max: 2000,
        step: 1,
        unit: 'Hz',
        default: 200,
        live: true,
      },
      {
        id: 'amplitude',
        label: 'Modulation amplitude',
        type: 'range',
        min: 0,
        max: 500,
        step: 1,
        unit: 'Hz',
        default: 100,
        live: true,
      },
      {
        id: 'gain',
        label: 'Gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.2,
        live: true,
      },
      {
        id: 'pan',
        label: 'Stereo pan',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        live: true,
        formatValue: (value) => {
          if (!Number.isFinite(value)) return '0';
          if (Math.abs(value) < 0.01) return 'Center';
          return value > 0
            ? `Right ${value.toFixed(2)}`
            : `Left ${Math.abs(value).toFixed(2)}`;
        },
      },
    ],
    start(params = {}) {
      const baseFrequency = Number(params.baseFrequency ?? 200);
      const amplitude = Number(params.amplitude ?? 100);
      const gain = Number(params.gain ?? 0.2);
      const pan = Number(params.pan ?? 0);

      const nodeId = audioEngine.playMartigliOscillation({
        baseFrequency,
        amplitude,
        gain,
        pan,
      });

      const detail = this.describe(params);
      return {
        nodeId,
        detail,
        parameters: {
          baseFrequency,
          amplitude,
          gain,
          pan,
        },
        meta: {
          type: 'martigliOscillation',
          baseFrequency,
          amplitude,
          gain,
          pan,
        },
      };
    },
    update(track, params = {}) {
      audioEngine.updateMartigliOscillation(track.nodeId, {
        baseFrequency: params.baseFrequency,
        amplitude: params.amplitude,
        gain: params.gain,
        pan: params.pan,
      });
      return {
        detail: this.describe(params),
        meta: {
          baseFrequency: params.baseFrequency,
          amplitude: params.amplitude,
          gain: params.gain,
          pan: params.pan,
        },
      };
    },
    describe: (params = {}) => {
      const base = Number(params.baseFrequency ?? 200);
      const amp = Number(params.amplitude ?? 100);
      const min = base - amp;
      const max = base + amp;
      return `Martigli ${base.toFixed(0)} Hz ± ${amp.toFixed(0)} Hz (${min.toFixed(0)}-${max.toFixed(0)} Hz)`;
    },
  },
  martigliMix: {
    label: 'Martigli-Mix • Multi-pattern breathing',
    description:
      'Combines binaural beat, monaural beat, and isochronic pulses, all modulated by Martigli breathing.',
    params: [
      {
        id: 'baseFrequency',
        label: 'Base carrier frequency',
        type: 'range',
        min: 40,
        max: 2000,
        step: 1,
        unit: 'Hz',
        default: 200,
        live: true,
      },
      {
        id: 'amplitude',
        label: 'Modulation amplitude',
        type: 'range',
        min: 0,
        max: 500,
        step: 1,
        unit: 'Hz',
        default: 100,
        live: true,
      },
      {
        id: 'beatFrequency',
        label: 'Beat frequency',
        type: 'range',
        min: 0.5,
        max: 40,
        step: 0.1,
        unit: 'Hz',
        default: 10,
        live: true,
      },
      {
        id: 'isochronicRate',
        label: 'Isochronic pulse rate',
        type: 'range',
        min: 0.5,
        max: 30,
        step: 0.1,
        unit: 'Hz',
        default: 6,
        live: true,
      },
      {
        id: 'binauralGain',
        label: 'Binaural gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.2,
        live: true,
      },
      {
        id: 'monauralGain',
        label: 'Monaural gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.2,
        live: true,
      },
      {
        id: 'isochronicGain',
        label: 'Isochronic gain',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.15,
        live: true,
      },
    ],
    start(params = {}) {
      const baseFrequency = Number(params.baseFrequency ?? 200);
      const amplitude = Number(params.amplitude ?? 100);
      const beatFrequency = Number(params.beatFrequency ?? 10);
      const isochronicRate = Number(params.isochronicRate ?? 6);
      const binauralGain = Number(params.binauralGain ?? 0.2);
      const monauralGain = Number(params.monauralGain ?? 0.2);
      const isochronicGain = Number(params.isochronicGain ?? 0.15);

      const nodeId = audioEngine.playMartigliMix({
        baseFrequency,
        amplitude,
        beatFrequency,
        isochronicRate,
        binauralGain,
        monauralGain,
        isochronicGain,
      });

      const detail = this.describe(params);
      return {
        nodeId,
        detail,
        parameters: {
          baseFrequency,
          amplitude,
          beatFrequency,
          isochronicRate,
          binauralGain,
          monauralGain,
          isochronicGain,
        },
        meta: {
          type: 'martigliMix',
          baseFrequency,
          amplitude,
          beatFrequency,
          isochronicRate,
          binauralGain,
          monauralGain,
          isochronicGain,
        },
      };
    },
    update(track, params = {}) {
      audioEngine.updateMartigliMix(track.nodeId, {
        baseFrequency: params.baseFrequency,
        amplitude: params.amplitude,
        beatFrequency: params.beatFrequency,
        isochronicRate: params.isochronicRate,
        binauralGain: params.binauralGain,
        monauralGain: params.monauralGain,
        isochronicGain: params.isochronicGain,
      });
      return {
        detail: this.describe(params),
        meta: {
          baseFrequency: params.baseFrequency,
          amplitude: params.amplitude,
          beatFrequency: params.beatFrequency,
          isochronicRate: params.isochronicRate,
          binauralGain: params.binauralGain,
          monauralGain: params.monauralGain,
          isochronicGain: params.isochronicGain,
        },
      };
    },
    describe: (params = {}) => {
      const base = Number(params.baseFrequency ?? 200);
      const amp = Number(params.amplitude ?? 100);
      const beat = Number(params.beatFrequency ?? 10);
      const iso = Number(params.isochronicRate ?? 6);
      return `Martigli-Mix ${base.toFixed(0)}Hz ±${amp.toFixed(0)}Hz • Beat ${beat.toFixed(1)}Hz • Pulse ${iso.toFixed(1)}Hz`;
    },
  },
};

const audioParameterState = new Map();
let audioParameterPreviewEl = null;

const getStepPrecision = (step = 1) => {
  if (!step) return 0;
  if (Number.isInteger(step)) return 0;
  const stepString = step.toString();
  if (stepString.includes('e-')) {
    const exponent = Number(stepString.split('e-')[1]);
    return Number.isFinite(exponent) ? exponent : 0;
  }
  const decimals = stepString.split('.')[1];
  return decimals ? decimals.length : 0;
};

const normalizeParameterValue = (field, rawValue) => {
  if (!field) return rawValue;
  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    const fallback =
      options.find((option) => option.value === field.default) ?? options[0] ?? null;
    if (options.length > 0) {
      const current =
        options.find((option) => option.value === rawValue) ??
        options.find((option) => option.value === String(rawValue)) ??
        fallback;
      return current ? current.value : (fallback?.value ?? '');
    }
    return rawValue ?? field.default ?? '';
  }

  let value = Number(rawValue);
  if (!Number.isFinite(value)) {
    value = Number(field.default ?? field.min ?? 0);
  }
  if (field.min !== undefined) {
    value = Math.max(field.min, value);
  }
  if (field.max !== undefined) {
    value = Math.min(field.max, value);
  }
  if (field.step) {
    const step = Number(field.step);
    if (Number.isFinite(step) && step > 0) {
      value = Math.round(value / step) * step;
    }
  }
  return Number.isFinite(value) ? value : 0;
};

const coerceFrequencyParameters = (preset, targetState, mode) => {
  if (!preset || !targetState) return;
  const params = getPresetParams(preset);
  if (!params.length) return;
  const baseField = params.find((field) => field.id === 'base');
  const beatField = params.find((field) => field.id === 'beat');
  const leftField = params.find((field) => field.id === 'leftFrequency');
  const rightField = params.find((field) => field.id === 'rightFrequency');
  if (!baseField || !beatField || !leftField || !rightField) return;

  const baseValue = normalizeParameterValue(baseField, targetState.base);
  const beatValue = normalizeParameterValue(beatField, targetState.beat);
  const leftValue = normalizeParameterValue(leftField, targetState.leftFrequency);
  const rightValue = normalizeParameterValue(rightField, targetState.rightFrequency);

  if (mode === 'absolute') {
    const nextLeft = normalizeParameterValue(leftField, baseValue - beatValue / 2);
    const nextRight = normalizeParameterValue(rightField, baseValue + beatValue / 2);
    targetState.base = baseValue;
    targetState.beat = beatValue;
    targetState.leftFrequency = nextLeft;
    targetState.rightFrequency = nextRight;
    return;
  }

  const averageBase = (leftValue + rightValue) / 2;
  const difference = Math.abs(rightValue - leftValue);
  const nextBase = normalizeParameterValue(baseField, averageBase);
  const nextBeat = normalizeParameterValue(beatField, difference);
  targetState.base = nextBase;
  targetState.beat = nextBeat;
  targetState.leftFrequency = leftValue;
  targetState.rightFrequency = rightValue;
};

const formatParameterValue = (field, value) => {
  if (field?.formatValue) {
    try {
      return field.formatValue(value);
    } catch (error) {
      console.warn('Parameter formatValue failed', error);
    }
  }
  if (!Number.isFinite(value)) return String(value ?? '');
  const precision = Math.min(getStepPrecision(field.step || 0.01), 4);
  const formatted = value.toFixed(precision);
  return field.unit ? `${formatted}${field.unit}` : formatted;
};

const getPresetDefaults = (presetKey) => {
  const preset = audioPresets[presetKey];
  const params = getPresetParams(preset);
  if (!params.length) return {};
  const defaults = {};
  params.forEach((field) => {
    defaults[field.id] = normalizeParameterValue(field, field.default ?? field.min ?? 0);
  });
  return defaults;
};

const ensurePresetState = (presetKey) => {
  if (!audioParameterState.has(presetKey)) {
    audioParameterState.set(presetKey, getPresetDefaults(presetKey));
  }
  return audioParameterState.get(presetKey);
};

const getPresetParameterValues = (presetKey) => {
  const preset = audioPresets[presetKey];
  const params = getPresetParams(preset);
  if (!params.length) return {};
  const state = ensurePresetState(presetKey);
  const values = {};
  params.forEach((field) => {
    values[field.id] = normalizeParameterValue(field, state[field.id]);
  });
  return values;
};

const cloneSharedDefaults = (presetKey) =>
  sharedAudioDefaults.get(presetKey)
    ? { ...sharedAudioDefaults.get(presetKey) }
    : clonePresetDefaults(presetKey) || {};

const buildPresetParameters = (presetKey, overrides = {}) => {
  const preset = audioPresets[presetKey];
  if (!preset) return { ...overrides };
  const params = { ...cloneSharedDefaults(presetKey), ...(overrides || {}) };
  const fields = getPresetParams(preset);
  if (!fields.length) {
    return params;
  }
  const normalized = {};
  fields.forEach((field) => {
    const value =
      params[field.id] !== undefined ? params[field.id] : field.default ?? field.min ?? 0;
    normalized[field.id] = normalizeParameterValue(field, value);
  });
  return normalized;
};

const refreshPresetLibraryData = () => {
  presetLibraryState.audio = listAudioPresets();
  presetLibraryState.sessions = listSessionPresets();
  presetDebug('Library data refreshed', {
    audioCount: presetLibraryState.audio.length,
    sessionCount: presetLibraryState.sessions.length,
  });
};

const setPresetTab = (tab) => {
  presetLibraryState.activeTab = tab === 'sessions' ? 'sessions' : 'audio';
  renderPresetLibrary();
};

const refreshPresetLibrary = async () => {
  try {
    presetDebug('Reloading preset catalog…');
    await reloadPresetCatalog();
  } catch (error) {
    console.warn('[Presets] Unable to reload catalog', error);
  }
  refreshPresetLibraryData();
  renderPresetLibrary();
};

const toSearchableString = (value) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const getPresetOwnerMetadata = (item = {}) => {
  const metadata = item.metadata || {};
  return {
    ownerLabel: toSearchableString(item.ownerLabel || metadata.ownerLabel || metadata.owner),
    ownerEmail: toSearchableString(item.ownerEmail || metadata.ownerEmail),
    createdBy: toSearchableString(item.createdBy || metadata.createdBy),
  };
};

const describePresetOwner = (item = {}) => {
  const { ownerLabel, ownerEmail, createdBy } = getPresetOwnerMetadata(item);
  if (ownerLabel) return ownerLabel;
  if (ownerEmail) return ownerEmail;
  if (createdBy) {
    const suffix = String(createdBy).slice(-6);
    return `User #${suffix}`;
  }
  return '';
};

const presetBelongsToCurrentUser = (item) => {
  const user = authState.currentUser;
  if (!user?.uid) return false;
  const { ownerEmail, createdBy } = getPresetOwnerMetadata(item);
  if (createdBy && createdBy === user.uid) {
    return true;
  }
  const userEmail = user.email ? user.email.toLowerCase() : '';
  if (userEmail) {
    if (ownerEmail && ownerEmail.toLowerCase() === userEmail) {
      return true;
    }
  }
  return false;
};

const getOwnerFilterState = (needle) => {
  if (!needle) return null;
  const lower = needle.toLowerCase();
  const userEmail = authState.currentUser?.email?.toLowerCase() || '';
  if (
    lower === 'me' ||
    lower === 'mine' ||
    lower === 'owner:me' ||
    lower === 'user:me' ||
    (userEmail && lower === userEmail)
  ) {
    return { type: 'self' };
  }
  if (lower.startsWith('owner:')) {
    const value = lower.slice(6).trim();
    if (value) return { type: 'explicit', value };
  }
  if (lower.startsWith('user:')) {
    const value = lower.slice(5).trim();
    if (value) return { type: 'explicit', value };
  }
  return null;
};

const matchesOwnerQuery = (item, ownerFilterState) => {
  if (!ownerFilterState) return false;
  if (ownerFilterState.type === 'self') {
    return presetBelongsToCurrentUser(item);
  }
  const target = (ownerFilterState.value || '').toLowerCase();
  if (!target) return false;
  const { ownerLabel, ownerEmail, createdBy } = getPresetOwnerMetadata(item);
  if (ownerLabel && ownerLabel.toLowerCase().includes(target)) return true;
  if (ownerEmail && ownerEmail.toLowerCase().includes(target)) return true;
  if (createdBy && String(createdBy).toLowerCase().includes(target)) return true;
  return false;
};

const filterPresets = (list) => {
  const rawFilter = (presetLibraryState.filter || '').trim();
  if (!rawFilter) return list;
  const needle = rawFilter.toLowerCase();
  const ownerFilterState = getOwnerFilterState(needle);

  return list.filter((item) => {
    if (matchesOwnerQuery(item, ownerFilterState)) {
      return true;
    }
    const { ownerLabel, ownerEmail, createdBy } = getPresetOwnerMetadata(item);
    const haystack = [
      item.label,
      item.description,
      ...(item.tags || []),
      item.folderId,
      ownerLabel,
      ownerEmail,
      createdBy,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
};

const renderPresetList = (list, targetEl, type = 'audio') => {
  if (!targetEl) return;
  targetEl.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-gray-400';
    if (presetLibraryState.filter) {
      const hint =
        type === 'audio'
          ? `No track presets match "${presetLibraryState.filter}".`
          : `No session presets match "${presetLibraryState.filter}".`;
      empty.textContent =
        `${hint} Clear the search box or click ✕ to reset the filter.`;
    } else {
      empty.textContent =
        type === 'audio' ? 'No track presets found.' : 'No session presets found.';
    }
    presetDebug(`Preset list empty (${type}).`);
    targetEl.appendChild(empty);
    return;
  }

  list.forEach((item) => {
    const container = document.createElement('div');
    container.className = 'preset-item';

    const info = document.createElement('div');
    info.className = 'preset-item-info';
    const labelEl = document.createElement('label');
    labelEl.textContent = item.label;
    const meta = document.createElement('span');
    const metaParts = [];
    const ownerDisplay = describePresetOwner(item);
    if (ownerDisplay) {
      metaParts.push(ownerDisplay);
    }
    if (item.folderId) {
      metaParts.push(`#${item.folderId}`);
    }
    const createdDisplay = formatDateTime(item.createdAt);
    if (createdDisplay && createdDisplay !== '—') {
      metaParts.push(createdDisplay);
    }
    meta.textContent = metaParts.join(' • ') || '—';
    info.appendChild(labelEl);
    if (item.description) {
      const desc = document.createElement('span');
      desc.textContent = item.description;
      info.appendChild(desc);
    }
    info.appendChild(meta);

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.textContent = type === 'audio' ? 'Load track' : 'Load session';
    loadBtn.addEventListener('click', () => {
      if (type === 'audio') {
        handleLoadAudioPresetFromLibrary(item.id);
      } else {
        handleLoadSessionPresetFromLibrary(item.id);
      }
    });

    container.appendChild(info);
    container.appendChild(loadBtn);
    targetEl.appendChild(container);
  });
};

const renderPresetLibrary = () => {
  if (!presetAudioListEl || !presetSessionListEl) return;

  const filteredAudio = filterPresets(presetLibraryState.audio);
  const filteredSessions = filterPresets(presetLibraryState.sessions);
  presetDebug('Rendering preset lists', {
    tab: presetLibraryState.activeTab,
    filter: presetLibraryState.filter,
    audioFiltered: filteredAudio.length,
    sessionsFiltered: filteredSessions.length,
  });
  if (presetSearchInput && presetSearchInput.value !== presetLibraryState.filter) {
    presetSearchInput.value = presetLibraryState.filter;
  }

  renderPresetList(filteredAudio, presetAudioListEl, 'audio');
  renderPresetList(filteredSessions, presetSessionListEl, 'sessions');

  if (presetLibraryState.activeTab === 'audio') {
    presetAudioListEl.classList.remove('hidden');
    presetSessionListEl.classList.add('hidden');
  } else {
    presetAudioListEl.classList.add('hidden');
    presetSessionListEl.classList.remove('hidden');
  }

  presetTabButtons.forEach((btn) => {
    const tab = btn.dataset.presetTab;
    const isActive = tab === presetLibraryState.activeTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
};

const handleLoadAudioPresetFromLibrary = async (presetId) => {
  if (!presetId || !audioMenu) return;
  presetDebug('Load track preset requested', { presetId });
  const catalogPreset =
    presetLibraryState.audio.find((item) => item.id === presetId) ||
    presetLibraryState.audio.find((item) => item.basePresetId === presetId);

  const targetPresetId =
    audioPresets[presetId]
      ? presetId
      : catalogPreset?.basePresetId || catalogPreset?.metadata?.presetKey || catalogPreset?.category;

  if (!targetPresetId || !audioPresets[targetPresetId]) {
    console.warn('[Presets] Track preset not available locally:', presetId);
    return;
  }

  audioMenu.value = targetPresetId;
  const preset = audioPresets[targetPresetId];
  const state = ensurePresetState(targetPresetId);
  const params = getPresetParams(preset);
  const presetDefaults = catalogPreset?.defaults || {};

  params.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(presetDefaults, field.id)) {
      state[field.id] = normalizeParameterValue(field, presetDefaults[field.id]);
    } else {
      state[field.id] = normalizeParameterValue(field, field.default ?? field.min ?? 0);
    }
  });
  renderAudioParameterForm();
  updateAudioDescription();
  const displayLabel = catalogPreset?.label || preset.label;
  if (statusEl) {
    statusEl.textContent = `Preset "${displayLabel}" loaded. Starting track…`;
  }
  try {
    const startParams = getPresetParameterValues(targetPresetId);
    presetDebug('Starting track preset', {
      presetId: targetPresetId,
      label: displayLabel,
      params: startParams,
    });
    await startAudioPresetTrack(targetPresetId, startParams, {
      source: 'library',
      label: displayLabel,
      category: 'library',
    });
    renderAudioTracks({
      message: `Preset "${displayLabel}" started via library.`,
    });
  } catch (error) {
    console.error('[Presets] Failed to start track from library', error);
    if (statusEl) statusEl.textContent = 'Unable to start preset track. Check console.';
  }
  renderPresetLibrary();
};

const handleLoadSessionPresetFromLibrary = (presetId) => {
  if (!presetId) return;
  presetDebug('Load session preset requested', { presetId });
  const preset = cloneSessionPreset(presetId);
  if (!preset) {
    console.warn('[Presets] Session preset not found:', presetId);
    return;
  }
  if (statusEl) statusEl.textContent = `Launching session "${preset.label}"…`;
  scheduleSessionPlayback(preset, {});
};

const captureCurrentSessionSnapshot = (label = 'Session Snapshot') => {
  const tracks = getAllAudioTracks();
  if (!tracks.length) return null;
  presetDebug('Capturing session snapshot', { trackCount: tracks.length });
  const voices = tracks.map(([trackId, track], index) => ({
    presetId: track.presetKey,
    label: track.label || `Voice ${index + 1}`,
    startOffsetSec: 0,
    durationSec: null,
    gain:
      typeof track.parameters?.gain === 'number'
        ? Number(track.parameters.gain)
        : null,
    params: track.parameters || {},
    martigli: track.meta?.martigliConfig || {},
  }));
  return {
    label,
    description: '',
    voices,
    symmetryTrack: { enabled: false },
    scheduling: { type: 'one-shot', startUtc: null },
    metadata: {
      trackCount: voices.length,
    },
  };
};

const startAudioPresetTrack = async (presetKey, overrideParams = {}, options = {}) => {
  const preset = audioPresets[presetKey];
  if (!preset) return null;

  const params = buildPresetParameters(presetKey, overrideParams);

  const engine = await ensureAudioEngine({ userInitiated: !!options.userInitiated });
  if (!engine) return null;
  await engine.resume?.();

  const result = preset.start(params);
  if (!result || !result.nodeId) {
    throw new Error(`Preset "${presetKey}" did not return a node id`);
  }

  const trackId = options.trackId || generateTrackId('audio');
  const parameters = { ...(result.parameters || params) };
  const detailText =
    result.detail || (typeof preset.describe === 'function' ? preset.describe(parameters) : '');
  const trackLabel = options.label || preset.label;
  const trackMeta = {
    ...(result.meta || { type: presetKey }),
    source: options.source || 'manual',
    sessionId: options.sessionId || null,
  };

  addAudioTrack(trackId, {
    presetKey,
    label: trackLabel,
    detail: detailText,
    nodeId: result.nodeId,
    parameters,
    startedAt: Date.now(),
    finalized: false,
    meta: trackMeta,
    uiCollapsed: options.uiCollapsed ?? false,
  });
  incrementAudioAdds();
  recordUsageEvent('audio_add', {
    label: trackLabel,
    presetKey,
    category: options.category || 'audio',
    count: 1,
    meta: trackMeta,
    parameters,
    source: options.source || 'manual',
  });

  return {
    trackId,
    presetKey,
    label: trackLabel,
    detail: detailText,
    parameters,
  };
};

const stopAudioTrackById = (trackId, reason = 'auto_stop') => {
  const track = getAudioTrack(trackId);
  if (!track) return null;

  if (audioEngine && track.nodeId) {
    try {
      audioEngine.stop(track.nodeId);
    } catch (error) {
      console.warn('Failed to stop audio track', error);
    }
  }

  finalizeTrack(track, 'audio');
  removeAudioTrack(trackId);
  recordUsageEvent('audio_stop', {
    label: track.label,
    presetKey: track.presetKey || null,
    reason,
  });
  return track;
};

const clearSessionTimers = () => {
  sessionTimers.forEach((timerId) => clearTimeout(timerId));
  sessionTimers.clear();
};

const scheduleSessionPlayback = (session, voiceOverrides = {}) => {
  if (!session?.voices || !session.voices.length) return;

  const now = Date.now();
  const startUtcMs = session.startUtc ? Date.parse(session.startUtc) : NaN;
  const sessionStartMs =
    Number.isFinite(startUtcMs) && startUtcMs > 0 ? startUtcMs : now;
  const baseDelay = Math.max(0, sessionStartMs - now);

  if (statusEl) {
    if (baseDelay > 0) {
      statusEl.textContent = `Session "${session.label}" scheduled for ${formatDateTime(
        sessionStartMs
      )}.`;
    } else {
      statusEl.textContent = `Session "${session.label}" starting now.`;
    }
  }

  session.voices.forEach((voice, index) => {
    const voiceIndexKey = String(index);
    const overrideForVoice =
      voiceOverrides?.[voiceIndexKey] ??
      voiceOverrides?.[index] ??
      voiceOverrides?.[voice.label] ??
      {};
    const mergedParams = {
      ...(voice.params || {}),
      ...(overrideForVoice || {}),
    };
    if (voice.gain !== undefined && voice.gain !== null) {
      mergedParams.gain = voice.gain;
    }

    const delayMs = baseDelay + Math.max(0, (voice.startOffsetSec || 0) * 1000);
    const timerId = setTimeout(async () => {
      sessionTimers.delete(timerId);
      try {
        const result = await startAudioPresetTrack(voice.presetId, mergedParams, {
          label: voice.label || audioPresets[voice.presetId]?.label,
          source: 'session',
          category: `session:${session.id}`,
          uiCollapsed: true,
          sessionId: session.id,
        });
        if (result) {
          const count = getAllAudioTracks().length;
          renderAudioTracks({
            message: `Started ${result.label} (${session.label}). ${count} audio layer${
              count === 1 ? '' : 's'
            } active.`,
          });
          if (voice.durationSec && voice.durationSec > 0) {
            const stopTimer = setTimeout(() => {
              sessionTimers.delete(stopTimer);
              const stopped = stopAudioTrackById(result.trackId, 'session_auto_stop');
              const remaining = getAllAudioTracks().length;
              const message = stopped
                ? `Stopped ${stopped.label}. ${remaining} audio layer${
                    remaining === 1 ? '' : 's'
                  } active.`
                : `${remaining} audio layer${remaining === 1 ? '' : 's'} active.`;
              renderAudioTracks({ message });
            }, voice.durationSec * 1000);
            sessionTimers.add(stopTimer);
          }
        }
      } catch (error) {
        console.error('Failed to start session voice', error);
      }
    }, delayMs);
    sessionTimers.add(timerId);
  });
};

const applyUrlPresetConfig = () => {
  const { presetId, mergedPreset, sessionId, overrides } = urlPresetConfig || {};

  if (presetId && audioPresets[presetId]) {
    if (audioMenu) {
      audioMenu.value = presetId;
    }
    const state = ensurePresetState(presetId);
    if (mergedPreset && typeof mergedPreset === 'object') {
      Object.assign(state, mergedPreset);
    }
    const preset = audioPresets[presetId];
    const params = getPresetParams(preset);
    params.forEach((field) => {
      state[field.id] = normalizeParameterValue(field, state[field.id]);
    });
  }

  if (sessionId) {
    const sessionPreset = cloneSessionPreset(sessionId);
    if (sessionPreset) {
      scheduleSessionPlayback(sessionPreset, overrides?.voices || {});
    } else {
      console.warn(`[Presets] Session preset not found: ${sessionId}`);
    }
  }
};

const createParameterControl = (field, value, { context = 'form', onInput } = {}) => {
  const wrapper = document.createElement('div');
  wrapper.className = context === 'track' ? 'track-parameter-field' : 'parameter-field';

  const label = document.createElement('label');
  label.className = context === 'track' ? 'track-parameter-label' : 'parameter-label';
  label.textContent = field.label;

  const inputs = document.createElement('div');
  inputs.className = context === 'track' ? 'track-parameter-inputs' : 'parameter-inputs';

  const valueDisplay = document.createElement('span');
  valueDisplay.className =
    context === 'track' ? 'track-parameter-value' : 'parameter-value';

  const inputId = `${context}-param-${field.id}-${Math.random().toString(36).slice(2, 8)}`;
  label.htmlFor = inputId;

  const applyValue = (nextValue, emit = true) => {
    const normalized = normalizeParameterValue(field, nextValue);
    if (Number.isFinite(normalized)) {
      if (rangeInput) rangeInput.value = normalized;
      if (numberInput) numberInput.value = normalized;
    }
    valueDisplay.textContent = formatParameterValue(field, normalized);
    if (emit && typeof onInput === 'function') {
      if (context === 'track') {
        if (applyValue._raf) cancelAnimationFrame(applyValue._raf);
        applyValue._raf = requestAnimationFrame(() => {
          onInput(normalized);
          applyValue._raf = null;
        });
      } else {
        onInput(normalized);
      }
    }
  };

  let rangeInput = null;
  let numberInput = null;

  switch (field.type) {
    case 'range': {
      rangeInput = document.createElement('input');
      rangeInput.type = 'range';
      rangeInput.id = inputId;
      rangeInput.dataset.paramId = field.id;
      if (field.min !== undefined) rangeInput.min = field.min;
      if (field.max !== undefined) rangeInput.max = field.max;
      if (field.step !== undefined) rangeInput.step = field.step;
      rangeInput.value = value;
      rangeInput.setAttribute('aria-label', field.label);
      rangeInput.addEventListener('input', (event) => {
        applyValue(event.target.value, true);
      });
      inputs.appendChild(rangeInput);

      numberInput = document.createElement('input');
      numberInput.type = 'number';
      numberInput.className =
        context === 'track' ? 'track-parameter-number' : 'parameter-number';
      if (field.min !== undefined) numberInput.min = field.min;
      if (field.max !== undefined) numberInput.max = field.max;
      if (field.step !== undefined) numberInput.step = field.step;
      numberInput.value = value;
      numberInput.setAttribute('aria-label', `${field.label} value`);
      const commitNumber = (event) => {
        applyValue(event.target.value, true);
      };
      numberInput.addEventListener('change', commitNumber);
      numberInput.addEventListener('blur', commitNumber);
      inputs.appendChild(numberInput);
      break;
    }
    case 'select': {
      const select = document.createElement('select');
      select.id = inputId;
      select.className =
        context === 'track' ? 'track-parameter-select' : 'parameter-select';
      (field.options || []).forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        if (option.value === value) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', (event) => {
        onInput?.(event.target.value);
      });
      inputs.appendChild(select);
      break;
    }
    default: {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = inputId;
      input.value = value;
      input.addEventListener('change', (event) => {
        onInput?.(event.target.value);
      });
      inputs.appendChild(input);
    }
  }

  valueDisplay.textContent = formatParameterValue(field, value);
  inputs.appendChild(valueDisplay);

  wrapper.appendChild(label);
  wrapper.appendChild(inputs);

  applyValue(value, false);

  return wrapper;
};

const updateAudioPresetSummary = (presetKey, state) => {
  const preset = audioPresets[presetKey];
  if (!preset) return;
  const summary = preset.describe ? preset.describe(state) : '';
  if (audioDescriptionEl) {
    audioDescriptionEl.textContent = summary
      ? `${preset.description} Current: ${summary}.`
      : preset.description;
  }
  if (audioParameterPreviewEl) {
    audioParameterPreviewEl.textContent = summary ? `Current: ${summary}` : '';
  }
};

const applySharedAudioDefaults = () => {
  Object.entries(audioPresets).forEach(([presetId, preset]) => {
    const defaults = sharedAudioDefaults.get(presetId);
    if (!defaults) return;
    const params = getPresetParams(preset);
    params.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(defaults, field.id)) {
        field.default = defaults[field.id];
      }
    });
  });
};

applySharedAudioDefaults();

const renderAudioParameterForm = () => {
  if (!audioParameterPanel || !audioMenu) return;
  const presetKey = audioMenu.value;
  const preset = audioPresets[presetKey];
  audioParameterPanel.innerHTML = '';
  audioParameterPreviewEl = null;

  const params = getPresetParams(preset);
  if (!params.length) {
    audioParameterPanel.classList.add('hidden');
    updateAudioPresetSummary(presetKey, {});
    return;
  }

  audioParameterPanel.classList.remove('hidden');
  const state = ensurePresetState(presetKey);

  const title = document.createElement('h4');
  title.className = 'parameter-panel-title';
  title.textContent = 'Preset parameters';
  audioParameterPanel.appendChild(title);

  params.forEach((field) => {
    const value = normalizeParameterValue(field, state[field.id]);
    state[field.id] = value;
    let visible = true;
    if (typeof field.isVisible === 'function') {
      try {
        visible = field.isVisible(state);
      } catch (error) {
        console.warn('Parameter visibility check failed', error);
      }
    }
    if (!visible) {
      return;
    }
    const control = createParameterControl(field, value, {
      context: 'form',
      onInput: (nextValue) => {
        state[field.id] = nextValue;
        if (field.id === 'frequencyMode') {
          coerceFrequencyParameters(preset, state, nextValue);
        }
        if (field.triggersLayout) {
          renderAudioParameterForm();
        } else {
          updateAudioPresetSummary(presetKey, state);
        }
      },
    });
    audioParameterPanel.appendChild(control);
  });

  audioParameterPreviewEl = document.createElement('p');
  audioParameterPreviewEl.className = 'parameter-preview';
  audioParameterPanel.appendChild(audioParameterPreviewEl);
  updateAudioPresetSummary(presetKey, state);
};
const visualPresets = {
  blink: {
    label: 'Blinking colors',
    description:
      'High-contrast blinking palette to energize focus and breathing cadence.',
    start: () => {
      const targetHz = 4;
      const layer = document.createElement('div');
      layer.className = 'visual-layer';
      layer.style.opacity = '0.9';
      visualLayerContainer.appendChild(layer);

      const palettes = [
        { inner: '#1d4ed8', outer: '#1e293b', scale: 1 },
        { inner: '#0ea5e9', outer: '#0369a1', scale: 1.03 },
        { inner: '#22d3ee', outer: '#14b8a6', scale: 0.98 },
        { inner: '#f97316', outer: '#c2410c', scale: 1.05 },
      ];
      let index = Math.floor(Math.random() * palettes.length);

      const applyPalette = () => {
        const { inner, outer, scale } = palettes[index];
        layer.style.background = `radial-gradient(circle at center, ${inner} 0%, ${outer} 78%)`;
        layer.style.transform = `scale(${scale ?? 1})`;
      };

      applyPalette();
      const interval = 250; // ≈4 Hz
      const timer = setInterval(() => {
        index = (index + 1) % palettes.length;
        applyPalette();
      }, interval);

      let active = true;
      const cleanup = () => {
        if (!active) return;
        active = false;
        clearInterval(timer);
        layer.remove();
      };

      return {
        element: layer,
        detail: '≈4 Hz multicolor pulse.',
        meta: {
          type: 'visual',
          pattern: 'blink',
          freq: targetHz,
        },
        cleanup,
      };
    },
  },
  undulate: {
    label: 'Undulating colors',
    description: 'Slow undulating gradients for ambient relaxation and coherence.',
    start: () => {
      const targetHz = 9;
      const layer = document.createElement('div');
      layer.className = 'visual-layer';
      layer.style.opacity = '0.8';
      visualLayerContainer.appendChild(layer);

      let active = true;
      let phase = Math.random() * Math.PI * 2;
      let frameId = null;
      let last = performance.now();

      const animate = (now) => {
        if (!active) return;
        const delta = (now - last) / 1000;
        last = now;
        const targetHz = 9;
        phase += delta * targetHz * Math.PI * 2;

        const x = 50 + 35 * Math.sin(phase * 0.25);
        const y = 50 + 35 * Math.cos(phase * 0.31);
        const innerHue = (210 + 60 * Math.sin(phase * 0.5)) % 360;
        const midHue = (180 + 50 * Math.sin(phase * 0.35 + Math.PI / 4)) % 360;
        const outerHue = (200 + 40 * Math.cos(phase * 0.42)) % 360;
        const scale = 1 + 0.04 * Math.sin(phase * 0.18);
        const rotate = 2 * Math.sin(phase * 0.12);
        const opacity = 0.75 + 0.15 * Math.sin(phase * 0.1);

        layer.style.background = `radial-gradient(circle at ${x}% ${y}%, hsl(${innerHue}, 90%, 62%) 0%, hsl(${midHue}, 85%, 55%) 55%, hsl(${outerHue}, 80%, 48%) 100%)`;
        layer.style.transform = `scale(${scale.toFixed(
          3
        )}) rotate(${rotate.toFixed(2)}deg)`;
        layer.style.opacity = opacity.toFixed(3);

        frameId = requestAnimationFrame(animate);
      };

      frameId = requestAnimationFrame(animate);

      const cleanup = () => {
        if (!active) return;
        active = false;
        if (frameId) cancelAnimationFrame(frameId);
        layer.remove();
      };

      return {
        element: layer,
        detail: '≈9 Hz hue undulation with spatial drift.',
        meta: {
          type: 'visual',
          pattern: 'undulate',
          freq: targetHz,
        },
        cleanup,
      };
    },
  },
};

const updateAudioDescription = () => {
  const preset = audioPresets[audioMenu.value];
  audioDescriptionEl.textContent = preset
    ? preset.description
    : 'Select an audio feature to play.';
};

const updateVisualDescription = () => {
  const preset = visualPresets[visualMenu.value];
  visualDescriptionEl.textContent = preset
    ? preset.description
    : 'Select a visual feature to display.';
};

const handleAudioTrackParameterChange = (trackId, field, value, detailElement) => {
  const track = getAudioTrack(trackId);
  if (!track) return;
  const preset = track.presetKey ? audioPresets[track.presetKey] : null;
  if (!preset || typeof preset.update !== 'function') return;

  const nextParams = {
    ...(track.parameters || {}),
    [field.id]: value,
  };
  if (field.id === 'frequencyMode') {
    coerceFrequencyParameters(preset, nextParams, value);
  }

  try {
    const updateOutcome = preset.update({ ...track }, nextParams);
    if (updateOutcome === false) {
      return;
    }
    const updateResult = updateOutcome || {};
    const descriptor = updateResult.detail
      ? updateResult.detail
      : preset.describe
        ? preset.describe(nextParams)
        : track.detail;

    const updatedTrack = updateAudioTrack(trackId, (current) => ({
      ...current,
      parameters: { ...nextParams },
      detail: descriptor,
      meta: updateResult.meta
        ? { ...(current.meta || {}), ...updateResult.meta }
        : current.meta,
    }));

    const requiresLayoutRefresh = Boolean(field.triggersLayout);

    if (!requiresLayoutRefresh && detailElement && descriptor) {
      detailElement.textContent = descriptor;
    }

    updateStimulationHeaderSummary();
    recordUsageEvent('audio_param_update', {
      label: track.label,
      presetKey: track.presetKey,
      paramId: field.id,
      value,
      parameters: nextParams,
    });

    if (requiresLayoutRefresh) {
      renderAudioTracks();
    }
  } catch (error) {
    console.error('Failed to update audio parameter', error);
  }
};

const renderAudioTracks = ({ message } = {}) => {
  audioActiveList.innerHTML = '';
  const entries = getAllAudioTracks().slice().reverse();
  const count = entries.length;

  audioTrackCount.textContent = `${count} layer${count === 1 ? '' : 's'}`;
  audioActiveEmpty.hidden = count !== 0;
  audioActiveList.hidden = count === 0;

  entries.forEach(([id, track], index) => {
    const item = document.createElement('div');
    item.className = 'track-item audio-track-item';
    if (index === 0) {
      item.classList.add('track-item-latest');
    }

    const info = document.createElement('div');
    info.className = 'track-content pr-4';

    const preset = track?.presetKey ? audioPresets[track.presetKey] : null;
    const defaults = preset?.params ? getPresetDefaults(track.presetKey) : {};
    const paramValues = {
      ...defaults,
      ...(track.parameters || {}),
    };

    if (!track.parameters && preset?.params?.length) {
      updateAudioTrack(id, (current) => ({
        ...current,
        parameters: { ...paramValues },
      }));
    }

    const title = document.createElement('h4');
    title.textContent = track?.label || preset?.label || 'Audio layer';

    const detailText = preset?.describe
      ? preset.describe(paramValues)
      : track.detail || '';
    const detailEl = document.createElement('p');
    detailEl.className = 'text-xs text-gray-500 mt-1';
    detailEl.textContent = detailText;

    const liveParams = getPresetParams(preset)?.filter((field) => field.live !== false) || [];
    const visibleControls = [];
    liveParams.forEach((field) => {
      const value = normalizeParameterValue(field, paramValues[field.id]);
      paramValues[field.id] = value;
      let visible = true;
      if (typeof field.isVisible === 'function') {
        try {
          visible = field.isVisible(paramValues);
        } catch (error) {
          console.warn('Track parameter visibility check failed', error);
        }
      }
      if (!visible) {
        return;
      }
      const control = createParameterControl(field, value, {
        context: 'track',
        onInput: (nextValue) => {
          const normalized = normalizeParameterValue(field, nextValue);
          paramValues[field.id] = normalized;
          handleAudioTrackParameterChange(id, field, normalized, detailEl);
        },
      });
      visibleControls.push(control);
    });

    let controlsContainer = null;
    if (visibleControls.length > 0) {
      controlsContainer = document.createElement('div');
      controlsContainer.className = 'track-parameter-controls';
      visibleControls.forEach((control) => controlsContainer.appendChild(control));
    }

    const header = document.createElement('div');
    header.className = 'track-item-header';
    header.appendChild(title);

    let collapseBtn = null;
    let isCollapsed = Boolean(track.uiCollapsed) && Boolean(controlsContainer);

    if (controlsContainer) {
      collapseBtn = document.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.className = 'track-collapse-btn';
      header.appendChild(collapseBtn);
    }

    info.appendChild(header);
    info.appendChild(detailEl);
    if (controlsContainer) {
      info.appendChild(controlsContainer);
    }

    if (collapseBtn && controlsContainer) {
      const headingText = title.textContent || 'track';
      const applyCollapsedState = (state) => {
        isCollapsed = state;
        item.classList.toggle('track-collapsed', state);
        controlsContainer.hidden = state;
        collapseBtn.setAttribute('aria-expanded', state ? 'false' : 'true');
        collapseBtn.textContent = state ? 'Show controls' : 'Hide controls';
        collapseBtn.setAttribute(
          'aria-label',
          state ? `Show controls for ${headingText}` : `Hide controls for ${headingText}`
        );
      };

      collapseBtn.addEventListener('click', () => {
        const nextState = !isCollapsed;
        applyCollapsedState(nextState);
        updateAudioTrack(id, (current) => ({
          ...current,
          uiCollapsed: nextState,
        }));
      });

      applyCollapsedState(isCollapsed);
    } else if (track.uiCollapsed) {
      updateAudioTrack(id, (current) => ({
        ...current,
        uiCollapsed: false,
      }));
    }

    const actions = document.createElement('div');
    actions.className = 'track-actions';

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.dataset.trackId = id;
    stopButton.textContent = 'Stop';
    stopButton.classList.add('track-stop');

    actions.appendChild(stopButton);

    item.appendChild(info);
    item.appendChild(actions);
    audioActiveList.appendChild(item);
  });

  if (message) {
    statusEl.textContent = message;
  } else if (!audioEngineInitPromise) {
    if (!audioEngine) {
      statusEl.textContent = 'Audio engine idle. Start audio to play tracks.';
    } else if (count === 0) {
      statusEl.textContent = 'Audio engine running. No active layers.';
    } else {
      statusEl.textContent = `${count} audio layer${count === 1 ? '' : 's'} running.`;
    }
  }

  updateStimulationHeaderSummary();
  updateUsageView();
};
const renderVisualTracks = ({ message } = {}) => {
  visualActiveList.innerHTML = '';
  const entries = getAllVisualTracks().slice().reverse();
  const count = entries.length;

  visualTrackCount.textContent = `${count} layer${count === 1 ? '' : 's'}`;
  visualActiveEmpty.hidden = count !== 0;
  visualActiveList.hidden = count === 0;

  entries.forEach(([id, track], index) => {
    const item = document.createElement('div');
    item.className = 'track-item visual-track-item';
    if (index === 0) {
      item.classList.add('track-item-latest');
    }

    const info = document.createElement('div');
    info.className = 'track-content pr-4';

    const title = document.createElement('h4');
    title.textContent = track.label;
    info.appendChild(title);

    if (track.detail) {
      const detail = document.createElement('p');
      detail.textContent = track.detail;
      info.appendChild(detail);
    }

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.dataset.trackId = id;
    stopButton.textContent = 'Stop';
    stopButton.classList.add('track-stop');
    const actions = document.createElement('div');
    actions.className = 'track-actions';
    actions.appendChild(stopButton);

    item.appendChild(info);
    item.appendChild(actions);
    visualActiveList.appendChild(item);
  });

  if (count === 0) {
    visualStatusText.textContent = message ?? 'Visual output appears here once started.';
    visualStatusText.classList.remove('active');
  } else {
    visualStatusText.textContent =
      message ?? `Running ${count} visual layer${count === 1 ? '' : 's'}.`;
    visualStatusText.classList.add('active');
  }

  updateUsageView();
};

const stopAllAudio = ({ message } = {}) => {
  const now = Date.now();
  getAllAudioTracks().forEach(([, track]) => finalizeTrack(track, 'audio', now));

  if (audioEngine) {
    try {
      audioEngine.stopAll();
    } catch (error) {
      console.warn('Failed to stop audio nodes', error);
    }
  }
  clearSessionTimers();
  clearAudioTracks();
  renderAudioTracks({
    message: message ?? 'All audio layers stopped.',
  });
};

const stopAllVisual = ({ message } = {}) => {
  const now = Date.now();
  getAllVisualTracks().forEach(([, track]) => {
    finalizeTrack(track, 'visual', now);
    try {
      track.cleanup();
    } catch (error) {
      console.warn('Failed to stop visual layer', error);
    }
  });
  clearVisualTracks();
  renderVisualTracks({
    message: message ?? 'Visual layers cleared.',
  });
};

const shutdownAudioSession = async ({ message } = {}) => {
  const finalMessage = message || 'Audio engine stopped. Start audio to resume playback.';
  stopAllAudio({ message: finalMessage });
  stopAllVisual({ message: 'Visual layers cleared.' });
  await disposeAudioEngine();
  setAudioControlsIdle(finalMessage);
  updateUsageView();
};

audioMenu.addEventListener('change', () => {
  updateAudioDescription();
  renderAudioParameterForm();
});
visualMenu.addEventListener('change', updateVisualDescription);

presetSearchInput?.addEventListener('input', (event) => {
  presetLibraryState.filter = event.target.value || '';
  renderPresetLibrary();
});

btnClearPresetFilter?.addEventListener('click', () => {
  presetLibraryState.filter = '';
  if (presetSearchInput) {
    presetSearchInput.value = '';
  }
  renderPresetLibrary();
});

presetTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setPresetTab(button.dataset.presetTab);
  });
});

btnRefreshPresets?.addEventListener('click', () => {
  refreshPresetLibrary();
});

btnSaveAudioPreset?.addEventListener('click', async () => {
  if (!audioMenu) return;
  const presetKey = audioMenu.value;
  if (!presetKey) return;
  const params = buildPresetParameters(presetKey, ensurePresetState(presetKey));
  const label = prompt('Name for this track preset:', `${audioPresets[presetKey]?.label || 'Track'} ${new Date().toLocaleTimeString()}`);
  if (!label) return;
  try {
    presetDebug('Saving track preset', { label, presetKey, params });
    await saveAudioPresetSnapshot({
      label,
      presetKey,
      defaults: params,
    });
    await refreshPresetLibrary();
    if (statusEl) statusEl.textContent = `Preset "${label}" saved.`;
  } catch (error) {
    console.error('Failed to save audio preset', error);
    if (statusEl) statusEl.textContent = `Unable to save preset: ${error.message || 'Check authentication/permissions.'}`;
  }
});

btnSaveSessionPreset?.addEventListener('click', async () => {
  const snapshot = captureCurrentSessionSnapshot();
  if (!snapshot) {
    console.warn('[Presets] No audio tracks available for session snapshot.');
    if (statusEl) statusEl.textContent = 'Add at least one audio layer before saving a session.';
    return;
  }
  const label =
    prompt('Name for this session preset:', `${snapshot.label} ${new Date().toLocaleTimeString()}`) ||
    snapshot.label;
  snapshot.label = label;
  try {
    presetDebug('Saving session preset', { label, voices: snapshot.voices?.length });
    await snapshotCurrentSessionPreset(snapshot, { label, visibility: 'private' });
    await refreshPresetLibrary();
    if (statusEl) statusEl.textContent = `Session preset "${label}" saved.`;
  } catch (error) {
    console.error('Failed to save session preset', error);
    if (statusEl) {
      statusEl.textContent = `Unable to save session preset: ${error.message ||
        'Check authentication/permissions'}.`;
    }
  }
});

addAudioBtn.addEventListener('click', async () => {
  const presetKey = audioMenu.value;
  const params = getPresetParameterValues(presetKey);

  try {
    const result = await startAudioPresetTrack(presetKey, params, { source: 'manual' });
    if (!result) return;

    const count = getAllAudioTracks().length;
    renderAudioTracks({
      message: `Started ${result.label}. ${count} audio layer${
        count === 1 ? '' : 's'
      } active.`,
    });
  } catch (error) {
    console.error('Failed to start audio preset', error);
    statusEl.textContent = 'Unable to add audio track.';
  }
});

stopAllAudioBtn.addEventListener('click', () =>
  stopAllAudio({ message: 'All audio layers stopped.' })
);

audioActiveList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-track-id]');
  if (!button) return;

  const trackId = button.dataset.trackId;
  const track = getAudioTrack(trackId);
  if (!track) return;

  if (audioEngine && track.nodeId) {
    try {
      audioEngine.stop(track.nodeId);
    } catch (error) {
      console.warn('Failed to stop audio track', error);
    }
  }

  finalizeTrack(track, 'audio');
  removeAudioTrack(trackId);
  const count = getAllAudioTracks().length;
  renderAudioTracks({
    message:
      count === 0
        ? 'Audio engine running. No active layers.'
        : `Stopped ${track.label}. ${count} audio layer${count === 1 ? '' : 's'} active.`,
  });
});

addVisualBtn.addEventListener('click', () => {
  const presetKey = visualMenu.value;
  const preset = visualPresets[presetKey];
  if (!preset) return;

  try {
    const result = preset.start();
    const cleanup = typeof result?.cleanup === 'function' ? result.cleanup : () => {};

    const trackId = generateTrackId('visual');
    const trackMeta = result?.meta || { type: presetKey };
    addVisualTrack(trackId, {
      presetKey,
      label: preset.label,
      detail: result?.detail || '',
      startedAt: Date.now(),
      finalized: false,
      meta: trackMeta,
      cleanup,
    });
    incrementVisualAdds();
    recordUsageEvent('visual_add', {
      label: preset.label,
      presetKey,
      category: 'visual',
      count: 1,
      meta: trackMeta,
    });

    const count = getAllVisualTracks().length;
    renderVisualTracks({
      message: `Started ${preset.label}. ${count} visual layer${
        count === 1 ? '' : 's'
      } active.`,
    });
  } catch (error) {
    console.error('Failed to start visual preset', error);
    renderVisualTracks({
      message: 'Unable to start visual preset.',
    });
  }
});

stopAllVisualBtn.addEventListener('click', () =>
  stopAllVisual({ message: 'Visual layers cleared.' })
);

visualActiveList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-track-id]');
  if (!button) return;

  const trackId = button.dataset.trackId;
  const track = getVisualTrack(trackId);
  if (!track) return;

  try {
    track.cleanup();
  } catch (error) {
    console.warn('Failed to cleanup visual track', error);
  }

  finalizeTrack(track, 'visual');
  removeVisualTrack(trackId);
  const count = getAllVisualTracks().length;
  renderVisualTracks({
    message:
      count === 0
        ? 'Visual layers cleared.'
        : `Stopped ${track.label}. ${count} visual layer${
            count === 1 ? '' : 's'
          } active.`,
  });
});

initBtn.addEventListener('click', () => {
  ensureAudioEngine({ userInitiated: true });
});

stopBtn.addEventListener('click', async () => {
  recordUsageEvent('session_stop', { reason: 'manual_stop' });
  await shutdownAudioSession({
    message: 'Audio engine stopped. Start audio to resume playback.',
  });
});

applyUrlPresetConfig();
if (presetSearchInput && presetSearchInput.value) {
  presetLibraryState.filter = presetSearchInput.value;
  presetDebug('Preset search pre-filled', { filter: presetLibraryState.filter });
}
refreshPresetLibraryData();
renderPresetLibrary();
updateAudioDescription();
renderAudioParameterForm();
updateVisualDescription();
renderAudioTracks();
renderVisualTracks();
setActiveWorkspace(WORKSPACES.STIMULATION);
updateHeaderSummaries();

// ====================================================================
// Diagnostics Widget Integration
// ====================================================================

const $ = (id) => document.getElementById(id);

/**
 * Updates the floating diagnostics widget UI with system information
 */
async function updateFloatingWidgetUI() {
  try {
    const browser = getBrowserInfo();
    const os = getOSInfo();
    const sys = getSystemInfo();
    const caps = window.deviceCapabilities || {};
    const engines = detectEngines();
    const selected = describeEngines(getEngineSelection());

    // ===== SYSTEM HEALTH ASSESSMENT =====
    const healthData = await assessSystemHealth();

    // Update FAB button color based on health
    const fabButton = $('diag-toggle');
    if (fabButton) {
      fabButton.style.backgroundColor = healthData.health.color;
      fabButton.setAttribute(
        'title',
        `System Health: ${healthData.health.status}\nHardware: ${healthData.hardware.level}\nSoftware: ${healthData.software.level}\nMemory: ${healthData.memory.level}\nNetwork: ${healthData.network.level}`
      );
    }

    // Update health summary card
    const healthIndicator = $('health-indicator');
    if (healthIndicator) {
      healthIndicator.style.backgroundColor = healthData.health.color;
    }

    $('health-status-text').textContent = healthData.health.status;
    $('health-status-text').style.color = healthData.health.color;

    $('health-hardware-text').textContent = healthData.hardware.level;
    $('health-software-text').textContent = healthData.software.level;
    $('health-memory-text').textContent = healthData.memory.level;
    $('health-network-text').textContent = healthData.network.level;

    // Show issues if any
    const issuesContainer = $('health-issues-container');
    const issuesList = $('health-issues-list');
    if (healthData.health.issues.length > 0) {
      issuesContainer.classList.remove('hidden');
      issuesList.innerHTML = healthData.health.issues
        .map((issue) => `<li>${issue}</li>`)
        .join('');
    } else {
      issuesContainer.classList.add('hidden');
    }

    // Engines BSCLab with status indicators
    $('engine-audio-name').textContent = selected.audio.name;

    const audioStatusEl = $('engine-audio-status');
    audioStatusEl.textContent = selected.audio.available
      ? `${selected.audio.description} (disponível)`
      : `${selected.audio.description} (carregar biblioteca)`;
    audioStatusEl.className = selected.audio.available
      ? 'font-mono text-green-600 font-semibold'
      : 'font-mono text-yellow-600';

    $('engine-audio-version').textContent = engines.audio.version || 'N/A';
    $('engine-visual-name').textContent = selected.visual.name;

    const visualStatusEl = $('engine-visual-status');
    visualStatusEl.textContent = selected.visual.available
      ? `${selected.visual.description} (disponível)`
      : `${selected.visual.description} (carregar biblioteca)`;
    visualStatusEl.className = selected.visual.available
      ? 'font-mono text-green-600 font-semibold'
      : 'font-mono text-yellow-600';

    $('engine-visual-version').textContent = engines.visual.version || 'N/A';

    const hapticStatusEl = $('engine-haptic-status');
    $('engine-haptic-name').textContent = selected.haptics.name;
    hapticStatusEl.textContent = selected.haptics.available
      ? `${selected.haptics.description} (disponível)`
      : `${selected.haptics.description} (não suportado)`;
    hapticStatusEl.className = selected.haptics.available
      ? 'font-mono text-green-600 font-semibold'
      : 'font-mono text-yellow-600';

    // Performance & Active Tracks
    const tracksInfo = getActiveTracksInfo();
    const perfMetrics = getPerformanceMetrics();

    $('perf-audio-tracks').textContent = tracksInfo.audioTracksCount || '0';
    $('perf-visual-tracks').textContent = tracksInfo.visualTracksCount || '0';

    if (perfMetrics.memory) {
      $('perf-heap-used').textContent = perfMetrics.memory.usedJSHeapSize + ' MB';
      $('perf-heap-limit').textContent = perfMetrics.memory.jsHeapSizeLimit + ' MB';
      const usageClass =
        perfMetrics.memory.usagePercent > 80
          ? 'text-red-600 font-semibold'
          : perfMetrics.memory.usagePercent > 60
            ? 'text-yellow-600'
            : 'text-green-600';
      $('perf-memory-usage').textContent = perfMetrics.memory.usagePercent + '%';
      $('perf-memory-usage').className = 'font-mono ' + usageClass;
    } else {
      $('perf-heap-used').textContent = 'N/A';
      $('perf-heap-limit').textContent = 'N/A';
      $('perf-memory-usage').textContent = 'N/A';
    }

    if (perfMetrics.timing) {
      $('perf-page-load').textContent =
        perfMetrics.timing.pageLoadTime > 0
          ? perfMetrics.timing.pageLoadTime + ' ms'
          : '--';
      $('perf-dom-interactive').textContent =
        perfMetrics.timing.domInteractive > 0
          ? perfMetrics.timing.domInteractive + ' ms'
          : '--';
    } else {
      $('perf-page-load').textContent = 'N/A';
      $('perf-dom-interactive').textContent = 'N/A';
    }

    // Audio detalhado (async)
    getAudioInfo().then((audio) => {
      // Audio API support with color coding
      const apiEl = $('detailed-audio-api');
      if (audio.supported) {
        apiEl.textContent = 'Suportado ✓';
        apiEl.className = 'font-mono text-green-600 font-semibold';
      } else {
        apiEl.textContent = 'Não Suportado ✗';
        apiEl.className = 'font-mono text-red-600 font-semibold';
      }

      // Sample rate with quality indicator
      const sampleRateEl = $('detailed-sample-rate');
      if (audio.sampleRate) {
        sampleRateEl.textContent = audio.sampleRate + ' Hz';
        sampleRateEl.className =
          audio.sampleRate >= 48000
            ? 'font-mono text-green-600'
            : audio.sampleRate >= 44100
              ? 'font-mono text-yellow-600'
              : 'font-mono text-orange-600';
      } else {
        sampleRateEl.textContent = '--';
        sampleRateEl.className = 'font-mono';
      }

      $('detailed-bit-depth').textContent = audio.bitDepth || '--';
      $('detailed-channels').textContent = audio.maxChannels || '--';

      // Audio state with color coding
      const stateEl = $('detailed-audio-state');
      stateEl.textContent = audio.state || '--';
      stateEl.className =
        audio.state === 'running'
          ? 'font-mono text-green-600'
          : audio.state === 'suspended'
            ? 'font-mono text-yellow-600'
            : 'font-mono';

      $('detailed-audio-playing').textContent = audio.isPlaying || '--';

      // Latency with performance indicators
      const baseLatencyEl = $('detailed-base-latency');
      if (audio.baseLatencyMs) {
        baseLatencyEl.textContent = audio.baseLatencyMs + ' ms';
        baseLatencyEl.className =
          audio.baseLatencyMs <= 10
            ? 'font-mono text-green-600'
            : audio.baseLatencyMs <= 20
              ? 'font-mono text-yellow-600'
              : 'font-mono text-red-600';
      } else {
        baseLatencyEl.textContent = '--';
        baseLatencyEl.className = 'font-mono';
      }

      const outputLatencyEl = $('detailed-output-latency');
      if (audio.outputLatencyMs) {
        outputLatencyEl.textContent = audio.outputLatencyMs + ' ms';
        outputLatencyEl.className =
          audio.outputLatencyMs <= 20
            ? 'font-mono text-green-600'
            : audio.outputLatencyMs <= 50
              ? 'font-mono text-yellow-600'
              : 'font-mono text-red-600';
      } else {
        outputLatencyEl.textContent = '--';
        outputLatencyEl.className = 'font-mono';
      }

      $('detailed-buffer-size').textContent = audio.bufferSize || '--';
      $('detailed-headphones').textContent = audio.headphonesLikely || '--';
      $('detailed-input-devices').textContent =
        audio.inputDevices !== undefined ? audio.inputDevices : '--';
      $('detailed-output-devices').textContent =
        audio.outputDevices !== undefined ? audio.outputDevices : '--';
    });

    // Display & Visual
    const hz = caps.performance?.refresh?.fps;
    $('detailed-screen-res').textContent = `${sys.screenWidth}x${sys.screenHeight}`;
    $('detailed-avail-res').textContent = `${sys.availWidth}x${sys.availHeight}`;
    $('detailed-viewport').textContent = `${sys.viewportWidth}x${sys.viewportHeight}`;
    $('detailed-aspect-ratio').textContent = sys.viewportRatio || '--';
    $('detailed-pixel-ratio').textContent = sys.pixelRatio || '--';
    $('detailed-dpi').textContent = sys.dpi || '--';
    $('detailed-color-depth').textContent = sys.colorDepth
      ? sys.colorDepth + '-bit'
      : '--';
    $('detailed-hdr').textContent = sys.hdrSupport || '--';
    $('detailed-orientation').textContent = sys.orientation || '--';
    $('detailed-multi-monitor').textContent = sys.possibleMultiMonitor || '--';

    // Refresh rate with quality indicator
    const refreshRateEl = $('detailed-refresh-rate');
    if (hz) {
      refreshRateEl.textContent = hz + ' Hz';
      refreshRateEl.className =
        hz >= 120
          ? 'font-mono text-green-600'
          : hz >= 60
            ? 'font-mono text-green-600'
            : hz >= 30
              ? 'font-mono text-yellow-600'
              : 'font-mono text-red-600';
    } else {
      refreshRateEl.textContent = '--';
      refreshRateEl.className = 'font-mono';
    }

    // Hardware & Sistema
    $('detailed-device-model').textContent = browser.deviceModel || '--';
    $('detailed-os').textContent = os.name || '--';
    $('detailed-arch').textContent = os.architecture || '--';
    $('detailed-platform').textContent = os.platform || '--';
    $('detailed-cores').textContent = sys.cores || '--';
    $('detailed-device-memory').textContent = sys.deviceMemoryGB
      ? sys.deviceMemoryGB + ' GB'
      : '--';

    // GPU info
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          $('detailed-gpu-model').textContent = renderer || '--';
        }
        const version = gl.getParameter(gl.VERSION);
        $('detailed-webgl').textContent = version || '--';
      }
    } catch (e) {
      $('detailed-gpu-model').textContent = 'Error';
      $('detailed-webgl').textContent = 'Error';
    }

    // GPU Score with performance indicator
    const gpuScore = caps.performance?.gpu?.score;
    const gpuScoreEl = $('detailed-gpu-score');
    if (typeof gpuScore === 'number') {
      gpuScoreEl.textContent = gpuScore + '/100';
      gpuScoreEl.className =
        gpuScore >= 70
          ? 'font-mono text-green-600 font-semibold'
          : gpuScore >= 40
            ? 'font-mono text-yellow-600'
            : 'font-mono text-red-600';
    } else {
      gpuScoreEl.textContent = '--';
      gpuScoreEl.className = 'font-mono';
    }

    $('detailed-touch').textContent = sys.touchSupport || '--';

    // Battery (async) with status indicators
    getBatteryInfo().then((battery) => {
      const batteryLevelEl = $('detailed-battery-level');
      const batteryChargingEl = $('detailed-battery-charging');

      if (battery.supported) {
        batteryLevelEl.textContent = battery.level + '%';
        batteryLevelEl.className =
          battery.level >= 50
            ? 'font-mono text-green-600'
            : battery.level >= 20
              ? 'font-mono text-yellow-600'
              : 'font-mono text-red-600 font-semibold';

        if (battery.charging) {
          batteryChargingEl.textContent = 'Sim ⚡';
          batteryChargingEl.className = 'font-mono text-blue-600';
        } else {
          batteryChargingEl.textContent = 'Não';
          batteryChargingEl.className = 'font-mono';
        }
      } else {
        batteryLevelEl.textContent = 'N/A';
        batteryLevelEl.className = 'font-mono';
        batteryChargingEl.textContent = 'N/A';
        batteryChargingEl.className = 'font-mono';
      }
    });

    // Browser
    $('detailed-browser-name').textContent = browser.name || '--';
    $('detailed-browser-version').textContent = browser.version || '--';
    $('detailed-browser-engine').textContent = browser.engine || '--';
    $('detailed-browser-vendor').textContent = browser.vendor || '--';
    $('detailed-language').textContent = browser.language || '--';
    $('detailed-online').textContent = sys.online || '--';
    $('detailed-connection').textContent = sys.connection || '--';
    $('detailed-cookies').textContent = sys.cookiesEnabled || '--';
    $('detailed-storage').textContent = sys.storageEnabled || '--';
    $('detailed-dnt').textContent = browser.doNotTrack || '--';

    // Summary
    const deviceIcon = window.deviceCapabilities?.mobile ? '📱' : '💻';
    const mini = `${deviceIcon} ${os.name || 'SO'} · ${
      browser.name || 'Navegador'
    }${typeof gpuScore === 'number' ? ` · GPU ${gpuScore}` : ''}`;
    $('diag-mini-summary').textContent = mini;
  } catch (e) {
    console.error('Error updating widget UI:', e);
  }
}

/**
 * Sends diagnostic report to server and downloads a copy
 */
async function sendReportFlow() {
  const btn = $('btn-send-report');
  const original = btn.textContent;
  btn.disabled = true;
  try {
    const message = $('diag-message').value?.trim() || '';
    const diag = await gatherDiagnostics();
    const report = { ...diag, message };

    // Save to localStorage
    try {
      const reports = JSON.parse(
        localStorage.getItem('biosyncare_diagnostic_reports') || '[]'
      );
      reports.push({ timestamp: Date.now(), report });
      // Keep only last 10 reports
      if (reports.length > 10) reports.shift();
      localStorage.setItem('biosyncare_diagnostic_reports', JSON.stringify(reports));
    } catch (e) {
      console.warn('Failed to save report locally:', e);
    }

    btn.textContent = '✓ Salvo (baixe o JSON)';

    // Always offer a fresh downloadable copy
    downloadReport(report);
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1800);
  } catch (e) {
    console.error(e);
    btn.textContent = 'Falha (ver console)';
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 2000);
  }
}

/**
 * Copies diagnostic data to clipboard
 */
async function copyJsonDiagnostics() {
  const btn = $('btn-copy-json');
  const original = btn.textContent;
  try {
    const diag = await gatherDiagnostics();
    await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
    btn.textContent = '✓ Copiado';
  } catch (e) {
    console.warn('Clipboard falhou, baixando em vez disso.');
    const diag = await gatherDiagnostics();
    downloadReport(diag);
    btn.textContent = 'Baixado';
  } finally {
    setTimeout(() => (btn.textContent = original), 1500);
  }
}

/**
 * Downloads diagnostic report as JSON file
 */
function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `biosyncare-diagnostics-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Initialize diagnostics widget event listeners and update UI
 */
function initDiagnosticsWidget() {
  let updateInterval = null;

  // Wire up toggle button
  $('diag-toggle')?.addEventListener('click', () => {
    const panel = $('diag-panel');
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) {
      panel.classList.add('hidden');
      $('diag-toggle').setAttribute('aria-expanded', 'false');
      // Stop real-time updates when panel closes
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
    } else {
      panel.classList.remove('hidden');
      $('diag-toggle').setAttribute('aria-expanded', 'true');
      updateFloatingWidgetUI();
      // Start real-time updates when panel opens (every 2 seconds)
      if (!updateInterval) {
        updateInterval = setInterval(() => {
          if (!$('diag-panel')?.classList.contains('hidden')) {
            updateFloatingWidgetUI();
          }
        }, 2000);
      }
    }
  });

  // Wire up close button
  $('diag-close')?.addEventListener('click', () => {
    $('diag-panel')?.classList.add('hidden');
    $('diag-toggle')?.setAttribute('aria-expanded', 'false');
    // Stop real-time updates when panel closes
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  });

  // Wire up action buttons
  $('btn-send-report')?.addEventListener('click', sendReportFlow);
  $('btn-copy-json')?.addEventListener('click', copyJsonDiagnostics);
  $('btn-download-json')?.addEventListener('click', async () => {
    const diag = await gatherDiagnostics();
    downloadReport(diag);
  });

  // Update widget when device capabilities are ready
  if (window.deviceCapabilities) {
    updateFloatingWidgetUI();
  } else {
    const capPoll = setInterval(() => {
      if (window.deviceCapabilities) {
        clearInterval(capPoll);
        updateFloatingWidgetUI();
      }
    }, 300);
    // safety stop after ~6s
    setTimeout(() => clearInterval(capPoll), 6000);
  }

  console.log('[BioSynCare] Diagnostics widget initialized with real-time monitoring');
}

// Initialize diagnostics widget
initDiagnosticsWidget();

// ============================================================================
// PWA & Safety Initialization
// ============================================================================
(async () => {
  // Dynamic imports for PWA and safety features
  const { compatChecker } = await import('./core/compat-check.js');
  const { pwaInstaller } = await import('./core/pwa-installer.js');

  // Run compatibility check
  const compatResult = compatChecker.check();
  console.log('[CompatCheck]', compatResult.supported ? 'Fully compatible' : 'Compatibility issues detected');

  if (compatResult.warnings.length > 0) {
    console.warn('[CompatCheck] Warnings:', compatResult.warnings);
  }

  if (compatResult.errors.length > 0) {
    console.error('[CompatCheck] Errors:', compatResult.errors);
  }

  // Register service worker for PWA
  const registration = await pwaInstaller.registerServiceWorker();
  if (registration) {
    console.log('[PWA] Service worker registered successfully');
  } else {
    console.warn('[PWA] Service worker registration failed or not supported');
  }

  // PWA Install Button with smart install/update detection
  const { createInstallButton } = await import('./ui/pwa-install-button.js');

  console.log('[PWA] Creating install button...');
  const installButton = createInstallButton({
    text: pwaInstaller.isInstalled() ? 'App Installed ✓' : 'Install App',
    position: 'bottom-right',
    hideWhenInstalled: false, // Keep visible to show status
    onInstalled: () => {
      console.log('[PWA] App installed successfully!');
      // Show success notification
      showToast('✅ App installed successfully! You can now use it offline.', 'success');
    },
  });

  console.log('[PWA] Install button created:', {
    visible: installButton.visible,
    canInstall: pwaInstaller.canInstall(),
    isInstalled: pwaInstaller.isInstalled(),
  });

  // Listen for install prompt
  pwaInstaller.onInstallable = () => {
    console.log('[PWA] App can be installed - prompt available');
  };

  pwaInstaller.onInstalled = () => {
    console.log('[PWA] App installed successfully!');
    // Update button text
    if (installButton.element) {
      const btn = installButton.element.querySelector('button');
      if (btn) {
        btn.querySelector('span').textContent = 'App Installed ✓';
        btn.style.backgroundColor = '#10b981'; // Green
      }
    }
  };

  pwaInstaller.onUpdateAvailable = (newWorker) => {
    console.log('[PWA] App update available');
    // Show update notification
    showUpdateNotification(newWorker);
  };

  pwaInstaller.onOffline = () => {
    console.warn('[PWA] Connection lost - app running in offline mode');
    // TODO: Show offline indicator in UI
  };

  pwaInstaller.onOnline = () => {
    console.log('[PWA] Connection restored');
    // TODO: Hide offline indicator
  };

  // Log PWA status
  const pwaStatus = pwaInstaller.getStatus();
  console.log('[PWA] Status:', pwaStatus);

  // Safety monitor is automatically initialized with AudioEngine
  // Listen for safety warnings via custom events
  window.addEventListener('audioSafetyWarning', (event) => {
    const { severity, type, message } = event.detail;
    console.warn(`[Safety] ${severity.toUpperCase()}: ${message}`);
    // TODO: Show safety warning in UI (toast notification)
  });

  console.log('[BioSynCare] PWA & Safety systems initialized');

  // Helper: Show toast notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '16px 32px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '10000',
      fontSize: '14px',
      fontWeight: '500',
      maxWidth: '90%',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#6366f1',
      color: 'white',
      opacity: '0',
      transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(toast);

    // Fade in
    setTimeout(() => { toast.style.opacity = '1'; }, 10);

    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Helper: Show update notification
  function showUpdateNotification(newWorker) {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px;">
        <span style="flex: 1;">🔄 App update available!</span>
        <button id="update-btn" style="
          padding: 8px 16px;
          background: white;
          color: #6366f1;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
        ">Update Now</button>
        <button id="dismiss-update-btn" style="
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.2);
          color: white;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>
    `;
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '16px 24px',
      borderRadius: '8px',
      backgroundColor: '#6366f1',
      color: 'white',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '10000',
      maxWidth: '400px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
    });
    document.body.appendChild(notification);

    // Update button click
    notification.querySelector('#update-btn').onclick = () => {
      pwaInstaller.activateUpdate();
      notification.remove();
    };

    // Dismiss button click
    notification.querySelector('#dismiss-update-btn').onclick = () => {
      notification.remove();
    };
  }
})();
