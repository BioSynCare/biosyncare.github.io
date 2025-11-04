import { AudioEngine } from '../core/audio-engine.js';

const STORAGE_KEY = 'bscl_engine_selection';

const audioEngines = {
  webaudio: {
    id: 'webaudio',
    name: 'Web Audio API',
    description: 'Native Web Audio implementation',
    category: 'native',
    available: () => typeof AudioContext !== 'undefined',
    async create() {
      return new AudioEngine();
    },
  },
  tone: {
    id: 'tone',
    name: 'Tone.js',
    description: 'Tone.js transport & effects (requires Tone.js bundle)',
    category: 'library',
    available: () => typeof window !== 'undefined' && !!window.Tone,
    async create() {
      if (typeof window === 'undefined' || !window.Tone) {
        throw new Error(
          'Tone.js is not available. Load Tone.js before selecting this engine.'
        );
      }
      const { Tone } = window;
      await Tone.start();
      const toneWrapper = new AudioEngine();
      toneWrapper._tone = Tone;
      return toneWrapper;
    },
  },
};

const visualEngines = {
  vanilla: {
    id: 'vanilla',
    name: 'Canvas / DOM',
    description: 'CSS animations and Canvas 2D',
    available: () => true,
  },
  pixi: {
    id: 'pixi',
    name: 'PixiJS',
    description: 'GPU accelerated 2D rendering',
    available: () => typeof window !== 'undefined' && !!window.PIXI,
  },
  three: {
    id: 'three',
    name: 'Three.js',
    description: '3D WebGL rendering',
    available: () => typeof window !== 'undefined' && !!window.THREE,
  },
  p5: {
    id: 'p5',
    name: 'p5.js',
    description: 'Creative coding toolkit',
    available: () => typeof window !== 'undefined' && !!window.p5,
  },
};

const hapticEngines = {
  native: {
    id: 'native',
    name: 'Navigator Vibration API',
    description: 'Uses navigator.vibrate when available',
    available: () =>
      typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  },
  none: {
    id: 'none',
    name: 'Disabled',
    description: 'No haptic feedback',
    available: () => true,
  },
};

const defaultSelection = {
  audio: 'webaudio',
  visual: 'vanilla',
  haptics: 'native',
};

let cachedSelection = null;

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readSelection() {
  if (cachedSelection) return cachedSelection;
  if (typeof localStorage === 'undefined') {
    cachedSelection = { ...defaultSelection };
    return cachedSelection;
  }
  const stored = safeParse(localStorage.getItem(STORAGE_KEY));
  cachedSelection = { ...defaultSelection, ...(stored || {}) };
  return cachedSelection;
}

function persistSelection(selection) {
  cachedSelection = { ...defaultSelection, ...selection };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSelection));
  }
  return cachedSelection;
}

export function getEngineSelection() {
  return { ...readSelection() };
}

export function setEngineSelection(partial) {
  const merged = { ...readSelection(), ...(partial || {}) };
  return persistSelection(merged);
}

export function getAudioEngineOptions() {
  return Object.values(audioEngines).map((engine) => ({
    id: engine.id,
    name: engine.name,
    description: engine.description,
    available: engine.available(),
    category: engine.category,
  }));
}

export function getVisualEngineOptions() {
  return Object.values(visualEngines).map((engine) => ({
    id: engine.id,
    name: engine.name,
    description: engine.description,
    available: engine.available(),
  }));
}

export function getHapticEngineOptions() {
  return Object.values(hapticEngines).map((engine) => ({
    id: engine.id,
    name: engine.name,
    description: engine.description,
    available: engine.available(),
  }));
}

export async function createAudioEngine(selection = getEngineSelection()) {
  const key = selection.audio;
  const provider = audioEngines[key] || audioEngines.webaudio;
  if (!provider.available()) {
    if (provider === audioEngines.tone) {
      throw new Error('Tone.js engine selected but Tone.js is not loaded.');
    }
    return audioEngines.webaudio.create();
  }
  return provider.create();
}

export function describeEngines(selection = getEngineSelection()) {
  const audio = audioEngines[selection.audio] || audioEngines.webaudio;
  const visual = visualEngines[selection.visual] || visualEngines.vanilla;
  const haptics = hapticEngines[selection.haptics] || hapticEngines.native;

  return {
    audio: {
      id: audio.id,
      name: audio.name,
      available: audio.available(),
      description: audio.description,
    },
    visual: {
      id: visual.id,
      name: visual.name,
      available: visual.available(),
      description: visual.description,
    },
    haptics: {
      id: haptics.id,
      name: haptics.name,
      available: haptics.available(),
      description: haptics.description,
    },
  };
}
