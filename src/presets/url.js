import { clonePresetDefaults } from './catalog.js';

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;
  return value;
}

export function parsePresetUrlConfig(search = window.location.search) {
  const params = new URLSearchParams(search || '');
  const presetId = params.get('preset') || params.get('audio');
  const sessionId = params.get('session') || params.get('presetSession');
  const overrides = {};

  for (const [key, value] of params.entries()) {
    if (key.startsWith('preset.')) {
      const paramKey = key.slice('preset.'.length);
      overrides[paramKey] = coerceValue(value);
    }
    if (key.startsWith('voice.')) {
      const [, index, param] = key.split('.');
      if (!overrides.voices) overrides.voices = {};
      if (!overrides.voices[index]) overrides.voices[index] = {};
      overrides.voices[index][param] = coerceValue(value);
    }
  }

  const presetDefaults = presetId ? clonePresetDefaults(presetId) : null;
  const mergedPreset = presetDefaults
    ? { ...presetDefaults, ...overrides }
    : null;

  return {
    presetId,
    sessionId,
    overrides,
    presetDefaults,
    mergedPreset,
  };
}
