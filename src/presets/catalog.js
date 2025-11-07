import { fetchFirebasePresets } from './firebase-adapter.js';

const FALLBACK_AUDIO_PRESETS = [
  {
    id: 'sine',
    label: 'Pure sine • 440Hz',
    folderId: 'core',
    visibility: 'public',
    defaults: {
      frequency: 440,
      gain: 0.2,
      pan: 0,
    },
  },
  {
    id: 'binaural',
    label: 'Binaural beat • Alpha 10Hz',
    folderId: 'core',
    visibility: 'public',
    defaults: {
      frequencyMode: 'carrier-beat',
      base: 200,
      beat: 10,
      gain: 0.25,
    },
  },
  {
    id: 'monaural',
    label: 'Monaural beat • Theta 6Hz',
    folderId: 'core',
    visibility: 'public',
    defaults: {
      base: 210,
      beat: 6,
      gain: 0.3,
    },
  },
  {
    id: 'isochronic',
    label: 'Isochronic pulse • 12Hz breathing',
    folderId: 'core',
    visibility: 'public',
    defaults: {
      freq: 180,
      pulseFreq: 12,
      gain: 0.22,
    },
  },
  {
    id: 'martigli',
    label: 'Martigli harmonics',
    folderId: 'core',
    visibility: 'public',
    defaults: {
      fundamental: 220,
      gain: 0.14,
    },
  },
  { id: 'noise-white', label: 'Noise • White spectrum', folderId: 'core', defaults: { gain: 0.18 } },
  { id: 'noise-pink', label: 'Noise • Pink spectrum', folderId: 'core', defaults: { gain: 0.18 } },
  { id: 'noise-brown', label: 'Noise • Brown spectrum', folderId: 'core', defaults: { gain: 0.22 } },
];

const FALLBACK_SESSION_PRESETS = [
  {
    id: 'alpha_relax_15m',
    label: 'Alpha Relaxation • 15 min',
    folderId: 'core',
    visibility: 'public',
    description: 'Binaural alpha driver with Martigli harmonics and pink noise bed.',
    voices: [],
    symmetryTrack: { enabled: false },
    scheduling: { type: 'one-shot', startUtc: null },
  },
];

let audioPresetsData = null;
let sessionPresetsData = null;
let loadPromise = null;

const audioPresetMap = new Map();
const sessionPresetMap = new Map();

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn('[Presets] Failed to load preset JSON', url, error);
    return fallback;
  }
}

function ensureLoaded() {
  if (!audioPresetsData || !sessionPresetsData) {
    return false;
  }
  return true;
}

function rebuildMaps() {
  if (!ensureLoaded()) return;
  audioPresetMap.clear();
  sessionPresetMap.clear();
  (audioPresetsData.presets || []).forEach((preset) => {
    audioPresetMap.set(preset.id, preset);
  });
  (sessionPresetsData.sessions || []).forEach((session) => {
    sessionPresetMap.set(session.id, session);
  });
  console.info('[Presets] Catalog rebuilt', {
    audioPresets: audioPresetMap.size,
    sessionPresets: sessionPresetMap.size,
  });
}

function mergeCollections(baseList = [], remoteList = []) {
  if (!remoteList.length) return baseList;
  const merged = new Map();
  baseList.forEach((item) => merged.set(item.id, item));
  remoteList.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

async function mergeRemotePresets() {
  try {
    const [remoteAudio, remoteSessions] = await Promise.all([
      fetchFirebasePresets('audio'),
      fetchFirebasePresets('sessions'),
    ]);
    if (remoteAudio.length) {
      audioPresetsData.presets = mergeCollections(audioPresetsData.presets, remoteAudio);
    }
    if (remoteSessions.length) {
      sessionPresetsData.sessions = mergeCollections(
        sessionPresetsData.sessions,
        remoteSessions
      );
    }
    rebuildMaps();
  } catch (error) {
    console.warn('[Presets] Failed to merge Firebase presets', error);
  }
}

async function loadData() {
  const audioUrl = new URL('../data/presets/audio-presets.json', import.meta.url);
  const sessionUrl = new URL('../data/presets/session-presets.json', import.meta.url);

  const [audio, sessions] = await Promise.all([
    fetchJson(audioUrl, { version: 0, generatedAt: null, presets: [] }),
    fetchJson(sessionUrl, { version: 0, generatedAt: null, sessions: [] }),
  ]);

  if (!audio.presets || !audio.presets.length) {
    console.warn('[Presets] Local audio preset catalog missing; using fallback.');
    audio.presets = FALLBACK_AUDIO_PRESETS;
  }
  if (!sessions.sessions || !sessions.sessions.length) {
    console.warn('[Presets] Local session preset catalog missing; using fallback.');
    sessions.sessions = FALLBACK_SESSION_PRESETS;
  }

  audioPresetsData = audio;
  sessionPresetsData = sessions;
  rebuildMaps();
  await mergeRemotePresets();
}

export function loadPresetCatalog() {
  if (!loadPromise) {
    loadPromise = loadData();
  }
  return loadPromise;
}

export function reloadPresetCatalog() {
  loadPromise = null;
  return loadPresetCatalog();
}

export function listAudioPresets() {
  if (!ensureLoaded()) return [];
  return audioPresetsData.presets || [];
}

export function getAudioPreset(id) {
  return audioPresetMap.get(id) || null;
}

export function listSessionPresets() {
  if (!ensureLoaded()) return [];
  return sessionPresetsData.sessions || [];
}

export function getSessionPreset(id) {
  return sessionPresetMap.get(id) || null;
}

export function getPresetVersionInfo() {
  if (!ensureLoaded()) {
    return {
      audio: { version: 0, generatedAt: null },
      sessions: { version: 0, generatedAt: null },
    };
  }
  return {
    audio: {
      version: audioPresetsData.version,
      generatedAt: audioPresetsData.generatedAt,
    },
    sessions: {
      version: sessionPresetsData.version,
      generatedAt: sessionPresetsData.generatedAt,
    },
  };
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function clonePresetDefaults(presetId) {
  const preset = getAudioPreset(presetId);
  if (!preset) return null;
  return clone(preset.defaults);
}

export function cloneSessionPreset(sessionId) {
  const session = getSessionPreset(sessionId);
  if (!session) return null;
  return clone(session);
}
