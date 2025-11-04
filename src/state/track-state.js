/**
 * Track State Management
 * Manages active audio and visual tracks
 */

export const activeAudioTracks = new Map();
export const activeVisualTracks = new Map();

/**
 * Add audio track
 */
export function addAudioTrack(trackId, trackData) {
  activeAudioTracks.set(trackId, trackData);
}

/**
 * Remove audio track
 */
export function removeAudioTrack(trackId) {
  activeAudioTracks.delete(trackId);
}

/**
 * Get audio track
 */
export function getAudioTrack(trackId) {
  return activeAudioTracks.get(trackId);
}

/**
 * Clear all audio tracks
 */
export function clearAudioTracks() {
  activeAudioTracks.clear();
}

/**
 * Add visual track
 */
export function addVisualTrack(trackId, trackData) {
  activeVisualTracks.set(trackId, trackData);
}

/**
 * Remove visual track
 */
export function removeVisualTrack(trackId) {
  activeVisualTracks.delete(trackId);
}

/**
 * Get visual track
 */
export function getVisualTrack(trackId) {
  return activeVisualTracks.get(trackId);
}

/**
 * Clear all visual tracks
 */
export function clearVisualTracks() {
  activeVisualTracks.clear();
}

/**
 * Get all active audio tracks
 */
export function getAllAudioTracks() {
  return Array.from(activeAudioTracks.entries());
}

/**
 * Get all active visual tracks
 */
export function getAllVisualTracks() {
  return Array.from(activeVisualTracks.entries());
}
