let audioPresetsData = null;
let sessionPresetsData = null;
let loadPromise = null;

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

async function loadData() {
  const audioUrl = new URL('../data/presets/audio-presets.json', import.meta.url);
  const sessionUrl = new URL('../data/presets/session-presets.json', import.meta.url);

  const [audio, sessions] = await Promise.all([
    fetchJson(audioUrl, { version: 0, generatedAt: null, presets: [] }),
    fetchJson(sessionUrl, { version: 0, generatedAt: null, sessions: [] }),
  ]);

  audioPresetsData = audio;
  sessionPresetsData = sessions;
  rebuildMaps();
}

export function loadPresetCatalog() {
  if (!loadPromise) {
    loadPromise = loadData();
  }
  return loadPromise;
}

function ensureLoaded() {
  if (!audioPresetsData || !sessionPresetsData) {
    console.warn('[Presets] Catalog not loaded yet. Call loadPresetCatalog() first.');
    return false;
  }
  return true;
}

const audioPresetMap = new Map();
const sessionPresetMap = new Map();

function rebuildMaps() {
  audioPresetMap.clear();
  sessionPresetMap.clear();
  if (!ensureLoaded()) return;
  (audioPresetsData.presets || []).forEach((preset) => {
    audioPresetMap.set(preset.id, preset);
  });
  (sessionPresetsData.sessions || []).forEach((session) => {
    sessionPresetMap.set(session.id, session);
  });
}

export function listAudioPresets() {
  if (!ensureLoaded()) return [];
  if (audioPresetMap.size === 0) rebuildMaps();
  return audioPresetsData.presets || [];
}

export function getAudioPreset(id) {
  if (!ensureLoaded()) return null;
  if (audioPresetMap.size === 0) rebuildMaps();
  return audioPresetMap.get(id) || null;
}

export function listSessionPresets() {
  if (!ensureLoaded()) return [];
  if (sessionPresetMap.size === 0) rebuildMaps();
  return sessionPresetsData.sessions || [];
}

export function getSessionPreset(id) {
  if (!ensureLoaded()) return null;
  if (sessionPresetMap.size === 0) rebuildMaps();
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
