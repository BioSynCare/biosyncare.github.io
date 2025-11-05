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
  clearAudioTracks,
  addVisualTrack,
  removeVisualTrack,
  getVisualTrack,
  clearVisualTracks,
  getAllAudioTracks,
  getAllVisualTracks,
} from './state/track-state.js';

// Maintain backward compatibility with legacy helpers
const generateTrackId = (prefix) => generateId(prefix);

// Audio engine instance
let audioEngine = null;
let audioEngineInitPromise = null;

// User settings
const userSettings = getDefaultPrivacySettings();
const SETTINGS_STORAGE_BASE_KEY = 'biosyncare_user_settings';

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
const usageScopeTabsEl = document.getElementById('usage-scope-tabs');
const usageScopeDescriptionEl = document.getElementById('usage-scope-description');
const usageScopeButtons = usageScopeTabsEl
  ? Array.from(usageScopeTabsEl.querySelectorAll('[data-usage-scope]'))
  : [];
const VALID_USAGE_SCOPES = new Set(['session', 'user', 'global']);
const USAGE_SCOPE_DESCRIPTIONS = {
  session: 'Showing metrics collected in the current neurosensory session only.',
  user: 'Showing lifetime activity for this BioSynCare Lab identity.',
  global: 'Showing community-wide activity across all public sessions.',
};
let activeUsageScope = 'user';
let communityTotalsCache = { eventsRef: null, totals: null };
const collectDataToggle = document.getElementById('toggle-collect-data');
const shareAnonymizedToggle = document.getElementById('toggle-share-anonymized');
const includeCommunityToggle = document.getElementById('toggle-include-community');
const toggleCollectWrapper = document.getElementById('toggle-collect-wrapper');
const toggleShareWrapper = document.getElementById('toggle-share-wrapper');
const toggleCommunityWrapper = document.getElementById('toggle-community-wrapper');
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
      audioDurations: mergeDurationMaps({}, usageStats.audioDurations, snapshot.activeAudio),
      visualDurations: mergeDurationMaps({}, usageStats.visualDurations, snapshot.activeVisual),
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
    activeUsageScope === 'global' ? 'No public audio activity yet.' : 'No audio tracks yet.';
  const visualEmptyMessage =
    activeUsageScope === 'global' ? 'No public visual activity yet.' : 'No visual cues yet.';

  updateDurationList(statAudioDurationList, totals.audioDurations, audioEmptyMessage);
  updateDurationList(statVisualDurationList, totals.visualDurations, visualEmptyMessage);
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
initDiagnostics();
populateEngineSelects();
updateProfileSummary();
applySettingsToUI();
updateUsageView();
renderActivityFeeds();

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
const addAudioBtn = document.getElementById('btn-add-audio');
const stopAllAudioBtn = document.getElementById('btn-stop-all-audio');
const audioActiveList = document.getElementById('audio-active-list');
const audioActiveEmpty = document.getElementById('audio-active-empty');
const audioTrackCount = document.getElementById('audio-track-count');

const visualMenu = document.getElementById('visual-menu');
const visualDescriptionEl = document.getElementById('visual-description');
const addVisualBtn = document.getElementById('btn-add-visual');
const stopAllVisualBtn = document.getElementById('btn-stop-all-visual');
const visualLayerContainer = document.getElementById('visual-layer-container');
const visualActiveList = document.getElementById('visual-active-list');
const visualActiveEmpty = document.getElementById('visual-active-empty');
const visualTrackCount = document.getElementById('visual-track-count');
const visualStatusText = document.getElementById('visual-status-text');

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
};

const ensureAudioEngine = async ({ userInitiated = false } = {}) => {
  if (audioEngine) {
    try {
      await audioEngine.resume?.();
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
    start: () => {
      const freq = 440;
      const nodeId = audioEngine.playWaveform({
        type: 'sine',
        freq,
        gain: 0.2,
      });
      return {
        nodeId,
        detail: '440 Hz reference tone at moderate gain.',
        meta: {
          type: 'waveform',
          wave: 'sine',
          freq,
        },
      };
    },
  },
  binaural: {
    label: 'Binaural beat • Alpha 10Hz',
    description: 'Stereo carriers offset by 10Hz promote relaxed alpha entrainment.',
    start: () => {
      const base = 200;
      const beat = 10;
      const leftFreq = base - beat / 2;
      const rightFreq = base + beat / 2;
      const nodeId = audioEngine.playBinaural({
        base,
        beat,
        duration: 0,
        gain: 0.25,
      });
      return {
        nodeId,
        detail: 'Carrier 200 Hz, beat 10 Hz (alpha window).',
        meta: {
          type: 'binaural',
          base,
          beat,
          carrier: base,
          modulator: beat,
          components: [leftFreq, rightFreq],
        },
      };
    },
  },
  monaural: {
    label: 'Monaural beat • Theta 6Hz',
    description:
      'Summed dual-tone beat for headphones or speakers, aimed at theta relaxation.',
    start: () => {
      const base = 210;
      const beat = 6;
      const lowFreq = Math.max(20, base - beat / 2);
      const highFreq = base + beat / 2;
      const nodeId = audioEngine.playMonaural({
        base,
        beat,
        duration: 0,
        gain: 0.3,
      });
      return {
        nodeId,
        detail: 'Carrier 210 Hz, beat 6 Hz (theta).',
        meta: {
          type: 'monaural',
          base,
          beat,
          carrier: base,
          modulator: beat,
          components: [lowFreq, highFreq],
        },
      };
    },
  },
  isochronic: {
    label: 'Isochronic pulse • 12Hz breathing',
    description: 'Amplitude-gated tone delivering crisp rhythmic cues for breath pacing.',
    start: () => {
      const freq = 180;
      const pulseFreq = 12;
      const nodeId = audioEngine.playIsochronic({
        freq,
        pulseFreq,
        duration: null,
        gain: 0.22,
      });
      return {
        nodeId,
        detail: '180 Hz carrier with 12 Hz gating pulses.',
        meta: {
          type: 'isochronic',
          freq,
          pulseFreq,
        },
      };
    },
  },
  martigli: {
    label: 'Martigli harmonics',
    description:
      'Layered harmonic ratios inspired by Martigli sequences for rich texture.',
    start: () => {
      const fundamental = 220;
      const harmonics = [1, 1.5, 2, 3, 5, 8, 13];
      const nodeId = audioEngine.playMartigliWave({
        fundamental,
        harmonics,
        duration: null,
        gain: 0.14,
        fadeIn: 0.6,
        fadeOut: 0.6,
      });
      return {
        nodeId,
        detail: 'Fundamental 220 Hz with Martigli/Fibonacci ratios.',
        meta: {
          type: 'martigli',
          fundamental,
          harmonics,
        },
      };
    },
  },
  'noise-white': {
    label: 'Noise • White spectrum',
    description: 'Broad-spectrum white noise for masking and focus.',
    start: () => {
      const color = 'white';
      const nodeId = audioEngine.playNoise({
        type: color,
        duration: null,
        gain: 0.18,
      });
      return {
        nodeId,
        detail: 'Flat broadband spectrum.',
        meta: {
          type: 'noise',
          color,
        },
      };
    },
  },
  'noise-pink': {
    label: 'Noise • Pink spectrum',
    description: '1/f pink noise with gentle energy taper, supportive for relaxation.',
    start: () => {
      const color = 'pink';
      const nodeId = audioEngine.playNoise({
        type: color,
        duration: null,
        gain: 0.18,
      });
      return {
        nodeId,
        detail: 'Pink noise (1/f falloff).',
        meta: {
          type: 'noise',
          color,
        },
      };
    },
  },
  'noise-brown': {
    label: 'Noise • Brown spectrum',
    description: 'Low-frequency weighted brown noise ideal for grounding and masking.',
    start: () => {
      const color = 'brown';
      const nodeId = audioEngine.playNoise({
        type: color,
        duration: null,
        gain: 0.22,
      });
      return {
        nodeId,
        detail: 'Brown noise with warm low emphasis.',
        meta: {
          type: 'noise',
          color,
        },
      };
    },
  },
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

const renderAudioTracks = ({ message } = {}) => {
  audioActiveList.innerHTML = '';
  const entries = getAllAudioTracks();
  const count = entries.length;

  audioTrackCount.textContent = `${count} layer${count === 1 ? '' : 's'}`;
  audioActiveEmpty.hidden = count !== 0;
  audioActiveList.hidden = count === 0;

  entries.forEach(([id, track]) => {
    const item = document.createElement('div');
    item.className = 'track-item audio-track-item';

    const info = document.createElement('div');
    info.className = 'flex-1 pr-4';

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

    item.appendChild(info);
    item.appendChild(stopButton);
    audioActiveList.appendChild(item);
  });

  if (statusEl) {
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
  }

  updateUsageView();
};

const renderVisualTracks = ({ message } = {}) => {
  visualActiveList.innerHTML = '';
  const entries = getAllVisualTracks();
  const count = entries.length;

  visualTrackCount.textContent = `${count} layer${count === 1 ? '' : 's'}`;
  visualActiveEmpty.hidden = count !== 0;
  visualActiveList.hidden = count === 0;

  entries.forEach(([id, track]) => {
    const item = document.createElement('div');
    item.className = 'track-item visual-track-item';

    const info = document.createElement('div');
    info.className = 'flex-1 pr-4';

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

    item.appendChild(info);
    item.appendChild(stopButton);
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

audioMenu.addEventListener('change', updateAudioDescription);
visualMenu.addEventListener('change', updateVisualDescription);

addAudioBtn.addEventListener('click', async () => {
  const presetKey = audioMenu.value;
  const preset = audioPresets[presetKey];
  if (!preset) return;

  try {
    const engine = await ensureAudioEngine({ userInitiated: false });
    if (!engine) {
      return;
    }
    await engine.resume?.();
    const result = preset.start();
    if (!result || !result.nodeId) {
      throw new Error('Preset did not return a node id');
    }

    const trackId = generateTrackId('audio');
    const trackMeta = result.meta || { type: presetKey };
    addAudioTrack(trackId, {
      presetKey,
      label: preset.label,
      detail: result.detail || '',
      nodeId: result.nodeId,
      startedAt: Date.now(),
      finalized: false,
      meta: trackMeta,
    });
    incrementAudioAdds();
    recordUsageEvent('audio_add', {
      label: preset.label,
      presetKey,
      category: 'audio',
      count: 1,
      meta: trackMeta,
    });

    const count = getAllAudioTracks().length;
    renderAudioTracks({
      message: `Started ${preset.label}. ${count} audio layer${
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

updateAudioDescription();
updateVisualDescription();
renderAudioTracks();
renderVisualTracks();

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
