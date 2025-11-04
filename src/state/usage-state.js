/**
 * Usage Statistics State Management
 * Tracks user activity and neurosensory stimulation usage
 */

export const generateId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const sessionId = generateId('session');

export const usageStats = {
  sessionStart: Date.now(),
  audioInitializations: 0,
  audioTrackAdds: 0,
  visualAdds: 0,
  trackStops: 0,
  totalNeuroMs: 0,
  audioDurations: new Map(),
  visualDurations: new Map(),
  baseline: {
    audioInitializations: 0,
    audioTrackAdds: 0,
    visualAdds: 0,
    trackStops: 0,
    totalNeuroMs: 0,
    audioDurations: {},
    visualDurations: {},
  },
};

/**
 * Increment audio initialization count
 */
export function incrementAudioInits() {
  usageStats.audioInitializations += 1;
}

/**
 * Increment audio track add count
 */
export function incrementAudioAdds() {
  usageStats.audioTrackAdds += 1;
}

/**
 * Increment visual add count
 */
export function incrementVisualAdds() {
  usageStats.visualAdds += 1;
}

/**
 * Increment track stop count
 */
export function incrementTrackStops() {
  usageStats.trackStops += 1;
}

/**
 * Add duration to total neuro time
 */
export function addNeuroTime(ms) {
  usageStats.totalNeuroMs += ms;
}

/**
 * Record audio duration
 */
export function recordAudioDuration(cueType, durationMs) {
  const current = usageStats.audioDurations.get(cueType) || 0;
  usageStats.audioDurations.set(cueType, current + durationMs);
}

/**
 * Record visual duration
 */
export function recordVisualDuration(cueType, durationMs) {
  const current = usageStats.visualDurations.get(cueType) || 0;
  usageStats.visualDurations.set(cueType, current + durationMs);
}

/**
 * Get usage stats snapshot
 */
export function getUsageStatsSnapshot() {
  return {
    ...usageStats,
    audioDurations: Object.fromEntries(usageStats.audioDurations),
    visualDurations: Object.fromEntries(usageStats.visualDurations),
  };
}
